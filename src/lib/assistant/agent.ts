import type Anthropic from "@anthropic-ai/sdk";
import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_MAX_TOOL_ROUNDS,
} from "@/lib/assistant/config";
import { addUsage, EMPTY_USAGE, type UsageTotals } from "@/lib/assistant/cost";
import {
  executeTool,
  toApiTools,
  type AssistantTool,
  type ToolContext,
} from "@/lib/assistant/tools";

/** Parte do cliente da Anthropic que o assistente usa (permite um cliente falso nos testes). */
export interface MessageStreamLike {
  on(event: "text", listener: (delta: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Message>;
}

export interface MessagesClientLike {
  messages: {
    stream(
      params: Anthropic.MessageStreamParams,
      options?: { signal?: AbortSignal }
    ): MessageStreamLike;
  };
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string };

export interface ToolUseRecord {
  name: string;
  ok: boolean;
  /** Rascunho de cadastro criado por esta chamada (cartão de confirmação). */
  draftId?: string;
  /** Links de registros devolvidos pela ferramenta (para conferência). */
  links: string[];
}

export interface AgentResult {
  text: string;
  toolsUsed: ToolUseRecord[];
  usage: UsageTotals;
  stopReason: Anthropic.StopReason | null;
}

export interface RunAgentOptions {
  client: MessagesClientLike;
  model: string;
  system: Anthropic.TextBlockParam[];
  tools: AssistantTool[];
  messages: Anthropic.MessageParam[];
  ctx: ToolContext;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  maxRounds?: number;
  /** Esforço de raciocínio: "low" nas consultas, "medium" na leitura de documentos. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

/** Limite de caracteres de um resultado de ferramenta enviado ao modelo. */
const MAX_TOOL_RESULT_CHARS = 24_000;

function collectLinks(value: unknown, out: Set<string>, depth = 0) {
  if (depth > 6 || out.size >= 30 || value == null) return;
  if (Array.isArray(value)) {
    for (const v of value) collectLinks(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "link" && typeof v === "string" && v.startsWith("/")) out.add(v);
      else collectLinks(v, out, depth + 1);
    }
  }
}

function serialize(result: unknown): string {
  const json = JSON.stringify(result ?? null);
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  return `${json.slice(0, MAX_TOOL_RESULT_CHARS)}… [resultado cortado: peça um filtro mais específico]`;
}

/**
 * Laço de conversa com ferramentas: chama o modelo em streaming, executa as
 * ferramentas pedidas (só leitura) e devolve os resultados até o modelo
 * terminar a resposta. Na última rodada as ferramentas são desligadas para
 * garantir uma resposta final.
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const maxRounds = opts.maxRounds ?? ASSISTANT_MAX_TOOL_ROUNDS;
  const apiTools = toApiTools(opts.tools);
  const messages: Anthropic.MessageParam[] = [...opts.messages];
  const toolsUsed: ToolUseRecord[] = [];
  let usage = EMPTY_USAGE;
  let text = "";
  let stopReason: Anthropic.StopReason | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const lastRound = round === maxRounds - 1;
    const stream = opts.client.messages.stream(
      {
        model: opts.model,
        max_tokens: opts.maxTokens ?? ASSISTANT_MAX_TOKENS,
        system: opts.system,
        tools: apiTools,
        ...(lastRound ? { tool_choice: { type: "none" as const } } : {}),
        // Consultas simples: pouco raciocínio, resposta rápida e barata.
        output_config: { effort: opts.effort ?? "low" },
        messages,
      },
      { signal: opts.signal }
    );

    let roundHasText = false;
    stream.on("text", (delta) => {
      if (!delta) return;
      if (!roundHasText && text.length > 0) {
        text += "\n\n";
        opts.onEvent?.({ type: "text", delta: "\n\n" });
      }
      roundHasText = true;
      text += delta;
      opts.onEvent?.({ type: "text", delta });
    });

    const message = await stream.finalMessage();
    usage = addUsage(usage, message.usage);
    stopReason = message.stop_reason;

    if (message.stop_reason === "refusal") {
      const note = "Não posso ajudar com esse pedido.";
      text = text ? `${text}\n\n${note}` : note;
      opts.onEvent?.({ type: "text", delta: text === note ? note : `\n\n${note}` });
      break;
    }

    if (message.stop_reason !== "tool_use") {
      if (message.stop_reason === "max_tokens") {
        const note = "\n\n_(Resposta interrompida por tamanho. Peça um recorte menor.)_";
        text += note;
        opts.onEvent?.({ type: "text", delta: note });
      }
      break;
    }

    // O modelo pediu ferramentas: devolve o conteúdo intacto (inclui o raciocínio).
    messages.push({ role: "assistant", content: message.content });
    const calls = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    const results = await Promise.all(
      calls.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
        const tool = opts.tools.find((t) => t.name === call.name);
        opts.onEvent?.({ type: "tool", name: call.name, label: tool?.label ?? "Consultando o CRM" });
        // Ferramenta fora da lista desta pessoa (ex.: financeiro sem ser Admin) é negada.
        const outcome = tool
          ? await executeTool(call.name, call.input, opts.ctx, opts.tools)
          : ({ ok: false, error: "Ferramenta não disponível para este usuário." } as const);
        const links = new Set<string>();
        if (outcome.ok) collectLinks(outcome.result, links);
        const draftId =
          outcome.ok && outcome.result && typeof outcome.result === "object"
            ? (outcome.result as { rascunho_id?: unknown }).rascunho_id
            : undefined;
        toolsUsed.push({
          name: call.name,
          ok: outcome.ok,
          links: [...links],
          ...(typeof draftId === "string" ? { draftId } : {}),
        });
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: outcome.ok ? serialize(outcome.result) : outcome.error,
          ...(outcome.ok ? {} : { is_error: true }),
        };
      })
    );

    messages.push({ role: "user", content: results });
  }

  if (!text.trim()) {
    text = "Não consegui montar uma resposta agora. Tente perguntar de outro jeito.";
    opts.onEvent?.({ type: "text", delta: text });
  }

  return { text, toolsUsed, usage, stopReason };
}

/**
 * Monta o histórico enviado ao modelo: só texto, começando por "user" e
 * alternando papéis (mensagens seguidas do mesmo papel são juntadas).
 */
export function buildHistory(
  previous: { role: "user" | "assistant"; content: string }[],
  current: string
): Anthropic.MessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of [...previous, { role: "user" as const, content: current }]) {
    const content = m.content.trim();
    if (!content) continue;
    if (out.length === 0 && m.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  return out;
}
