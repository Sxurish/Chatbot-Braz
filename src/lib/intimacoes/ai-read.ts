import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ASSISTANT_DOC_MAX_TOKENS,
  ASSISTANT_DOC_MODEL,
  DEFAULT_MONTHLY_LIMIT_USD,
  isAssistantConfigured,
} from "@/lib/assistant/config";
import { addUsage, computeCostUsd, EMPTY_USAGE, getBudgetStatus } from "@/lib/assistant/cost";
import type { ServiceClient } from "@/lib/supabase/request-context";
import { getAiMonthSpendUsd } from "./ai-cost";
import { AI_READING_JSON_SCHEMA, AI_READING_SYSTEM_PROMPT, buildUserMessage, parseAiReading } from "./ai-prompt";
import type { CourtPublication } from "./types";

/**
 * Leitura das intimações pela IA (fase 5, parte B). Chamada pela rotina de
 * hora em hora (src/lib/intimacoes/run.ts), depois da captura.
 *
 * - Mesmo provedor e SDK do assistente; modelo de leitura de documentos
 *   (ASSISTANT_DOC_MODEL, em src/lib/assistant/config.ts).
 * - Mesmo limite de gasto do mês do assistente (Configurações). Sem chave da
 *   IA ou com o limite estourado, a intimação fica "desligada" (sem leitura) e
 *   a conferência manual continua normal. Quando a IA volta, as "desligadas"
 *   dos últimos dias são lidas de novo.
 * - Saída estruturada (JSON) validada com Zod. Resposta inválida: "falhou",
 *   com o motivo curto em ai_error. Nada trava a rotina.
 * - No máximo AI_READ_LIMIT intimações por execução; o resto fica para a próxima.
 * - O custo de cada leitura fica em court_publications.ai_cost_usd.
 */

/** Intimações lidas por execução da rotina. */
export const AI_READ_LIMIT = 10;
/** "Desligadas" capturadas há até tantos dias são lidas de novo quando a IA volta. */
export const AI_RETRY_DISABLED_DAYS = 7;

export const AI_OFF_NO_KEY = "IA não configurada no servidor (falta ANTHROPIC_API_KEY).";
export const AI_OFF_BUDGET = "Limite de gasto do mês com IA atingido (Configurações). Confira manualmente.";
export const AI_OFF_SPEND_UNKNOWN = "Não deu para ler o gasto do mês com IA. Leitura adiada.";

export interface ReadPendingResult {
  read: number;
  failed: number;
  skipped: number;
  disabled: boolean;
  costUsd: number;
}

/** Parte do cliente da Anthropic usada aqui (permite um falso nos testes). */
export interface AiMessagesClient {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal }
    ): PromiseLike<Anthropic.Message>;
  };
}

export interface ReadPendingOptions {
  limit?: number;
  /** Cliente da IA (falso nos testes). Padrão: Anthropic com ANTHROPIC_API_KEY. */
  client?: AiMessagesClient | null;
  now?: Date;
  /** Gasto do mês já conhecido (testes). Padrão: soma no banco. */
  monthSpendUsd?: number;
  /** Limite do mês (testes). Padrão: Configurações do CRM. */
  monthlyLimitUsd?: number;
}

type AnyClient = Pick<SupabaseClient, "from">;
type PubRow = Pick<
  CourtPublication,
  | "id"
  | "tribunal"
  | "organ"
  | "kind"
  | "document_type"
  | "class_name"
  | "process_number"
  | "process_number_masked"
  | "available_date"
  | "publication_date"
  | "parties"
  | "lawyers"
  | "text"
  | "ai_status"
>;

const COLUMNS =
  "id, tribunal, organ, kind, document_type, class_name, process_number, process_number_masked, available_date, publication_date, parties, lawyers, text, ai_status";

/** Tempo máximo de uma leitura. */
const TIMEOUT_MS = 60_000;
/** Tempo total da leitura numa execução (a rotina tem 300 s e ainda manda o WhatsApp). */
export const AI_READ_TIME_BUDGET_MS = 150_000;

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(error.message ?? "");
}

/** Grava o resultado. Banco sem as colunas de custo: grava sem elas. */
async function save(db: AnyClient, id: string, patch: Record<string, unknown>, costPatch: Record<string, unknown>) {
  const first = await db
    .from("court_publications")
    .update({ ...patch, ...costPatch })
    .eq("id", id)
    .eq("status", "para_conferir");
  if (first.error && isMissingColumn(first.error)) {
    await db.from("court_publications").update(patch).eq("id", id).eq("status", "para_conferir");
  } else if (first.error) {
    console.error("[intimacoes ia] falha ao gravar a leitura", first.error.message);
  }
}

async function readMonthlyLimit(db: AnyClient): Promise<number> {
  const { data } = await db.from("settings").select("data").eq("id", 1).maybeSingle();
  const limit = (data as { data?: { assistant?: { monthly_limit_usd?: unknown } } } | null)?.data?.assistant
    ?.monthly_limit_usd;
  const n = Number(limit);
  return Number.isFinite(n) && limit !== null && limit !== undefined ? n : DEFAULT_MONTHLY_LIMIT_USD;
}

/** Marca como "desligada" as intimações ainda pendentes (sem leitura agora). */
async function markDisabled(db: AnyClient, ids: string[], reason: string) {
  if (ids.length === 0) return;
  const { error } = await db
    .from("court_publications")
    .update({ ai_status: "desligada", ai_error: reason })
    .in("id", ids)
    .eq("ai_status", "pendente")
    .eq("status", "para_conferir");
  if (error) console.error("[intimacoes ia] falha ao marcar sem leitura", error.message);
}

