import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AssistantSetupError } from "@/lib/assistant/store";
import type {
  DraftData,
  DraftDuplicate,
  DraftKind,
  DraftStatus,
  DraftView,
} from "@/lib/assistant/draft-schema";

/**
 * Persistência dos rascunhos de cadastro. Cada rascunho é de quem o pediu
 * (RLS, e user_id explícito em toda consulta: pelo WhatsApp o cliente é o
 * service role e a RLS não filtra); confirmar troca o status de "pendente" para "confirmando" numa
 * única atualização condicional, para não gravar duas vezes.
 */

export interface DraftRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  kind: DraftKind;
  data: DraftData;
  uncertain: string[];
  duplicates: DraftDuplicate[];
  attachment_id: string | null;
  attachment_name: string | null;
  status: DraftStatus;
  result_link: string | null;
  created_at?: string;
}

const g = globalThis as unknown as { __assistantDrafts?: Map<string, DraftRow> };
function demo() {
  g.__assistantDrafts ??= new Map();
  return g.__assistantDrafts;
}

const SELECT =
  "id, user_id, conversation_id, kind, data, uncertain, duplicates, attachment_id, status, result_link, created_at, attachment:assistant_attachments(file_name)";

type RawRow = Omit<DraftRow, "attachment_name"> & { attachment?: { file_name: string } | { file_name: string }[] | null };

function fromRaw(r: RawRow): DraftRow {
  const att = Array.isArray(r.attachment) ? r.attachment[0] : r.attachment;
  const { attachment: _a, ...rest } = r;
  void _a;
  return { ...rest, attachment_name: att?.file_name ?? null };
}

export function toView(r: DraftRow): DraftView {
  return {
    id: r.id,
    kind: r.kind,
    data: r.data ?? {},
    uncertain: r.uncertain ?? [],
    duplicates: r.duplicates ?? [],
    attachment: r.attachment_id ? { id: r.attachment_id, name: r.attachment_name ?? "arquivo" } : null,
    status: r.status,
    resultLink: r.result_link,
    ...(r.created_at ? { createdAt: r.created_at } : {}),
  };
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find/i.test(error.message ?? ""))
  );
}

export async function createDraft(
  userId: string,
  input: {
    conversationId: string | null;
    kind: DraftKind;
    data: DraftData;
    uncertain: string[];
    duplicates: DraftDuplicate[];
    attachment: { id: string; name: string } | null;
  }
): Promise<DraftView> {
  if (!isSupabaseConfigured()) {
    const row: DraftRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      conversation_id: input.conversationId,
      kind: input.kind,
      data: input.data,
      uncertain: input.uncertain,
      duplicates: input.duplicates,
      attachment_id: input.attachment?.id ?? null,
      attachment_name: input.attachment?.name ?? null,
      status: "pendente",
      result_link: null,
      created_at: new Date().toISOString(),
    };
    demo().set(row.id, row);
    return toView(row);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant_drafts")
    .insert({
      user_id: userId,
      conversation_id: input.conversationId,
      kind: input.kind,
      data: input.data,
      uncertain: input.uncertain,
      duplicates: input.duplicates,
      attachment_id: input.attachment?.id ?? null,
    })
    .select(SELECT)
    .single();
  if (error || !data) {
    if (isMissingTable(error)) throw new AssistantSetupError();
    throw new Error(`Falha ao salvar o rascunho: ${error?.message}`);
  }
  return toView(fromRaw(data as unknown as RawRow));
}

export async function getDraft(userId: string, id: string): Promise<DraftRow | null> {
  if (!isSupabaseConfigured()) {
    const r = demo().get(id);
    return r && r.user_id === userId ? r : null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_drafts")
    .select(SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? fromRaw(data as unknown as RawRow) : null;
}

export async function listDrafts(userId: string, conversationId: string): Promise<DraftView[]> {
  if (!isSupabaseConfigured()) {
    return [...demo().values()]
      .filter((d) => d.user_id === userId && d.conversation_id === conversationId)
      .map(toView);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant_drafts")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return [];
  return ((data ?? []) as unknown as RawRow[]).map((r) => toView(fromRaw(r)));
}

/** Reserva o rascunho para confirmar (pendente → confirmando). Falso se já foi usado. */
export async function claimDraft(userId: string, id: string, data: DraftData): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const r = demo().get(id);
    if (!r || r.user_id !== userId || r.status !== "pendente") return false;
    r.status = "confirmando";
    r.data = data;
    return true;
  }
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("assistant_drafts")
    .update({ status: "confirmando", data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pendente")
    .select("id");
  return (rows?.length ?? 0) > 0;
}

export async function finishDraft(
  userId: string,
  id: string,
  result: { status: "confirmado" | "pendente" | "descartado"; table?: string; resultId?: string; link?: string }
): Promise<void> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const r = demo().get(id);
    if (!r || r.user_id !== userId) return;
    r.status = result.status;
    r.result_link = result.link ?? null;
    return;
  }
  const supabase = await createClient();
  await supabase
    .from("assistant_drafts")
    .update({
      status: result.status,
      result_table: result.table ?? null,
      result_id: result.resultId ?? null,
      result_link: result.link ?? null,
      confirmed_at: result.status === "confirmado" ? now : null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId);
}

/** Descarta um rascunho ainda pendente. */
export async function discardDraft(userId: string, id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const r = demo().get(id);
    if (!r || r.user_id !== userId || r.status !== "pendente") return false;
    r.status = "descartado";
    return true;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_drafts")
    .update({ status: "descartado", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pendente")
    .select("id");
  return (data?.length ?? 0) > 0;
}
