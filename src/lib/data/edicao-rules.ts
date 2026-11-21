import { z } from "zod";
import { cnjDigits, formatCnj } from "@/lib/assistant/draft-schema";
import {
  LEGAL_AREAS,
  LEGAL_STATUSES,
  UFS,
  URGENCIES,
  cpfCnpjDigits,
  formatCpfCnpj,
  formatPhone,
  isValidCnpj,
  isValidCpf,
  isValidPhone,
} from "@/lib/data/cadastros-rules";
import { FOLLOW_UP_STATUSES } from "@/lib/list-views/follow-ups";
import { APPOINTMENT_STATUSES } from "@/lib/list-views/agenda";
import type { CommercialStatus, FinancialStatus, TaskStatus, UserRole } from "@/lib/types";

/**
 * Regras de EDITAR, CONCLUIR e REMOVER registros do dia a dia (leads,
 * clientes, casos, tarefas, follow-ups e agenda).
 *
 * Nada aqui grava: só valida formulários, monta as linhas e decide quem pode
 * remover o quê. Quem grava são as ações em edicao-actions.ts. Fica separado
 * para ser testado sem banco.
 *
 * Quem pode o quê (aprovado em 2026-11-21):
 *  - criar e editar: todo perfil ativo, menos o Visualizador;
 *  - remover lead, cliente e caso: só Admin, e só sem vínculo importante;
 *  - remover tarefa, follow-up e compromisso da agenda: quem grava.
 */

// ---------------------------------------------------------------------------
// Listas aceitas pelo banco
// ---------------------------------------------------------------------------
export const COMMERCIAL_STATUSES = [
  "novo_lead",
  "em_qualificacao",
  "aguardando_documentos",
  "consulta_agendada",
  "consulta_realizada",
  "proposta_enviada",
  "negociacao",
  "contrato_enviado",
  "contrato_assinado",
  "cliente_ativo",
  "perdido",
  "nao_qualificado",
] as const satisfies readonly CommercialStatus[];

export const FINANCIAL_STATUSES = [
  "sem_cobranca",
  "consulta_pendente",
  "honorarios_pendentes",
  "entrada_paga",
  "parcelamento_ativo",
  "em_atraso",
  "quitado",
  "cobranca_necessaria",
] as const satisfies readonly FinancialStatus[];

export const TASK_EDIT_STATUSES = [
  "pendente",
  "em_andamento",
  "concluida",
  "cancelada",
] as const satisfies readonly TaskStatus[];

export const APPOINTMENT_MODALITIES = ["online", "presencial", "telefone"] as const;
export const CLIENT_STATUSES = ["ativo", "inativo"] as const;
export const CONVERSATION_STATUSES = ["aberta", "encerrada"] as const;

// ---------------------------------------------------------------------------
// Quem pode remover
// ---------------------------------------------------------------------------
export type RecordKind = "lead" | "client" | "case" | "task" | "follow_up" | "appointment";

/** Cadastros que só o Admin remove (o resto, quem grava). */
const ADMIN_ONLY_REMOVAL: readonly RecordKind[] = ["lead", "client", "case"];

export function canWriteRole(role: UserRole, active = true): boolean {
  return active && role !== "visualizador";
}

export function canRemove(role: UserRole, kind: RecordKind, active = true): boolean {
  if (!canWriteRole(role, active)) return false;
  return ADMIN_ONLY_REMOVAL.includes(kind) ? role === "admin" : true;
}

/** Vínculos que impedem remover um lead, cliente ou caso. */
export interface Links {
  clients?: number;
  cases?: number;
  processes?: number;
  contracts?: number;
  payments?: number;
}

const LINK_WORDS: Record<keyof Links, [string, string]> = {
  clients: ["cliente", "clientes"],
  cases: ["caso", "casos"],
  processes: ["processo", "processos"],
  contracts: ["contrato", "contratos"],
  payments: ["pagamento", "pagamentos"],
};

/**
 * Motivo para NÃO remover (ou null se pode). Um registro com caso, processo,
 * contrato ou pagamento ligado não some: a saída é inativar ou encerrar, para
 * o histórico do escritório continuar inteiro.
 */
