import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTeamMemberContext } from "@/lib/supabase/request-context";
import type { ToolUseRecord } from "@/lib/assistant/agent";
import type { UsageTotals } from "@/lib/assistant/cost";
import { getIntimacoesMonthCostUsd } from "@/lib/intimacoes/ai-cost";

/**
 * Persistência das conversas do assistente.
 * Com Supabase: tabelas assistant_conversations / assistant_messages, sempre
 * com o login de quem conversa (RLS: cada um só vê as próprias conversas).
 * Pelo WhatsApp (fase 4) o cliente é o service role e a RLS não filtra: por
 * isso toda consulta aqui filtra e grava o user_id explicitamente.
 * Em modo demonstração: memória do servidor (some ao reiniciar).
 */

/** Canal da conversa: painel do CRM ou WhatsApp (fase 4). */
export type ConversationChannel = "painel" | "whatsapp";

export interface StoredConversation {
  id: string;
  title: string | null;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools_used: ToolUseRecord[];
  /** Arquivos enviados junto com a pergunta (fase 2). */
  attachments: { id: string; name: string }[];
  /** Modelo que deu a resposta (só nas respostas do assistente). */
  model?: string | null;
  created_at: string;
}

/** Conversas paradas há mais tempo que isso são apagadas. */
export const RETENTION_DAYS = 90;

export class AssistantSetupError extends Error {
  constructor() {
    super(
      "O banco do assistente ainda não foi preparado. Rode o arquivo supabase/assistente-fase1.sql no SQL Editor do Supabase."
    );
  }
}

// ---------------------------------------------------------------------------
// Modo demonstração (memória)
// ---------------------------------------------------------------------------
interface DemoState {
  conversations: Map<string, StoredConversation & { user_id: string; channel?: ConversationChannel }>;
  messages: Map<string, StoredMessage[]>;
  monthKey: string;
  monthCost: number;
}

const g = globalThis as unknown as { __assistantDemo?: DemoState };
function demo(): DemoState {
  g.__assistantDemo ??= {
    conversations: new Map(),
    messages: new Map(),
    monthKey: "",
    monthCost: 0,
  };
  return g.__assistantDemo;
}

function monthKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  // 42P01: tabela não existe; 42883 / PGRST202: função não existe.
  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    /does not exist|could not find/i.test(error.message ?? "")
  );
}

// ---------------------------------------------------------------------------
// Gasto do mês
// ---------------------------------------------------------------------------
export async function getMonthSpendUsd(): Promise<number> {
  if (!isSupabaseConfigured()) {
    const state = demo();
    if (state.monthKey !== monthKey()) {
      state.monthKey = monthKey();
      state.monthCost = 0;
    }
    return state.monthCost;
  }
  const supabase = await createClient();
  // A leitura das intimações pela IA (fase 5) entra no mesmo limite do mês.
  const intimacoes = getIntimacoesMonthCostUsd(supabase);
  if (getTeamMemberContext()) {
    // Service role (WhatsApp): a função do banco depende do login (auth.uid())
    // e devolveria zero. Soma direto, em páginas.
    return (await sumMonthCostDirect(supabase)) + (await intimacoes);
  }
  const { data, error } = await supabase.rpc("assistant_month_cost");
  if (error) {
    if (isMissingTable(error)) throw new AssistantSetupError();
    throw new Error(`Falha ao ler o gasto do mês: ${error.message}`);
  }
  return Number(data ?? 0) + (await intimacoes);
}

/** Início do mês corrente em São Paulo (sempre -03:00), em ISO. */
export function monthStartIso(date = new Date()): string {
  return new Date(`${monthKey(date)}-01T00:00:00-03:00`).toISOString();
}

async function sumMonthCostDirect(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const since = monthStartIso();
  const PAGE = 1000;
  let total = 0;
  for (let page = 0; page < 200; page++) {
    const { data, error } = await supabase
      .from("assistant_messages")
      .select("cost_usd")
      .gte("created_at", since)
      .gt("cost_usd", 0)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      if (isMissingTable(error)) throw new AssistantSetupError();
      throw new Error(`Falha ao ler o gasto do mês: ${error.message}`);
    }
    const rows = (data ?? []) as { cost_usd: number | string | null }[];
    for (const r of rows) total += Number(r.cost_usd ?? 0);
    if (rows.length < PAGE) break;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------------
export async function listConversations(userId: string): Promise<StoredConversation[]> {
  if (!isSupabaseConfigured()) {
    return [...demo().conversations.values()]
      .filter((c) => c.user_id === userId && (c.channel ?? "painel") === "painel")
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(({ id, title, updated_at }) => ({ id, title, updated_at }));
  }
  const supabase = await createClient();
  // Retenção (LGPD): conversas paradas há mais de 90 dias são apagadas.
  await supabase
    .from("assistant_conversations")
    .delete()
    .eq("user_id", userId)
    .lt("updated_at", new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString());

  const { data, error } = await supabase
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .eq("channel", "painel")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingTable(error)) throw new AssistantSetupError();
    return [];
  }
  return (data ?? []) as StoredConversation[];
}

