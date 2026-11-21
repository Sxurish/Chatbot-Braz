import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { MinutaRefs, MinutaStatus, MinutaTipo, MinutaView } from "@/lib/minutas/types";

/**
 * Persistência das minutas (tabela assistant_minutas, supabase/assistente-documentos.sql).
 * Cada minuta é de quem a pediu: RLS e user_id explícito em toda consulta.
 * O custo da chamada ao Sonnet fica na própria linha (cost_usd) e entra no
 * limite mensal do assistente (src/lib/minutas/cost.ts).
 * Sem Supabase (modo demonstração): memória do servidor.
 */

export class MinutasSetupError extends Error {
  constructor() {
    super("O banco ainda não está pronto para minutas. Rode o arquivo supabase/assistente-documentos.sql no SQL Editor do Supabase.");
  }
}

interface MinutaRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  tipo: MinutaTipo;
  title: string;
  body: string;
  checks: string[] | null;
  refs: MinutaRefs | null;
  ref_label: string | null;
  attachment_id: string | null;
  status: StoredStatus;
  document_id: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
  updated_at?: string;
}

const COLUMNS =
  "id, user_id, conversation_id, tipo, title, body, checks, refs, ref_label, attachment_id, status, document_id, model, input_tokens, output_tokens, cost_usd, created_at";

const EMPTY_REFS: MinutaRefs = { process_id: null, case_id: null, lead_id: null, client_id: null };

const g = globalThis as unknown as { __assistantMinutas?: Map<string, MinutaRow> };
function demo() {
  g.__assistantMinutas ??= new Map();
  return g.__assistantMinutas;
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find/i.test(error.message ?? ""))
  );
}

function toView(r: MinutaRow): MinutaView {
  return {
    id: r.id,
    tipo: r.tipo,
    title: r.title,
    body: r.body,
    checks: r.checks ?? [],
    refs: { ...EMPTY_REFS, ...(r.refs ?? {}) },
    refLabel: r.ref_label,
    status: r.status === "salva" ? "salva" : "rascunho",
    documentId: r.document_id,
    createdAt: r.created_at,
  };
}

/** Confere, antes de gastar com a IA, que a tabela existe. */
export async function ensureMinutasReady(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  const { error } = await supabase.from("assistant_minutas").select("id").limit(1);
  if (isMissingTable(error)) throw new MinutasSetupError();
  if (error) throw new Error(`Falha ao consultar minutas: ${error.message}`);
}

/** Situação gravada: "falhou" só guarda o custo de uma chamada que não rendeu minuta. */
type StoredStatus = MinutaStatus | "falhou";

export interface NewMinuta {
  conversationId: string | null;
  tipo: MinutaTipo;
  title: string;
  body: string;
  checks: string[];
  refs: MinutaRefs;
  refLabel: string | null;
  attachmentId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  status?: StoredStatus;
}

export async function createMinuta(userId: string, input: NewMinuta): Promise<MinutaView> {
  const row = {
    user_id: userId,
    conversation_id: input.conversationId,
    tipo: input.tipo,
    title: input.title,
    body: input.body,
    checks: input.checks,
    refs: input.refs,
    ref_label: input.refLabel,
    attachment_id: input.attachmentId,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cost_usd: input.costUsd,
    status: input.status ?? "rascunho",
  };
  if (!isSupabaseConfigured()) {
    const full: MinutaRow = {
      ...row,
      id: crypto.randomUUID(),
      document_id: null,
      created_at: new Date().toISOString(),
    };
    demo().set(full.id, full);
    return toView(full);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("assistant_minutas").insert(row).select(COLUMNS).single();
  if (error || !data) {
    if (isMissingTable(error)) throw new MinutasSetupError();
    throw new Error(`Falha ao salvar a minuta: ${error?.message}`);
  }
  return toView(data as unknown as MinutaRow);
}

export async function getMinuta(userId: string, id: string): Promise<MinutaView | null> {
  if (!isSupabaseConfigured()) {
    const r = demo().get(id);
    return r && r.user_id === userId && r.status !== "falhou" ? toView(r) : null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_minutas")
    .select(COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .neq("status", "falhou")
    .maybeSingle();
  return data ? toView(data as unknown as MinutaRow) : null;
}

export async function listMinutas(userId: string, conversationId: string): Promise<MinutaView[]> {
  if (!isSupabaseConfigured()) {
    return [...demo().values()]
      .filter((m) => m.user_id === userId && m.conversation_id === conversationId && m.status !== "falhou")
      .map(toView);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant_minutas")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .neq("status", "falhou")
    .order("created_at", { ascending: true })
    .limit(100);
  // Banco sem assistente-documentos.sql: a conversa abre normalmente, só sem os cartões.
  if (error) return [];
  return ((data ?? []) as unknown as MinutaRow[]).map(toView);
}

/** Grava o texto editado no cartão. */
export async function updateMinutaText(
  userId: string,
  id: string,
  text: { title: string; body: string }
): Promise<boolean> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const r = demo().get(id);
    if (!r || r.user_id !== userId || r.status === "falhou") return false;
    r.title = text.title;
    r.body = text.body;
    r.updated_at = now;
    return true;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_minutas")
    .update({ title: text.title, body: text.body, updated_at: now })
    .eq("id", id)
    .eq("user_id", userId)
    .neq("status", "falhou")
    .select("id");
  return (data?.length ?? 0) > 0;
}

export async function markMinutaSaved(userId: string, id: string, documentId: string | null): Promise<void> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const r = demo().get(id);
    if (!r || r.user_id !== userId) return;
    r.status = "salva";
    r.document_id = documentId;
    return;
  }
  const supabase = await createClient();
  await supabase
    .from("assistant_minutas")
    .update({ status: "salva", document_id: documentId, updated_at: now })
    .eq("id", id)
    .eq("user_id", userId);
}

/** Modo demonstração: custo das minutas do mês corrente (para o limite do assistente). */
export function demoMinutasMonthCost(now = new Date()): number {
  const key = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(d);
  const month = key(now);
  let total = 0;
  for (const m of demo().values()) if (key(new Date(m.created_at)) === month) total += m.cost_usd;
  return total;
}

/** Auditoria (best-effort): geração e salvamento de minutas. */
export async function auditMinuta(
  userId: string,
  action: "assistant_minuta_generate" | "assistant_minuta_save",
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      user_id: userId.startsWith("demo") ? null : userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  } catch {
    // auditoria não bloqueia
  }
}
