import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  CONVERSATION_PAGE_SIZE,
  type ConversationDetail,
  type ConversationRow,
  type MessageRow,
} from "@/lib/data/conversations-types";

export type {
  ConversationDetail,
  ConversationRow,
  MessageRow,
} from "@/lib/data/conversations-types";

export interface ListConversationsOptions {
  channel?: string | null;
  status?: string | null;
  page?: number;
}

export interface ConversationListResult {
  rows: ConversationRow[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

const EMPTY_LIST: ConversationListResult = {
  rows: [],
  total: 0,
  totalPages: 1,
  page: 1,
  pageSize: CONVERSATION_PAGE_SIZE,
};

export async function listConversations(
  options: ListConversationsOptions = {}
): Promise<ConversationListResult> {
  const page = Math.max(1, options.page ?? 1);
  if (!isSupabaseConfigured()) return { ...EMPTY_LIST, page };

  const supabase = createClient();
  let query = supabase
    .from("conversations")
    .select(
      "id, lead_id, channel, status, contact_name, external_contact_id, created_at, updated_at, leads(full_name)",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false });

  if (options.channel) query = query.eq("channel", options.channel);
  if (options.status) query = query.eq("status", options.status);

  const from = (page - 1) * CONVERSATION_PAGE_SIZE;
  const to = from + CONVERSATION_PAGE_SIZE - 1;
  const { data, count, error } = await query.range(from, to);
  if (error || !data) return { ...EMPTY_LIST, page };

  const ids = data.map((c) => c.id);
  const snippets = await fetchLastMessages(supabase, ids);

  const rows: ConversationRow[] = data.map((c) => {
    const leadJoin = c.leads as { full_name?: string | null } | null | undefined;
    const last = snippets.get(c.id);
    return {
      id: c.id,
      lead_id: c.lead_id,
      lead_name: leadJoin?.full_name ?? null,
      channel: c.channel,
      status: c.status,
      contact_name: c.contact_name,
      external_contact_id: c.external_contact_id,
      last_message_at: last?.created_at ?? c.updated_at,
      last_message_snippet: last?.snippet ?? null,
      created_at: c.created_at,
    };
  });

  const total = count ?? 0;
  return {
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / CONVERSATION_PAGE_SIZE)),
    page,
    pageSize: CONVERSATION_PAGE_SIZE,
  };
}

async function fetchLastMessages(
  supabase: ReturnType<typeof createClient>,
  conversationIds: string[]
): Promise<Map<string, { snippet: string; created_at: string }>> {
  const result = new Map<string, { snippet: string; created_at: string }>();
  if (conversationIds.length === 0) return result;

  const { data } = await supabase
    .from("messages")
    .select("conversation_id, content, sender_type, created_at")
    .in("conversation_id", conversationIds)
    .in("sender_type", ["user", "bot"])
    .order("created_at", { ascending: false });

  if (!data) return result;
  for (const m of data) {
    if (!result.has(m.conversation_id)) {
      const text = (m.content ?? "").replace(/\s+/g, " ").trim();
      result.set(m.conversation_id, {
        snippet: text.length > 140 ? `${text.slice(0, 140)}…` : text,
        created_at: m.created_at,
      });
    }
  }
  return result;
}

export async function getConversation(
  id: string
): Promise<ConversationDetail | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, lead_id, channel, status, contact_name, external_contact_id, triage_state, created_at, updated_at, leads(full_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  const leadJoin = data.leads as { full_name?: string | null } | null | undefined;
  return {
    id: data.id,
    lead_id: data.lead_id,
    lead_name: leadJoin?.full_name ?? null,
    channel: data.channel,
    status: data.status,
    contact_name: data.contact_name,
    external_contact_id: data.external_contact_id,
    triage_state:
      (data.triage_state as Record<string, unknown> | null) ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function listMessages(
  conversationId: string
): Promise<MessageRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender_type, content, metadata, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return (data ?? []) as MessageRow[];
}
