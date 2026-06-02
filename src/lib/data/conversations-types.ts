/**
 * Tipos e labels das conversas — client-safe.
 */

export type ConversationChannel = "chatbot" | "whatsapp" | "instagram" | string;
export type ConversationStatus =
  | "aberta"
  | "encerrada"
  | "em_atendimento"
  | string;
export type SenderType = "user" | "bot" | "system";

export interface ConversationRow {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  contact_name: string | null;
  external_contact_id: string | null;
  last_message_at: string;
  last_message_snippet: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  sender_type: SenderType;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ConversationDetail {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  contact_name: string | null;
  external_contact_id: string | null;
  triage_state: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export const CHANNEL_LABELS: Record<string, { label: string; tone: string }> = {
  chatbot: {
    label: "Site (chatbot)",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  whatsapp: {
    label: "WhatsApp",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  instagram: {
    label: "Instagram",
    tone: "border-pink-200 bg-pink-50 text-pink-700",
  },
};

export function channelMeta(channel: string) {
  return (
    CHANNEL_LABELS[channel] ?? {
      label: channel,
      tone: "border-slate-200 bg-slate-50 text-slate-700",
    }
  );
}

export const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  aberta: {
    label: "Aberta",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  em_atendimento: {
    label: "Em atendimento",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  encerrada: {
    label: "Encerrada",
    tone: "border-slate-200 bg-slate-100 text-slate-600",
  },
};

export function statusMeta(status: string) {
  return (
    STATUS_LABELS[status] ?? {
      label: status,
      tone: "border-slate-200 bg-slate-100 text-slate-600",
    }
  );
}

export const CONVERSATION_PAGE_SIZE = 50;