function shortError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return "IA ocupada (limite de pedidos). Tente ler de novo mais tarde.";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "Chave da IA inválida ou sem permissão.";
  }
  if (err instanceof Anthropic.APIError) return `A IA não respondeu como esperado (HTTP ${err.status ?? "?"}).`;
  const name = (err as Error)?.name;
  if (name === "TimeoutError" || name === "AbortError") return "A IA demorou demais para responder.";
  return "Falha inesperada na leitura pela IA.";
}

export async function readPendingPublications(
  db: ServiceClient | AnyClient,
  opts: ReadPendingOptions = {}
): Promise<ReadPendingResult> {
  const out: ReadPendingResult = { read: 0, failed: 0, skipped: 0, disabled: false, costUsd: 0 };
  const sb = db as AnyClient;
  const now = opts.now ?? new Date();
  const limit = Math.max(1, Math.min(opts.limit ?? AI_READ_LIMIT, 50));

  const client =
    opts.client !== undefined ? opts.client : isAssistantConfigured() ? (new Anthropic() as unknown as AiMessagesClient) : null;

  // Pendentes primeiro; "desligadas" recentes só quando a IA está disponível.
  const retrySince = new Date(now.getTime() - AI_RETRY_DISABLED_DAYS * 86_400_000).toISOString();
  const query = sb
    .from("court_publications")
    .select(COLUMNS)
    .eq("status", "para_conferir")
    .eq("cancelled", false);
  const { data, error } = await (client
    ? query.or(`ai_status.eq.pendente,and(ai_status.eq.desligada,captured_at.gte."${retrySince}")`)
    : query.eq("ai_status", "pendente")
  )
    .order("available_date", { ascending: true })
    .order("captured_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Não deu para ler as intimações para a IA: ${error.message}`);
  const rows = ((data ?? []) as unknown as PubRow[]).sort(
    (a, b) => Number(a.ai_status !== "pendente") - Number(b.ai_status !== "pendente")
  );
  if (rows.length === 0) {
    out.disabled = !client;
    return out;
  }

  if (!client) {
    await markDisabled(sb, rows.map((r) => r.id), AI_OFF_NO_KEY);
    out.disabled = true;
    out.skipped = rows.length;
    return out;
  }

  // Limite de gasto do mês (o mesmo do assistente). Leitura usa o modelo de documentos.
  let spent: number;
  let monthlyLimit: number;
  try {
    spent = opts.monthSpendUsd ?? (await getAiMonthSpendUsd(sb, now));
    monthlyLimit = opts.monthlyLimitUsd ?? (await readMonthlyLimit(sb));
  } catch {
    // Sem saber o gasto, não gasta: fica pendente para a próxima execução.
    out.disabled = true;
    out.skipped = rows.length;
    console.error("[intimacoes ia]", AI_OFF_SPEND_UNKNOWN);
    return out;
  }

  const model = ASSISTANT_DOC_MODEL;
  const startedAt = Date.now();
  for (const pub of rows) {
    if (Date.now() - startedAt > AI_READ_TIME_BUDGET_MS) {
      // Sem tempo nesta execução: o resto fica pendente para a próxima.
      out.skipped += rows.length - rows.indexOf(pub);
      break;
    }
    if (!getBudgetStatus(spent + out.costUsd, monthlyLimit).allowDocuments) {
      const rest = rows.slice(rows.indexOf(pub)).filter((r) => r.ai_status === "pendente");
      await markDisabled(sb, rest.map((r) => r.id), AI_OFF_BUDGET);
      out.disabled = true;
      out.skipped += rows.length - rows.indexOf(pub);
      break;
    }

    const { content, cut } = buildUserMessage(pub);
    let message: Anthropic.Message;
    try {
      message = await client.messages.create(
        {
          model,
          max_tokens: ASSISTANT_DOC_MAX_TOKENS,
          system: [{ type: "text", text: AI_READING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content }],
          output_config: { effort: "medium", format: { type: "json_schema", schema: AI_READING_JSON_SCHEMA } },
        },
        { signal: AbortSignal.timeout(TIMEOUT_MS) }
      );
    } catch (err) {
      out.failed++;
      await save(sb, pub.id, { ai_status: "falhou", ai_error: shortError(err), ai_read_at: now.toISOString() }, {});
      continue;
    }

    const usage = addUsage(EMPTY_USAGE, message.usage);
    const cost = computeCostUsd(model, usage);
    out.costUsd += cost;
    const costPatch = {
      ai_model: model,
      ai_cost_usd: cost,
      ai_input_tokens: usage.input + usage.cacheRead + usage.cacheWrite,
      ai_output_tokens: usage.output,
    };

    let parsed: ReturnType<typeof parseAiReading>;
    if (message.stop_reason === "refusal") {
      parsed = { ok: false, error: "A IA se recusou a ler esta intimação." };
    } else if (message.stop_reason === "max_tokens") {
      parsed = { ok: false, error: "A resposta da IA veio cortada (tamanho)." };
    } else {
      const raw = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      parsed = parseAiReading(raw, pub.text ?? "", { cut });
    }

    const readAt = new Date().toISOString();
    if (parsed.ok) {
      out.read++;
      await save(
        sb,
        pub.id,
        { ai_status: "pronta", ai_reading: parsed.reading, ai_read_at: readAt, ai_error: null },
        costPatch
      );
    } else {
      out.failed++;
      await save(sb, pub.id, { ai_status: "falhou", ai_error: parsed.error, ai_read_at: readAt }, costPatch);
    }
  }

  out.costUsd = Math.round(out.costUsd * 1_000_000) / 1_000_000;
  return out;
}