/** Confere que a conversa existe e é desta pessoa. */
export async function getConversation(
  userId: string,
  conversationId: string
): Promise<StoredConversation | null> {
  if (!isSupabaseConfigured()) {
    const c = demo().conversations.get(conversationId);
    return c && c.user_id === userId ? { id: c.id, title: c.title, updated_at: c.updated_at } : null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as StoredConversation) ?? null;
}

export async function createConversation(
  userId: string,
  title: string,
  channel: ConversationChannel = "painel"
): Promise<string> {
  const cleanTitle = title.replace(/\s+/g, " ").trim().slice(0, 80) || "Nova conversa";
  if (!isSupabaseConfigured()) {
    const id = crypto.randomUUID();
    demo().conversations.set(id, {
      id,
      user_id: userId,
      title: cleanTitle,
      channel,
      updated_at: new Date().toISOString(),
    });
    demo().messages.set(id, []);
    return id;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant_conversations")
    .insert({ user_id: userId, title: cleanTitle, channel })
    .select("id")
    .single();
  if (error || !data) {
    if (isMissingTable(error)) throw new AssistantSetupError();
    throw new Error(`Falha ao criar a conversa: ${error?.message}`);
  }
  return data.id as string;
}

/**
 * Conversa mais recente desta pessoa no canal, se teve movimento depois de
 * `since` (WhatsApp: uma conversa contínua, renovada após 12 horas paradas).
 */
export async function findRecentConversation(
  userId: string,
  channel: ConversationChannel,
  since: Date
): Promise<StoredConversation | null> {
  const sinceIso = since.toISOString();
  if (!isSupabaseConfigured()) {
    const found = [...demo().conversations.values()]
      .filter((c) => c.user_id === userId && (c.channel ?? "painel") === channel && c.updated_at >= sinceIso)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    return found ? { id: found.id, title: found.title, updated_at: found.updated_at } : null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new AssistantSetupError();
    return null;
  }
  return (data as StoredConversation) ?? null;
}

export async function deleteConversation(userId: string, conversationId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const c = demo().conversations.get(conversationId);
    if (!c || c.user_id !== userId) return false;
    demo().conversations.delete(conversationId);
    demo().messages.delete(conversationId);
    return true;
  }
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("assistant_conversations")
    .delete({ count: "exact" })
    .eq("id", conversationId)
    .eq("user_id", userId);
  return !error && (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------
export async function listMessages(
  userId: string,
  conversationId: string,
  limit = 100
): Promise<StoredMessage[]> {
  if (!isSupabaseConfigured()) {
    const c = demo().conversations.get(conversationId);
    if (!c || c.user_id !== userId) return [];
    return (demo().messages.get(conversationId) ?? []).slice(-limit);
  }
  const supabase = await createClient();
  const query = (columns: string) =>
    supabase
      .from("assistant_messages")
      .select(columns)
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
  let { data, error } = await query("id, role, content, tools_used, attachments, model, created_at");
  if (error?.code === "42703") {
    // Banco ainda sem a fase 2 (coluna attachments): segue sem os anexos.
    ({ data, error } = await query("id, role, content, tools_used, created_at"));
  }
  return ((data ?? []) as unknown as StoredMessage[])
    .map((m) => ({ ...m, attachments: m.attachments ?? [] }))
    .reverse();
}

export interface NewMessage {
  role: "user" | "assistant";
  content: string;
  pageContext?: string | null;
  toolsUsed?: ToolUseRecord[];
  attachments?: { id: string; name: string }[];
  model?: string;
  usage?: UsageTotals;
  costUsd?: number;
}

export async function saveMessage(
  userId: string,
  conversationId: string,
  msg: NewMessage
): Promise<void> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const state = demo();
    const list = state.messages.get(conversationId);
    const conv = state.conversations.get(conversationId);
    if (!list || !conv || conv.user_id !== userId) return;
    list.push({
      id: crypto.randomUUID(),
      role: msg.role,
      content: msg.content,
      tools_used: msg.toolsUsed ?? [],
      attachments: msg.attachments ?? [],
      model: msg.model ?? null,
      created_at: now,
    });
    conv.updated_at = now;
    if (msg.costUsd) {
      if (state.monthKey !== monthKey()) {
        state.monthKey = monthKey();
        state.monthCost = 0;
      }
      state.monthCost += msg.costUsd;
    }
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("assistant_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: msg.role,
    content: msg.content,
    page_context: msg.pageContext ?? null,
    tools_used: msg.toolsUsed ?? [],
    model: msg.model ?? null,
    input_tokens: msg.usage?.input ?? 0,
    output_tokens: msg.usage?.output ?? 0,
    cache_read_tokens: msg.usage?.cacheRead ?? 0,
    cache_write_tokens: msg.usage?.cacheWrite ?? 0,
    cost_usd: msg.costUsd ?? 0,
    // Só manda a coluna nova quando há anexo (banco sem a fase 2 continua funcionando).
    ...(msg.attachments?.length ? { attachments: msg.attachments } : {}),
  });
  if (error) {
    console.error("[assistente] falha ao gravar mensagem", error.message);
    return;
  }
  await supabase
    .from("assistant_conversations")
    .update({ updated_at: now })
    .eq("id", conversationId)
    .eq("user_id", userId);
}
