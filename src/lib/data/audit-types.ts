/**
 * Tipos, labels e mapeamento de entidades dos logs de auditoria.
 * Client-safe — não importar `server-only`.
 */

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Cor + rótulo legível das ações conhecidas. */
export const ACTION_LABELS: Record<
  string,
  { label: string; tone: "create" | "update" | "delete" | "toggle" | "convert" }
> = {
  create: { label: "Criou", tone: "create" },
  update: { label: "Atualizou", tone: "update" },
  delete: { label: "Excluiu", tone: "delete" },
  convert_to_client: { label: "Converteu em cliente", tone: "convert" },
  create_kb: { label: "Criou entrada", tone: "create" },
  update_kb: { label: "Editou entrada", tone: "update" },
  toggle_kb: { label: "Ativou/desativou", tone: "toggle" },
  delete_kb: { label: "Excluiu entrada", tone: "delete" },
  update_office: { label: "Atualizou escritório", tone: "update" },
  update_ai: { label: "Atualizou IA", tone: "update" },
  create_dsr: { label: "Registrou solicitação LGPD", tone: "create" },
  update_dsr: { label: "Atualizou solicitação LGPD", tone: "update" },
  download_doc: { label: "Baixou documento", tone: "update" },
  update_doc_review: { label: "Atualizou revisão de documento", tone: "update" },
  delete_doc: { label: "Excluiu documento", tone: "delete" },
  create_process: { label: "Criou processo", tone: "create" },
  update_process: { label: "Atualizou processo", tone: "update" },
  delete_process: { label: "Excluiu processo", tone: "delete" },
  create_contract: { label: "Criou contrato", tone: "create" },
  update_contract: { label: "Atualizou contrato", tone: "update" },
  delete_contract: { label: "Excluiu contrato", tone: "delete" },
  create_payment: { label: "Criou pagamento", tone: "create" },
  update_payment: { label: "Atualizou pagamento", tone: "update" },
  delete_payment: { label: "Excluiu pagamento", tone: "delete" },
};

export function actionMeta(action: string) {
  return (
    ACTION_LABELS[action] ?? { label: action, tone: "update" as const }
  );
}

export const ACTION_TONE_CLASS: Record<
  "create" | "update" | "delete" | "toggle" | "convert",
  string
> = {
  create: "border-emerald-200 bg-emerald-50 text-emerald-700",
  update: "border-sky-200 bg-sky-50 text-sky-700",
  delete: "border-red-200 bg-red-50 text-red-700",
  toggle: "border-amber-200 bg-amber-50 text-amber-700",
  convert: "border-violet-200 bg-violet-50 text-violet-700",
};

/** Mapeia entity_type para URL navegável e rótulo legível. */
export interface EntityInfo {
  label: string;
  href: (id: string | null) => string | null;
}

export const ENTITY_INFO: Record<string, EntityInfo> = {
  lead: {
    label: "Lead",
    href: (id) => (id ? `/leads/${id}` : "/leads"),
  },
  task: {
    label: "Tarefa",
    href: () => "/tarefas",
  },
  follow_up: {
    label: "Follow-up",
    href: () => "/follow-up",
  },
  appointment: {
    label: "Agendamento",
    href: () => "/agenda",
  },
  case: {
    label: "Caso",
    href: () => "/casos",
  },
  client: {
    label: "Cliente",
    href: () => "/clientes",
  },
  contract: {
    label: "Contrato",
    href: () => "/contratos",
  },
  process: {
    label: "Processo",
    href: () => "/processos",
  },
  knowledge_base: {
    label: "Base de conhecimento",
    href: () => "/base-conhecimento",
  },
  settings: {
    label: "Configurações",
    href: () => "/configuracoes",
  },
  dsr_request: {
    label: "Solicitação LGPD",
    href: () => "/lgpd",
  },
  document: {
    label: "Documento",
    href: () => "/documentos",
  },
  payment: {
    label: "Pagamento",
    href: () => "/financeiro",
  },
};

export function entityInfo(type: string | null): EntityInfo {
  if (!type) return { label: "—", href: () => null };
  return ENTITY_INFO[type] ?? { label: type, href: () => null };
}

export const AUDIT_PAGE_SIZE = 50;
