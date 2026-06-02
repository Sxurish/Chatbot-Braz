/**
 * Tipos e labels do módulo de documentos — client-safe.
 */

import type { DocumentCategory } from "@/lib/types";

export type ReviewStatus = "pendente" | "revisado" | "rejeitado";

export interface DocumentRow {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  category: DocumentCategory;
  review_status: ReviewStatus;
  storage_path: string;
  lead_id: string | null;
  lead_name: string | null;
  client_id: string | null;
  client_name: string | null;
  case_id: string | null;
  case_title: string | null;
  process_id: string | null;
  process_number: string | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  created_at: string;
}

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  documento_pessoal: "Documento pessoal",
  contrato: "Contrato",
  comprovante: "Comprovante",
  intimacao: "Intimação",
  processo: "Processo",
  prova: "Prova",
  laudo: "Laudo",
  certidao: "Certidão",
  decisao: "Decisão",
  procuracao: "Procuração",
  honorarios: "Honorários",
  outros: "Outros",
};

export const REVIEW_STATUS_LABELS: Record<
  ReviewStatus,
  { label: string; tone: string }
> = {
  pendente: {
    label: "Pendente",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  revisado: {
    label: "Revisado",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  rejeitado: {
    label: "Rejeitado",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
};

export const DOCUMENTS_PAGE_SIZE = 50;

/** Para o select do filtro "qual tipo de vínculo". */
export type LinkFilter = "lead" | "client" | "case" | "process" | "none" | "";

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
