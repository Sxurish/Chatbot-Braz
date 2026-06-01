/** Canais de mensageria suportados. */
export type Channel = "whatsapp" | "instagram";

/** Mensagem normalizada vinda de qualquer canal externo. */
export interface InboundMessage {
  channel: Channel;
  /** ID externo do contato: telefone (WhatsApp) ou IGSID (Instagram). */
  contactId: string;
  /** Nome do contato, quando o provedor envia. */
  contactName?: string;
  /** Texto da mensagem. */
  text: string;
  /** ID externo da mensagem (para deduplicação). */
  messageId: string;
  /** Timestamp do provedor (epoch em segundos), quando disponível. */
  timestamp?: number;
}

/** Resultado do processamento de uma mensagem de entrada. */
export interface IngestResult {
  /** Texto de resposta a ser enviado de volta ao usuário. */
  reply: string;
  /** Se a conversa exige atendimento humano (handoff). */
  handoff: boolean;
  /** Se a mensagem foi ignorada (duplicada/sem texto). */
  skipped?: boolean;
  leadId?: string;
  conversationId?: string;
}
