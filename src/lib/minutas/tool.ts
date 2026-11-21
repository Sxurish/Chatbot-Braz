import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { readAttachment } from "@/lib/assistant/attachments";
import { ASSISTANT_DOC_MODEL, isAssistantConfigured } from "@/lib/assistant/config";
import { addUsage, computeCostUsd, EMPTY_USAGE, getBudgetStatus, type BudgetStatus } from "@/lib/assistant/cost";
import { getMonthSpendUsd } from "@/lib/assistant/store";
import { friendlyApiError } from "@/lib/assistant/turn";
import { defineTool, type AssistantTool, type ToolContext } from "@/lib/assistant/tools";
import { getSettings } from "@/lib/data/settings";
import { gatherMinutaContext, type GatherResult, type MinutaRequestRefs } from "@/lib/minutas/context";
import {
  buildMinutaContent,
  MINUTA_JSON_SCHEMA,
  MINUTA_SYSTEM_PROMPT,
  parseMinutaOutput,
  type MinutaAttachmentFile,
} from "@/lib/minutas/prompt";
import { auditMinuta, createMinuta, ensureMinutasReady, MinutasSetupError } from "@/lib/minutas/store";
import {
  canDraftMinuta,
  MINUTA_ROLE_DENIED,
  MINUTA_TIPO_LABELS,
  MINUTA_TIPOS,
  MINUTA_WARNING,
} from "@/lib/minutas/types";

/**
 * Ferramenta redigir_minuta (só no painel do CRM, nunca no WhatsApp).
 *
 * Reúne os dados do CRM, chama o Sonnet DIRETAMENTE (chamada separada do
 * chat, com prompt de redação próprio), grava a minuta como rascunho
 * editável e mostra o cartão "Minuta". O custo da chamada fica na minuta e
 * entra no limite mensal do assistente. Quando o Sonnet está pausado pelo
 * limite do mês (entre 100% e 150%), a ferramenta não chama a IA.
 */

/** Teto de saída da minuta (não streaming: fica abaixo do tempo de resposta do SDK). */
export const MINUTA_MAX_TOKENS = 16_000;
/** Tempo máximo da redação (a rota do assistente tem 120 s no total). */
const MINUTA_TIMEOUT_MS = 95_000;

/** Parte do cliente da Anthropic usada aqui (permite um falso nos testes). */
export interface MinutaAiClient {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal },
    ): PromiseLike<Anthropic.Message>;
  };
}

export interface MinutaToolDeps {
  getBudget: () => Promise<BudgetStatus>;
  getClient: () => MinutaAiClient | null;
  readFile: (userId: string, attachmentId: string) => Promise<MinutaAttachmentFile | null>;
  gather: (input: MinutaRequestRefs, now: Date) => Promise<GatherResult>;
  ensureReady: () => Promise<void>;
}

export const MINUTA_PAUSED_MESSAGE =
  "As minutas estão pausadas: o gasto com IA do mês passou do limite e a redação (modelo Sonnet) só volta no mês que vem ou se um Admin aumentar o limite em Configurações. Explique isso em uma frase.";

const DEFAULT_DEPS: MinutaToolDeps = {
  async getBudget() {
    const [settings, spent] = await Promise.all([getSettings(), getMonthSpendUsd()]);
    return getBudgetStatus(spent, settings.assistant.monthly_limit_usd);
  },
  getClient: () => (isAssistantConfigured() ? new Anthropic() : null),
  async readFile(userId, attachmentId) {
    const file = await readAttachment(userId, attachmentId);
    return file ? { name: file.row.file_name, mime: file.row.mime_type, base64: file.base64 } : null;
  },
  gather: gatherMinutaContext,
  ensureReady: ensureMinutasReady,
};

const idSchema = (hint: string) => z.string().min(1).max(64).optional().describe(hint);

export const minutaSchema = z.object({
  tipo: z
    .enum(MINUTA_TIPOS)
    .describe(
      "manifestacao = manifestação ou petição simples; notificacao_extrajudicial; comunicacao_cliente = e-mail ou carta ao cliente; resumo_caso = resumo do caso para o advogado.",
    ),
  process_id: idSchema("id do processo, obtido com buscar_processos (ou da tela atual)."),
  case_id: idSchema("id do caso, obtido com buscar_casos."),
  lead_id: idSchema("id do lead, obtido com buscar_leads (ou da tela atual)."),
  client_id: idSchema("id do cliente, obtido com buscar_clientes."),
  instrucoes: z
    .string()
    .max(4000)
    .default("")
    .describe(
      "O que o advogado pediu, com as palavras dele: objetivo da peça, pedidos, tom, fatos e fundamentos que ele mencionou (normas e julgados só se ele citou). Não invente nada aqui.",
    ),
});