export function removalBlockReason(kind: "lead" | "client" | "case", links: Links): string | null {
  const parts = (Object.keys(LINK_WORDS) as (keyof Links)[])
    .filter((k) => (links[k] ?? 0) > 0)
    .map((k) => {
      const n = links[k] ?? 0;
      return `${n} ${LINK_WORDS[k][n === 1 ? 0 : 1]}`;
    });
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
  const way: Record<typeof kind, string> = {
    lead: "Mude o status para “Perdido” ou “Não qualificado”.",
    client: "Use “Inativar”.",
    case: "Mude o status para “Encerrado”.",
  };
  const total = (Object.keys(LINK_WORDS) as (keyof Links)[]).reduce((n, k) => n + (links[k] ?? 0), 0);
  return `Não dá para remover: há ${list} ligado${total > 1 ? "s" : ""}. ${way[kind]}`;
}

// ---------------------------------------------------------------------------
// Ajudantes de formulário
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Modo demonstração: os exemplos usam ids curtos (lead-001, task-1, u1, n3).
const DEMO_ID_RE = /^[a-z][a-z0-9-]{0,39}$/i;

/** Com o banco, só UUID; no modo demonstração, também os ids curtos dos exemplos. */
export function isRecordId(value: string, demo: boolean): boolean {
  return UUID_RE.test(value) || (demo && DEMO_ID_RE.test(value));
}

function get(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

function optText(max: number, msg = `Texto longo demais (máx. ${max}).`) {
  return z
    .string()
    .trim()
    .max(max, msg)
    .optional()
    .transform((v) => (v ? v : undefined));
}

function optId(demo: boolean, msg: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || isRecordId(v, demo), msg);
}

export function idSchema(demo: boolean) {
  return z
    .string({ error: "Registro inválido." })
    .trim()
    .refine((v) => isRecordId(v, demo), "Registro inválido.");
}

export function parseId(formData: FormData, demo: boolean) {
  return idSchema(demo).safeParse(get(formData, "id"));
}

const nameField = z
  .string({ error: "Informe o nome." })
  .trim()
  .min(3, "Informe o nome completo.")
  .max(160, "Nome longo demais (máx. 160).");

const phoneField = optText(30).refine(
  (v) => v === undefined || isValidPhone(v),
  "Telefone inválido. Use DDD + número, ex.: (11) 98765-4321."
);

const emailField = optText(160).refine(
  (v) => v === undefined || z.email().safeParse(v).success,
  "E-mail inválido."
);

const ufField = optText(2)
  .transform((v) => v?.toUpperCase())
  .refine((v) => v === undefined || (UFS as readonly string[]).includes(v), "UF inválida.");

const titleField = z
  .string({ error: "Informe um título." })
  .trim()
  .min(2, "Informe um título.")
  .max(200, "Título longo demais (máx. 200).");

const timeField = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido.");

// ---------------------------------------------------------------------------
// LEAD (edição)
// ---------------------------------------------------------------------------
export function leadEditSchema(demo: boolean) {
  return z
    .object({
      full_name: nameField,
      phone: phoneField,
      email: emailField,
      city: optText(80),
      state: ufField,
      legal_area: z.enum(LEGAL_AREAS, { error: "Área inválida." }),
      case_type: optText(120),
      case_summary: optText(4000, "Resumo longo demais (máx. 4.000)."),
      urgency: z.enum(URGENCIES, { error: "Urgência inválida." }),
      urgency_reason: optText(300),
      commercial_status: z.enum(COMMERCIAL_STATUSES, { error: "Status comercial inválido." }),
      legal_status: z.enum(LEGAL_STATUSES, { error: "Status jurídico inválido." }),
      financial_status: z.enum(FINANCIAL_STATUSES, { error: "Status financeiro inválido." }),
      assigned_to: optId(demo, "Responsável inválido."),
      preferred_contact_time: optText(80),
      process_number: optText(40).refine(
        (v) => v === undefined || cnjDigits(v).length === 20,
        "O número do processo (CNJ) tem 20 dígitos."
      ),
      next_action: optText(300),
    })
    .refine((v) => v.phone || v.email, {
      message: "Informe telefone/WhatsApp ou e-mail.",
      path: ["phone"],
    });
}

export type LeadEditInput = z.output<ReturnType<typeof leadEditSchema>>;

export function parseLeadEdit(formData: FormData, demo: boolean) {
  return leadEditSchema(demo).safeParse({
    full_name: get(formData, "full_name"),
    phone: get(formData, "phone"),
    email: get(formData, "email"),
    city: get(formData, "city"),
    state: get(formData, "state"),
    legal_area: get(formData, "legal_area"),
    case_type: get(formData, "case_type"),
    case_summary: get(formData, "case_summary"),
    urgency: get(formData, "urgency"),
    urgency_reason: get(formData, "urgency_reason"),
    commercial_status: get(formData, "commercial_status"),
    legal_status: get(formData, "legal_status"),
    financial_status: get(formData, "financial_status"),
    assigned_to: get(formData, "assigned_to"),
    preferred_contact_time: get(formData, "preferred_contact_time"),
    process_number: get(formData, "process_number"),
    next_action: get(formData, "next_action"),
  });
}

