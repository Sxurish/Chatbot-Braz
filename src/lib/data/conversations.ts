import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ChatMessage } from "@/lib/types";

/** Resumo de conversa para a listagem (/conversas). */
export interface ConversationSummaryRow {
  id: string;
  lead_id: string | null;
  channel: string;
  status: string;
  contact_name: string | null;
  external_contact_id: string | null;
  created_at: string;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  message_count: number;
}

/** Conversas mockadas para o modo demonstração. */
const MOCK_CONVERSATIONS: ConversationSummaryRow[] = [
  {
    id: "conv-demo-1",
    lead_id: "lead-001",
    channel: "whatsapp",
    status: "aberta",
    contact_name: "Carlos Henrique Souza",
    external_contact_id: "5511988771234",
    created_at: "2026-05-30T03:18:00Z",
    updated_at: "2026-05-30T03:25:00Z",
    last_message:
      "Como pode haver urgência, seu atendimento será marcado como prioritário e encaminhado para a equipe.",
    last_message_at: "2026-05-30T03:25:00Z",
    message_count: 6,
  },
  {
    id: "conv-demo-2",
    lead_id: "lead-007",
    channel: "instagram",
    status: "aberta",
    contact_name: "Distribuidora Nova Era",
    external_contact_id: "17841400000000000",
    created_at: "2026-05-22T13:25:00Z",
    updated_at: "2026-05-22T13:40:00Z",
    last_message:
      "Posso registrar as informações para que a equipe avalie a adequação à LGPD.",
    last_message_at: "2026-05-22T13:40:00Z",
    message_count: 8,
  },
  {
    id: "conv-demo-3",
    lead_id: "lead-002",
    channel: "web",
    status: "encerrada",
    contact_name: "Fernanda Lima",
    external_contact_id: null,
    created_at: "2026-05-28T14:05:00Z",
    updated_at: "2026-05-28T14:20:00Z",
    last_message: "Obrigado pelas informações. Seu atendimento foi registrado.",
    last_message_at: "2026-05-28T14:20:00Z",
    message_count: 5,
  },
];

export async function listConversations(): Promise<ConversationSummaryRow[]> {
  if (!isSupabaseConfigured()) return MOCK_CONVERSATIONS;

  const supabase = createClient();
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select(
      "id, lead_id, channel, status, contact_name, external_contact_id, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error || !conversations) return MOCK_CONVERSATIONS;

  // Enriquecimento com a última mensagem de cada conversa.
  const rows = await Promise.all(
    conversations.map(async (c) => {
      const { data: msgs } = await supabase
        .from("messages")
        .select("content, created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", c.id);

      return {
        ...c,
        last_message: msgs?.[0]?.content ?? null,
        last_message_at: msgs?.[0]?.created_at ?? null,
        message_count: count ?? 0,
      } as ConversationSummaryRow;
    })
  );

  return rows;
}

export async function getConversationMessages(
  conversationId: string
): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_type, content, metadata, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return (data as ChatMessage[]) ?? [];
}
