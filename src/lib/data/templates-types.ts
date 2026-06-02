/**
 * Tipos e labels da automação documental — client-safe.
 */

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  storage_path: string;
  placeholders: string[];
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  procuracao: "Procuração",
  contrato: "Contrato",
  declaracao: "Declaração",
  peticao: "Petição",
  notificacao: "Notificação",
  outros: "Outros",
};

export const TEMPLATE_BUCKET = "document_templates";
export const MAX_TEMPLATE_SIZE = 5 * 1024 * 1024; // 5 MB
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Placeholders pré-definidos que o gerador resolve sozinho.
 * Tudo que não estiver aqui vira campo manual no dialog.
 */
export const AUTO_FILLED_PLACEHOLDERS = [
  "cliente.nome",
  "cliente.email",
  "cliente.telefone",
  "cliente.cidade",
  "cliente.estado",
  "lead.nome",
  "lead.telefone",
  "lead.email",
  "lead.area",
  "lead.resumo",
  "caso.titulo",
  "escritorio.nome",
  "escritorio.oab",
  "escritorio.cnpj",
  "escritorio.endereco",
  "escritorio.telefone",
  "escritorio.email",
  "data.hoje",
  "data.hoje_extenso",
];

export function isAutoFilled(key: string): boolean {
  return AUTO_FILLED_PLACEHOLDERS.includes(key);
}