/** Campos que a edição grava em public.leads (origem e consentimento não mudam aqui). */
export function buildLeadPatch(d: LeadEditInput) {
  return {
    full_name: d.full_name,
    phone: d.phone ? formatPhone(d.phone) : null,
    email: d.email ? d.email.toLowerCase() : null,
    city: d.city ?? null,
    state: d.state ?? null,
    legal_area: d.legal_area,
    case_type: d.case_type ?? null,
    case_summary: d.case_summary ?? null,
    urgency: d.urgency,
    urgency_reason: d.urgency_reason ?? null,
    commercial_status: d.commercial_status,
    legal_status: d.legal_status,
    financial_status: d.financial_status,
    assigned_to: d.assigned_to ?? null,
    preferred_contact_time: d.preferred_contact_time ?? null,
    process_number: d.process_number ? formatCnj(d.process_number) : null,
    has_existing_process: Boolean(d.process_number),
    next_action: d.next_action ?? null,
  };
}

// ---------------------------------------------------------------------------
// CLIENTE (edição)
// ---------------------------------------------------------------------------
export function clientEditSchema() {
  return z.object({
    full_name: nameField,
    cpf_cnpj: optText(20).refine(
      (v) => v === undefined || isValidCpf(v) || isValidCnpj(v),
      "CPF ou CNPJ inválido. Confira os dígitos."
    ),
    phone: phoneField,
    email: emailField,
    city: optText(80),
    state: ufField,
    status: z.enum(CLIENT_STATUSES, { error: "Situação inválida." }),
  });
}

export type ClientEditInput = z.output<ReturnType<typeof clientEditSchema>>;

export function parseClientEdit(formData: FormData) {
  return clientEditSchema().safeParse({
    full_name: get(formData, "full_name"),
    cpf_cnpj: get(formData, "cpf_cnpj"),
    phone: get(formData, "phone"),
    email: get(formData, "email"),
    city: get(formData, "city"),
    state: get(formData, "state"),
    status: get(formData, "status") || "ativo",
  });
}

export function buildClientPatch(d: ClientEditInput) {
  return {
    full_name: d.full_name,
    cpf_cnpj: d.cpf_cnpj ? formatCpfCnpj(cpfCnpjDigits(d.cpf_cnpj)) : null,
    phone: d.phone ? formatPhone(d.phone) : null,
    email: d.email ? d.email.toLowerCase() : null,
    city: d.city ?? null,
    state: d.state ?? null,
    status: d.status,
  };
}

// ---------------------------------------------------------------------------
// CASO (edição)
// ---------------------------------------------------------------------------
export function caseEditSchema(demo: boolean) {
  return z.object({
    client_id: optId(demo, "Cliente inválido."),
    title: z
      .string({ error: "Informe o título do caso." })
      .trim()
      .min(3, "Informe o título do caso.")
      .max(200, "Título longo demais (máx. 200)."),
    legal_area: z.enum(LEGAL_AREAS, { error: "Área inválida." }),
    subarea: optText(120),
    status: z.enum(LEGAL_STATUSES, { error: "Status inválido." }),
    assigned_to: optId(demo, "Responsável inválido."),
    summary: optText(4000, "Resumo longo demais (máx. 4.000)."),
  });
}

export type CaseEditInput = z.output<ReturnType<typeof caseEditSchema>>;

export function parseCaseEdit(formData: FormData, demo: boolean) {
  return caseEditSchema(demo).safeParse({
    client_id: get(formData, "client_id"),
    title: get(formData, "title"),
    legal_area: get(formData, "legal_area"),
    subarea: get(formData, "subarea"),
    status: get(formData, "status"),
    assigned_to: get(formData, "assigned_to"),
    summary: get(formData, "summary"),
  });
}

/** O lead de origem não muda na edição (o caso continua ligado a ele). */
export function buildCasePatch(d: CaseEditInput) {
  return {
    client_id: d.client_id ?? null,
    title: d.title,
    legal_area: d.legal_area,
    subarea: d.subarea ?? null,
    summary: d.summary ?? null,
    status: d.status,
    assigned_to: d.assigned_to ?? null,
  };
}

