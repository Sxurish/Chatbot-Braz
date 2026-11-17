/**
 * Tipos das intimações (fase 5, parte B). Arquivo sem dependências: serve ao
 * servidor, ao navegador e aos testes. É o contrato entre a captura no DJEN,
 * a leitura pela IA, a tela de conferência e o WhatsApp.
 *
 * Tabela: public.court_publications (supabase/fase5-intimacoes.sql).
 */

import type { DeadlineUnit, StartKind } from "@/lib/prazos/types";
import type { DjenLawyer, DjenParty } from "@/lib/djen/parse";

export type PublicationStatus = "para_conferir" | "confirmada" | "descartada";

/** Situação da leitura pela IA. "desligada" = IA não configurada ou sem verba. */
export type AiReadingStatus = "pendente" | "pronta" | "falhou" | "desligada";

export type AiConfidence = "alta" | "media" | "baixa";

/** O que a IA entendeu da intimação. Sempre uma sugestão: quem decide é o advogado. */
export interface PublicationAiReading {
  /** Tipo do ato, em palavras simples (ex.: "Intimação para réplica"). */
  actType: string;
  /** Resumo de 1 a 3 frases. */
  summary: string;
  /** A intimação pede alguma providência com prazo? */
  requiresAction: boolean;
  /** Prazo sugerido; null quando o texto não diz e não há regra clara. */
  suggestedDays: number | null;
  suggestedUnit: DeadlineUnit | null;
  /** De onde conta (no DJEN é quase sempre a disponibilização). */
  startKind: StartKind;
  /** Prazo em dobro (Fazenda Pública, Defensoria, litisconsortes com procuradores diferentes em autos físicos). */
  dobro: boolean;
  /** Título curto para a tarefa (ex.: "Réplica à contestação"). */
  taskTitle: string | null;
  /** Base legal citada ou provável (ex.: "CPC, art. 351"). */
  legalBasis: string | null;
  /** Trecho do texto que embasa o prazo, copiado da intimação. */
  quote: string | null;
  /** Campos com dúvida, para a tela destacar: "dias", "unidade", "inicio", "dobro", "processo". */
  uncertain: string[];
  confidence: AiConfidence;
}

/** Linha da tabela court_publications. */
export interface CourtPublication {
  id: string;
  source: "djen";
  /** Chave única (djenKey): evita gravar a mesma intimação duas vezes. */
  external_key: string;
  external_id: string | null;
  hash: string | null;
  /** AAAA-MM-DD: data de disponibilização no DJEN. */
  available_date: string;
  /** AAAA-MM-DD: data de publicação (1º dia útil seguinte), quando calculada. */
  publication_date: string | null;
  tribunal: string | null;
  organ: string | null;
  /** tipoComunicacao do DJEN (ex.: "Intimação"). */
  kind: string | null;
  document_type: string | null;
  class_name: string | null;
  /** Só dígitos (20). */
  process_number: string | null;
  process_number_masked: string | null;
  /** Processo do CRM com o mesmo número CNJ, quando existe. */
  process_id: string | null;
  text: string;
  parties: DjenParty[];
  lawyers: DjenLawyer[];
  link: string | null;
  cancelled: boolean;
  cancel_reason: string | null;

  status: PublicationStatus;
  ai_status: AiReadingStatus;
  ai_reading: PublicationAiReading | null;
  ai_read_at: string | null;
  ai_error: string | null;
  /** Uso da IA nesta leitura (para o limite de gasto do mês). */
  ai_model?: string | null;
  ai_cost_usd?: number | null;
  ai_input_tokens?: number | null;
  ai_output_tokens?: number | null;

  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Motivo do descarte ou observação da conferência. */
  review_note: string | null;
  /** Registro "confirmacao" em deadline_calculations. */
  calculation_id: string | null;
  task_id: string | null;
  movement_id: string | null;

  /** Quando o aviso de conferência foi mandado pelo WhatsApp. */
  whatsapp_notified_at: string | null;
  whatsapp_notified_to: string | null;

  captured_at: string;
  created_at: string;
  updated_at: string;

  /** Só na tela. */
  process_title?: string | null;
  reviewed_by_name?: string | null;
}

/** O que o advogado confirma (tela ou WhatsApp). */
export interface ConfirmPublicationInput {
  publicationId: string;
  /** Quem confirma (users.id). */
  userId: string;
  days: number;
  unit: DeadlineUnit;
  startKind: StartKind;
  dobro: boolean;
  /** Título da tarefa (sem o prefixo "Prazo: "). */
  title: string;
  /** Liga a um processo do CRM (sobrescreve o vínculo automático). */
  processId?: string | null;
  /** Atualiza processes.next_deadline. Padrão: true quando há processo. */
  updateProcessDeadline?: boolean;
  /** Data final escolhida à mão (ajuste). Exige motivo. */
  overrideFinalDate?: string | null;
  overrideReason?: string | null;
  note?: string | null;
  /** "painel" ou "whatsapp", para a auditoria. */
  channel: "painel" | "whatsapp";
}

export type ConfirmPublicationResult =
  | {
      ok: true;
      finalDate: string;
      taskId: string;
      calculationId: string;
      movementId: string | null;
      processId: string | null;
    }
  | { ok: false; error: string };

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  para_conferir: "Para conferir",
  confirmada: "Confirmada",
  descartada: "Descartada",
};

export const AI_STATUS_LABELS: Record<AiReadingStatus, string> = {
  pendente: "Leitura pendente",
  pronta: "Lida pela IA",
  falhou: "Leitura falhou",
  desligada: "Sem leitura da IA",
};

export const AI_CONFIDENCE_LABELS: Record<AiConfidence, string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
};
