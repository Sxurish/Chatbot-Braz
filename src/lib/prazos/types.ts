/**
 * Tipos do cálculo de prazos (fase 5). Arquivo sem dependências: serve ao
 * servidor, ao navegador e aos testes.
 */

export type CalendarKind = "feriado" | "suspensao" | "ponto_facultativo" | "feriado_municipal";

/** Linha da tabela forensic_calendar_days. */
export interface CalendarDay {
  id: string;
  court: string;
  /** AAAA-MM-DD */
  day: string;
  kind: CalendarKind;
  /** null = vale para todas as comarcas. */
  comarca: string | null;
  description: string;
  source: string;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
  removed_reason: string | null;
}

export type StartKind = "disponibilizacao" | "intimacao";
export type DeadlineUnit = "uteis" | "corridos";

export interface DeadlineInput {
  start: { kind: StartKind; date: string };
  days: number;
  unit: DeadlineUnit;
  dobro?: boolean;
  comarca?: string;
}

export interface DeadlineStep {
  label: string;
  /** AAAA-MM-DD, ou null quando o passo não é uma data (ex.: prazo em dobro). */
  date: string | null;
  detail: string;
}

export interface SkippedDay {
  date: string;
  reason: string;
  source: string;
}

export interface DeadlineResult {
  finalDate: string;
  publicationDate?: string;
  startDate: string;
  /** Dias contados (já em dobro, se for o caso). */
  countedDays: number;
  steps: DeadlineStep[];
  skipped: SkippedDay[];
  /** Avisos para o advogado (ex.: ano sem calendário cadastrado). */
  warnings: string[];
}

/** Ação registrada no histórico de cálculos. */
export type CalculationAction = "calculo" | "ajuste" | "confirmacao" | "descarte";

/** Linha da tabela deadline_calculations, com nomes para a tela. */
export interface DeadlineCalculation {
  id: string;
  process_id: string | null;
  task_id: string | null;
  publication_id: string | null;
  previous_id: string | null;
  action: CalculationAction;
  input: DeadlineInput;
  result: DeadlineResult & { adjusted?: { from: string; to: string } };
  final_date: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  created_by_name?: string | null;
  process_number?: string | null;
}

export const CALENDAR_KIND_LABELS: Record<CalendarKind, string> = {
  feriado: "Feriado",
  suspensao: "Suspensão de expediente",
  ponto_facultativo: "Ponto facultativo",
  feriado_municipal: "Feriado municipal",
};

export const ACTION_LABELS: Record<CalculationAction, string> = {
  calculo: "Cálculo",
  ajuste: "Ajuste",
  confirmacao: "Confirmado",
  descarte: "Descartado",
};

export const START_KIND_LABELS: Record<StartKind, string> = {
  disponibilizacao: "Disponibilização no DJEN",
  intimacao: "Intimação (ciência)",
};

export const UNIT_LABELS: Record<DeadlineUnit, string> = {
  uteis: "dias úteis",
  corridos: "dias corridos",
};

/** Aviso fixo das telas e do assistente. */
export const DEADLINE_DISCLAIMER = "Sugestão de cálculo. O prazo vale depois da conferência do advogado.";