// ---------------------------------------------------------------------------
// TAREFA, FOLLOW-UP e AGENDA (criar e editar usam o mesmo formulário)
// ---------------------------------------------------------------------------
export function taskSchema(demo: boolean) {
  return z.object({
    title: titleField,
    description: optText(2000),
    due_date: optText(25),
    priority: z.enum(["alta", "media", "baixa"], { error: "Prioridade inválida." }).default("media"),
    status: z.enum(TASK_EDIT_STATUSES, { error: "Status inválido." }).default("pendente"),
    assigned_to: optId(demo, "Responsável inválido."),
    lead_id: optId(demo, "Lead inválido."),
  });
}

export function parseTaskForm(formData: FormData, demo: boolean) {
  return taskSchema(demo).safeParse({
    title: get(formData, "title"),
    description: get(formData, "description"),
    due_date: get(formData, "due_date"),
    priority: get(formData, "priority") || undefined,
    status: get(formData, "status") || undefined,
    assigned_to: get(formData, "assigned_to"),
    lead_id: get(formData, "lead_id"),
  });
}

export function followUpSchema(demo: boolean) {
  return z.object({
    title: titleField,
    description: optText(2000),
    scheduled_at: z.string({ error: "Informe a data." }).trim().min(1, "Informe a data."),
    status: z.enum(FOLLOW_UP_STATUSES, { error: "Status inválido." }).default("pendente"),
    assigned_to: optId(demo, "Responsável inválido."),
    lead_id: optId(demo, "Lead inválido."),
  });
}

export function parseFollowUpForm(formData: FormData, demo: boolean) {
  return followUpSchema(demo).safeParse({
    title: get(formData, "title"),
    description: get(formData, "description"),
    scheduled_at: get(formData, "scheduled_at"),
    status: get(formData, "status") || undefined,
    assigned_to: get(formData, "assigned_to"),
    lead_id: get(formData, "lead_id"),
  });
}

export function appointmentSchema(demo: boolean) {
  return z
    .object({
      title: titleField,
      date: z.string({ error: "Informe a data." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
      start_time: timeField,
      end_time: optText(8).refine((v) => v === undefined || /^\d{2}:\d{2}(:\d{2})?$/.test(v), "Horário de fim inválido."),
      modality: z.enum(APPOINTMENT_MODALITIES, { error: "Modalidade inválida." }).default("online"),
      meeting_link: optText(500).refine(
        (v) => v === undefined || /^https?:\/\//i.test(v),
        "O link precisa começar com http:// ou https://."
      ),
      notes: optText(2000),
      status: z.enum(APPOINTMENT_STATUSES, { error: "Status inválido." }).default("agendada"),
      assigned_to: optId(demo, "Responsável inválido."),
      lead_id: optId(demo, "Lead inválido."),
    })
    .refine((v) => !v.end_time || v.end_time > v.start_time, {
      message: "O fim precisa ser depois do início.",
      path: ["end_time"],
    });
}

export function parseAppointmentForm(formData: FormData, demo: boolean) {
  return appointmentSchema(demo).safeParse({
    title: get(formData, "title"),
    date: get(formData, "date"),
    start_time: get(formData, "start_time"),
    end_time: get(formData, "end_time"),
    modality: get(formData, "modality") || undefined,
    meeting_link: get(formData, "meeting_link"),
    notes: get(formData, "notes"),
    status: get(formData, "status") || undefined,
    assigned_to: get(formData, "assigned_to"),
    lead_id: get(formData, "lead_id"),
  });
}

// ---------------------------------------------------------------------------
// Troca rápida de status (botões "Concluir", "Reabrir", "Inativar"...)
// ---------------------------------------------------------------------------
export const QUICK_STATUSES = {
  task: TASK_EDIT_STATUSES,
  follow_up: FOLLOW_UP_STATUSES,
  appointment: APPOINTMENT_STATUSES,
  client: CLIENT_STATUSES,
  conversation: CONVERSATION_STATUSES,
} as const;

export type QuickKind = keyof typeof QUICK_STATUSES;

export const QUICK_TABLE: Record<QuickKind, string> = {
  task: "tasks",
  follow_up: "follow_ups",
  appointment: "appointments",
  client: "clients",
  conversation: "conversations",
};

export function isQuickStatus(kind: QuickKind, status: string): boolean {
  return (QUICK_STATUSES[kind] as readonly string[]).includes(status);
}