type MinutaInput = z.output<typeof minutaSchema>;

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function makeRedigirMinutaTool(overrides: Partial<MinutaToolDeps> = {}): AssistantTool {
  const deps: MinutaToolDeps = { ...DEFAULT_DEPS, ...overrides };
  return defineTool({
    name: "redigir_minuta",
    label: "Redigindo a minuta",
    description:
      "Redige uma MINUTA (rascunho para o advogado revisar) de manifestação ou petição simples, notificação extrajudicial, comunicação ao cliente (e-mail ou carta) ou resumo do caso, com os dados do CRM e o arquivo anexado nesta mensagem, se houver. A minuta aparece num cartão editável com os botões Baixar .docx e Salvar em Documentos. Antes, ache os ids com buscar_processos, buscar_casos, buscar_leads ou buscar_clientes (ao menos um id é obrigatório). Só Admin e Advogado(a) podem usar. Depois de chamar, responda em 1 ou 2 frases, sem repetir o texto da minuta.",
    schema: minutaSchema,
    run: async (input: MinutaInput, ctx: ToolContext) => {
      if (ctx.channel === "whatsapp") {
        return { erro: "Minutas só são feitas pelo CRM. Oriente a pedir em [Assistente](/assistente)." };
      }
      if (!canDraftMinuta(ctx.user.role)) return { erro: MINUTA_ROLE_DENIED };

      const refsIn: MinutaRequestRefs = {
        ...(input.process_id ? { process_id: input.process_id } : {}),
        ...(input.case_id ? { case_id: input.case_id } : {}),
        ...(input.lead_id ? { lead_id: input.lead_id } : {}),
        ...(input.client_id ? { client_id: input.client_id } : {}),
      };
      if (Object.keys(refsIn).length === 0) {
        return {
          erro: "Informe ao menos um id (process_id, case_id, lead_id ou client_id). Procure antes com buscar_processos, buscar_casos, buscar_leads ou buscar_clientes; se não achar, pergunte à pessoa de qual processo ou cliente se trata.",
        };
      }

      const budget = await deps.getBudget();
      if (!budget.allowDocuments) return { erro: MINUTA_PAUSED_MESSAGE, pausado: true };

      const client = deps.getClient();
      if (!client)
        return { erro: "A IA não está configurada no servidor (falta ANTHROPIC_API_KEY). Avise o administrador." };

      try {
        await deps.ensureReady();
      } catch (err) {
        if (err instanceof MinutasSetupError) {
          return { erro: `${err.message} Avise o administrador.` };
        }
        throw err;
      }

      const gathered = await deps.gather(refsIn, ctx.now);
      if (!gathered.ok) return { erro: gathered.error };

      let file: MinutaAttachmentFile | null = null;
      if (ctx.attachment) {
        file = await deps.readFile(ctx.user.id, ctx.attachment.id);
      }

      const model = ASSISTANT_DOC_MODEL;
      let message: Anthropic.Message;
      try {
        message = await client.messages.create(
          {
            model,
            max_tokens: MINUTA_MAX_TOKENS,
            system: [{ type: "text", text: MINUTA_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            messages: [
              {
                role: "user",
                content: buildMinutaContent(
                  { tipo: input.tipo, instrucoes: input.instrucoes, context: gathered.context },
                  file,
                ),
              },
            ],
            output_config: { effort: "medium", format: { type: "json_schema", schema: MINUTA_JSON_SCHEMA } },
          },
          { signal: AbortSignal.timeout(MINUTA_TIMEOUT_MS) },
        );
      } catch (err) {
        console.error("[minutas] redação", err);
        return { erro: `Não consegui redigir a minuta agora. ${friendlyApiError(err)}` };
      }

      const usage = addUsage(EMPTY_USAGE, message.usage);
      const costUsd = computeCostUsd(model, usage);
      const parsed =
        message.stop_reason === "refusal"
          ? ({ ok: false, error: "A IA se recusou a redigir esta minuta." } as const)
          : message.stop_reason === "max_tokens"
            ? ({
                ok: false,
                error: "A minuta ficou grande demais e veio cortada. Peça uma peça mais curta ou por partes.",
              } as const)
            : parseMinutaOutput(textOf(message));

      const base = {
        conversationId: ctx.conversationId ?? null,
        tipo: input.tipo,
        refs: gathered.refs,
        refLabel: gathered.refLabel,
        attachmentId: file ? ctx.attachment!.id : null,
        model,
        inputTokens: usage.input + usage.cacheRead + usage.cacheWrite,
        outputTokens: usage.output,
        costUsd,
      };

      if (!parsed.ok) {
        // Guarda o custo mesmo sem minuta: entra no limite do mês.
        await createMinuta(ctx.user.id, { ...base, title: "", body: "", checks: [], status: "falhou" }).catch(() => {});
        return { erro: parsed.error };
      }

      const minuta = await createMinuta(ctx.user.id, {
        ...base,
        title: parsed.title,
        body: parsed.body,
        checks: parsed.checks,
      });
      await auditMinuta(ctx.user.id, "assistant_minuta_generate", "assistant_minuta", minuta.id, {
        tipo: input.tipo,
        ...gathered.refs,
        model,
        cost_usd: costUsd,
      });
      ctx.emit?.({ type: "minuta", minuta });

      return {
        // Mesmo campo dos rascunhos: liga a minuta à resposta para reabrir o cartão depois.
        rascunho_id: minuta.id,
        tipo: MINUTA_TIPO_LABELS[input.tipo],
        titulo: minuta.title,
        vinculo: gathered.refLabel,
        arquivo_usado: file ? file.name : null,
        pontos_a_conferir: parsed.checks.slice(0, 8),
        situacao:
          "minuta mostrada no cartão Minuta, para o advogado revisar, editar, baixar em .docx ou salvar em Documentos",
        aviso: `${MINUTA_WARNING}. Não repita o texto da minuta no chat: responda em 1 ou 2 frases, citando o que falta conferir.`,
      };
    },
  });
}

export const REDIGIR_MINUTA_TOOL: AssistantTool = makeRedigirMinutaTool();

/** Ferramentas só do painel do CRM (nunca entram no WhatsApp). */
export const MINUTA_TOOLS: AssistantTool[] = [REDIGIR_MINUTA_TOOL];
