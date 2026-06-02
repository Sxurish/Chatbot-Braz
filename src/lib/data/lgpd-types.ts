/**
 * Tipos e labels da área LGPD — client-safe.
 */

export type DsrRequestType =
  | "exclusao"
  | "correcao"
  | "exportacao"
  | "revogacao"
  | "informacao"
  | "outro";

export type DsrStatus = "recebida" | "em_analise" | "concluida" | "negada";

export interface ConsentLogRow {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  consent_type: string;
  consent_given: boolean;
  policy_version: string | null;
  ip_address: string | null;
  user_agent: string | null;
  channel: string | null;
  created_at: string;
}

export interface DsrRow {
  id: string;
  lead_id: string | null;
  requester_name: string;
  requester_email: string | null;
  requester_phone: string | null;
  request_type: DsrRequestType;
  description: string | null;
  status: DsrStatus;
  resolution_notes: string | null;
  received_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export const REQUEST_TYPE_LABELS: Record<DsrRequestType, string> = {
  exclusao: "Exclusão",
  correcao: "Correção",
  exportacao: "Exportação",
  revogacao: "Revogação de consentimento",
  informacao: "Informação / acesso",
  outro: "Outro",
};

export const DSR_STATUS_LABELS: Record<
  DsrStatus,
  { label: string; tone: string }
> = {
  recebida: {
    label: "Recebida",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  em_analise: {
    label: "Em análise",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  concluida: {
    label: "Concluída",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  negada: {
    label: "Negada",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
};

export const DSR_OPEN_STATUSES: DsrStatus[] = ["recebida", "em_analise"];

export const LGPD_PAGE_SIZE = 50;

export interface LgpdMetrics {
  totalConsents: number;
  acceptedConsents: number;
  acceptanceRate: number;
  openDsrs: number;
}
