import { z } from "zod";
import { LEGAL_AREA_LABELS, LEGAL_STATUS_LABELS, URGENCY_LABELS } from "@/lib/constants";
import { CATEGORY_LABELS } from "@/lib/data/documents-types";
import type { DocumentCategory, LegalArea, LegalStatus, Urgency } from "@/lib/types";

/**
 * Rascunhos de cadastro do assistente (fase 2).
 *
 * Este arquivo é usado no servidor e no navegador: define os tipos de
 * rascunho, os campos que o cartão de confirmação mostra, a validação final
 * (Zod) e a conversão do rascunho nas linhas gravadas no banco. Nada aqui
 * grava: quem grava é a rota de confirmação, depois do clique em Confirmar.
 */

export const DRAFT_KINDS = ["processo", "lead", "tarefa", "prazo", "compromisso", "documento"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export type LinkEntity = "case" | "lead" | "client" | "process" | "user";

export type FieldType = "text" | "textarea" | "date" | "datetime" | "time" | "select" | "checkbox" | "link";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  entity?: LinkEntity;
  required?: boolean;
  placeholder?: string;
  /** Só aparece quando há arquivo anexado ao rascunho. */
  onlyWithAttachment?: boolean;
}

export type DraftData = Record<string, string | boolean | null | undefined>;

export type DraftStatus = "pendente" | "confirmando" | "confirmado" | "descartado";

export interface DraftDuplicate {
  label: string;
  reason: string;
  link: string;
}

/** O que o navegador recebe de um rascunho. */
export interface DraftView {
  id: string;
  kind: DraftKind;
  data: DraftData;
  uncertain: string[];
  duplicates: DraftDuplicate[];
  attachment: { id: string; name: string } | null;
  status: DraftStatus;
  resultLink: string | null;
}

const opts = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

const PRIORITY_OPTIONS = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
];

const SOURCE_OPTIONS = [
  { value: "indicacao", label: "Indicação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telefone", label: "Telefone" },
  { value: "instagram", label: "Instagram" },
  { value: "site", label: "Site" },
  { value: "google", label: "Google" },
  { value: "chatbot", label: "Chatbot" },
  { value: "outro", label: "Outro" },
];

const MODALITY_OPTIONS = [
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online" },
  { value: "telefone", label: "Telefone" },
];

const ATTACH_FIELDS: FieldDef[] = [
  { key: "attach_file", label: "Anexar o arquivo enviado a este cadastro", type: "checkbox", onlyWithAttachment: true },
  {
    key: "attach_category",
    label: "Categoria do arquivo",
    type: "select",
    options: opts(CATEGORY_LABELS),
    onlyWithAttachment: true,
  },
];

export const DRAFT_DEFS: Record<DraftKind, { title: string; fields: FieldDef[] }> = {
  processo: {
    title: "Novo processo",
    fields: [
      { key: "process_number", label: "Número do processo (CNJ)", type: "text", placeholder: "0000000-00.0000.0.00.0000" },
      { key: "court", label: "Tribunal", type: "text", placeholder: "TJSP" },
      { key: "jurisdiction", label: "Vara / comarca", type: "text" },
      { key: "class", label: "Classe", type: "text" },
      { key: "subject", label: "Assunto", type: "text" },
      { key: "status", label: "Situação", type: "select", options: opts(LEGAL_STATUS_LABELS) },
      { key: "next_deadline", label: "Próximo prazo", type: "date" },
      { key: "case_id", label: "Caso", type: "link", entity: "case" },
      { key: "new_case_title", label: "Ou criar caso novo com o título", type: "text" },
      { key: "legal_area", label: "Área do caso novo", type: "select", options: opts(LEGAL_AREA_LABELS) },
      { key: "client_id", label: "Cliente do caso novo", type: "link", entity: "client" },
      ...ATTACH_FIELDS,
    ],
  },
  lead: {
    title: "Novo lead",
    fields: [
      { key: "full_name", label: "Nome completo", type: "text", required: true },
      { key: "phone", label: "Telefone", type: "text" },
      { key: "email", label: "E-mail", type: "text" },
      { key: "city", label: "Cidade", type: "text" },
      { key: "state", label: "UF", type: "text" },
      { key: "legal_area", label: "Área", type: "select", options: opts(LEGAL_AREA_LABELS) },
      { key: "urgency", label: "Urgência", type: "select", options: opts(URGENCY_LABELS) },
      { key: "source", label: "Origem", type: "select", options: SOURCE_OPTIONS },
      { key: "case_summary", label: "Resumo do caso", type: "textarea" },
      { key: "process_number", label: "Número de processo (se já existir)", type: "text" },
      { key: "next_action", label: "Próxima ação", type: "text" },
      ...ATTACH_FIELDS,
    ],
  },
  tarefa: {
    title: "Nova tarefa",
    fields: [
      { key: "title", label: "Título", type: "text", required: true },
      { key: "description", label: "Descrição", type: "textarea" },
      { key: "due_date", label: "Vence em", type: "datetime" },
      { key: "priority", label: "Prioridade", type: "select", options: PRIORITY_OPTIONS },
      { key: "assigned_to", label: "Responsável", type: "link", entity: "user" },
      { key: "process_id", label: "Processo", type: "link", entity: "process" },
      { key: "case_id", label: "Caso", type: "link", entity: "case" },
      { key: "lead_id", label: "Lead", type: "link", entity: "lead" },
      { key: "client_id", label: "Cliente", type: "link", entity: "client" },
      ...ATTACH_FIELDS,
    ],
  },
  prazo: {
    title: "Novo prazo",
    fields: [
      { key: "title", label: "O que vence", type: "text", required: true, placeholder: "Contestação" },
      { key: "due_date", label: "Data final do prazo", type: "date", required: true },
      { key: "process_id", label: "Processo", type: "link", entity: "process" },
      { key: "update_process_deadline", label: "Atualizar o próximo prazo do processo", type: "checkbox" },
      { key: "priority", label: "Prioridade", type: "select", options: PRIORITY_OPTIONS },
      { key: "assigned_to", label: "Responsável", type: "link", entity: "user" },
      { key: "description", label: "Observações", type: "textarea" },
      ...ATTACH_FIELDS,
    ],
  },
  compromisso: {
    title: "Novo compromisso",
    fields: [
      { key: "title", label: "Título", type: "text", required: true },
      { key: "date", label: "Data", type: "date", required: true },
      { key: "start_time", label: "Início", type: "time", required: true },
      { key: "end_time", label: "Fim", type: "time" },
      { key: "modality", label: "Formato", type: "select", options: MODALITY_OPTIONS },
      { key: "meeting_link", label: "Link da reunião", type: "text" },
      { key: "assigned_to", label: "Responsável", type: "link", entity: "user" },
      { key: "lead_id", label: "Lead", type: "link", entity: "lead" },
      { key: "client_id", label: "Cliente", type: "link", entity: "client" },
      { key: "notes", label: "Observações", type: "textarea" },
    ],
  },
  documento: {
    title: "Anexar documento",
    fields: [
      { key: "file_name", label: "Nome do arquivo", type: "text", required: true },
      { key: "attach_category", label: "Categoria", type: "select", options: opts(CATEGORY_LABELS), required: true },
      { key: "process_id", label: "Processo", type: "link", entity: "process" },
      { key: "case_id", label: "Caso", type: "link", entity: "case" },
      { key: "lead_id", label: "Lead", type: "link", entity: "lead" },
      { key: "client_id", label: "Cliente", type: "link", entity: "client" },
    ],
  },
};

/** Categoria sugerida para o arquivo anexado, conforme o tipo de cadastro. */
export const DEFAULT_ATTACH_CATEGORY: Record<DraftKind, DocumentCategory> = {
  processo: "processo",
  lead: "documento_pessoal",
  tarefa: "outros",
  prazo: "intimacao",
  compromisso: "outros",
  documento: "outros",
};

export function linkLabelKey(key: string) {
  return `${key}_label`;
}

// ---------------------------------------------------------------------------
// Datas (São Paulo não tem horário de verão desde 2019: sempre -03:00)
// ---------------------------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function validDate(value: string) {
  const d = new Date(`${value.slice(0, 10)}T12:00:00-03:00`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value.slice(0, 10);
}

/** "2026-11-20" → fim do dia em São Paulo; "2026-11-20T14:30" → esse horário em São Paulo. */
export function toSaoPauloIso(value: string, endOfDay = false): string {
  if (DATETIME_RE.test(value)) return new Date(`${value}:00-03:00`).toISOString();
  return new Date(`${value}T${endOfDay ? "23:59:00" : "12:00:00"}-03:00`).toISOString();
}

/** Só os dígitos do número CNJ (20 dígitos quando completo). */
export function cnjDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Formata 20 dígitos no padrão CNJ NNNNNNN-DD.AAAA.J.TR.OOOO. */
export function formatCnj(value: string): string {
  const d = cnjDigits(value);
  if (d.length !== 20) return value.trim();
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

export function phoneDigits(value: string | null | undefined): string {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

// ---------------------------------------------------------------------------
// Validação final (no Confirmar)
// ---------------------------------------------------------------------------
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Texto muito longo (máx. ${max}).`)
    .optional()
    .transform((v) => (v ? v : undefined));
// Ids de registros (uuid no banco; o banco recusa o que não existir).
const uuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().regex(/^[A-Za-z0-9-]{1,64}$/, "Vínculo inválido.").optional());
const date = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || (DATE_RE.test(v) && validDate(v)), `${label}: data inválida.`);
const requiredDate = (label: string) =>
  z
    .string({ error: `Informe ${label}.` })
    .trim()
    .min(1, `Informe ${label}.`)
    .refine((v) => DATE_RE.test(v) && validDate(v), `${label}: data inválida.`);
const datetime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || ((DATETIME_RE.test(v) || DATE_RE.test(v)) && validDate(v)), "Data e hora inválidas.");
const bool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "true" || v === "on");

const legalArea = z.enum(Object.keys(LEGAL_AREA_LABELS) as [LegalArea, ...LegalArea[]]);
const legalStatus = z.enum(Object.keys(LEGAL_STATUS_LABELS) as [LegalStatus, ...LegalStatus[]]);
const urgency = z.enum(Object.keys(URGENCY_LABELS) as [Urgency, ...Urgency[]]);
const category = z.enum(Object.keys(CATEGORY_LABELS) as [DocumentCategory, ...DocumentCategory[]]);
const priority = z.enum(["alta", "media", "baixa"]);
const optionalEnum = <T extends z.ZodType<string, string>>(schema: T) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(schema.optional());

const attachFields = {
  attach_file: bool,
  attach_category: optionalEnum(category),
};

export const CONFIRM_SCHEMAS = {
  processo: z
    .object({
      process_number: text(40),
      court: text(120),
      jurisdiction: text(160),
      class: text(160),
      subject: text(300),
      status: optionalEnum(legalStatus),
      next_deadline: date("Próximo prazo"),
      case_id: uuid,
      new_case_title: text(160),
      legal_area: optionalEnum(legalArea),
      client_id: uuid,
      ...attachFields,
    })
    .refine((v) => v.case_id || v.new_case_title, {
      message: "Escolha um caso ou informe o título do caso novo.",
      path: ["case_id"],
    })
    .refine((v) => !v.process_number || [0, 20].includes(cnjDigits(v.process_number).length), {
      message: "O número CNJ tem 20 dígitos.",
      path: ["process_number"],
    }),
  lead: z
    .object({
      full_name: z.string({ error: "Informe o nome." }).trim().min(2, "Informe o nome.").max(160),
      phone: text(30),
      email: text(160).refine((v) => !v || z.email().safeParse(v).success, "E-mail inválido."),
      city: text(80),
      state: text(2),
      legal_area: optionalEnum(legalArea),
      urgency: optionalEnum(urgency),
      source: optionalEnum(z.enum(SOURCE_OPTIONS.map((o) => o.value) as [string, ...string[]])),
      case_summary: text(4000),
      process_number: text(40),
      next_action: text(300),
      ...attachFields,
    })
    .refine((v) => v.phone || v.email, { message: "Informe telefone ou e-mail.", path: ["phone"] }),
  tarefa: z.object({
    title: z.string({ error: "Informe o título." }).trim().min(2, "Informe o título.").max(200),
    description: text(4000),
    due_date: datetime,
    priority: optionalEnum(priority),
    assigned_to: uuid,
    process_id: uuid,
    case_id: uuid,
    lead_id: uuid,
    client_id: uuid,
    ...attachFields,
  }),
  prazo: z.object({
    title: z.string({ error: "Informe o que vence." }).trim().min(2, "Informe o que vence.").max(200),
    due_date: requiredDate("a data final do prazo"),
    process_id: uuid,
    update_process_deadline: bool,
    priority: optionalEnum(priority),
    assigned_to: uuid,
    description: text(4000),
    ...attachFields,
  }),
  compromisso: z.object({
    title: z.string({ error: "Informe o título." }).trim().min(2, "Informe o título.").max(200),
    date: requiredDate("a data"),
    start_time: z
      .string({ error: "Informe o horário de início." })
      .trim()
      .regex(TIME_RE, "Horário de início inválido (hh:mm)."),
    end_time: text(5).refine((v) => !v || TIME_RE.test(v), "Horário de fim inválido (hh:mm)."),
    modality: optionalEnum(z.enum(["online", "presencial", "telefone"])),
    meeting_link: text(500).refine((v) => !v || /^https:\/\//.test(v), "O link precisa começar com https://"),
    assigned_to: uuid,
    lead_id: uuid,
    client_id: uuid,
    notes: text(4000),
  }),
  documento: z
    .object({
      file_name: z.string({ error: "Informe o nome do arquivo." }).trim().min(1, "Informe o nome do arquivo.").max(200),
      attach_category: category,
      process_id: uuid,
      case_id: uuid,
      lead_id: uuid,
      client_id: uuid,
    })
    .refine((v) => v.process_id || v.case_id || v.lead_id || v.client_id, {
      message: "Escolha onde anexar: processo, caso, lead ou cliente.",
      path: ["process_id"],
    }),
} satisfies Record<DraftKind, z.ZodType>;

export type ConfirmedData<K extends DraftKind> = z.output<(typeof CONFIRM_SCHEMAS)[K]>;

/** Valida os dados editados no cartão. Devolve a primeira mensagem de erro ou os dados limpos. */
export function validateDraft<K extends DraftKind>(
  kind: K,
  data: DraftData
): { ok: true; data: ConfirmedData<K> } | { ok: false; error: string; field?: string } {
  const parsed = CONFIRM_SCHEMAS[kind].safeParse(data);
  if (parsed.success) return { ok: true, data: parsed.data as ConfirmedData<K> };
  const issue = parsed.error.issues[0];
  return { ok: false, error: issue?.message ?? "Dados inválidos.", field: issue?.path[0]?.toString() };
}

/** Só os campos conhecidos do tipo (e os rótulos dos vínculos) seguem do navegador para a validação. */
export function pickDraftFields(kind: DraftKind, data: unknown): DraftData {
  const src = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const out: DraftData = {};
  for (const f of DRAFT_DEFS[kind].fields) {
    const v = src[f.key];
    if (typeof v === "string" || typeof v === "boolean") out[f.key] = v;
    if (f.type === "link") {
      const label = src[linkLabelKey(f.key)];
      if (typeof label === "string") out[linkLabelKey(f.key)] = label.slice(0, 200);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rascunho → linhas do banco
// ---------------------------------------------------------------------------
export interface InsertPlan {
  /** Caso novo a criar antes do processo (o id dele entra em process.case_id). */
  newCase?: Record<string, unknown>;
  table: "processes" | "leads" | "tasks" | "appointments" | "documents";
  row: Record<string, unknown>;
  /** Prazo: atualiza o próximo prazo do processo. */
  processDeadline?: { processId: string; deadline: string };
  /** Onde ligar o arquivo anexado, se a pessoa marcou "anexar". */
  attach?: { category: DocumentCategory; links: Record<string, string | undefined> };
  /** Link da tela do registro criado ({id} é trocado pelo id novo). */
  link: string;
}

export function buildInsertPlan<K extends DraftKind>(kind: K, input: ConfirmedData<K>): InsertPlan {
  const n = (v: unknown) => (v === undefined ? null : v);
  switch (kind) {
    case "processo": {
      const d = input as ConfirmedData<"processo">;
      return {
        newCase: d.case_id
          ? undefined
          : {
              title: d.new_case_title,
              legal_area: d.legal_area ?? "nao_confirmada",
              client_id: n(d.client_id),
              status: "em_andamento",
            },
        table: "processes",
        row: {
          case_id: n(d.case_id),
          process_number: d.process_number ? formatCnj(d.process_number) : null,
          court: n(d.court),
          jurisdiction: n(d.jurisdiction),
          class: n(d.class),
          subject: n(d.subject),
          status: d.status ?? "em_andamento",
          next_deadline: d.next_deadline ? toSaoPauloIso(d.next_deadline, true) : null,
        },
        attach: d.attach_file
          ? { category: d.attach_category ?? "processo", links: { case_id: d.case_id, client_id: d.client_id } }
          : undefined,
        link: "/processos",
      };
    }
    case "lead": {
      const d = input as ConfirmedData<"lead">;
      return {
        table: "leads",
        row: {
          full_name: d.full_name,
          phone: n(d.phone),
          email: d.email ? d.email.toLowerCase() : null,
          city: n(d.city),
          state: d.state ? d.state.toUpperCase() : null,
          legal_area: d.legal_area ?? "nao_confirmada",
          case_summary: n(d.case_summary),
          urgency: d.urgency ?? "baixa",
          source: d.source ?? "outro",
          process_number: d.process_number ? formatCnj(d.process_number) : null,
          has_existing_process: Boolean(d.process_number),
          next_action: n(d.next_action),
          // Cadastro feito pela equipe: o consentimento do titular é colhido no atendimento.
          consent_given: false,
        },
        attach: d.attach_file ? { category: d.attach_category ?? "documento_pessoal", links: {} } : undefined,
        link: "/leads/{id}",
      };
    }
    case "tarefa": {
      const d = input as ConfirmedData<"tarefa">;
      return {
        table: "tasks",
        row: {
          title: d.title,
          description: n(d.description),
          due_date: d.due_date ? toSaoPauloIso(d.due_date) : null,
          priority: d.priority ?? "media",
          status: "pendente",
          assigned_to: n(d.assigned_to),
          process_id: n(d.process_id),
          case_id: n(d.case_id),
          lead_id: n(d.lead_id),
          client_id: n(d.client_id),
        },
        attach: d.attach_file
          ? {
              category: d.attach_category ?? "outros",
              links: { process_id: d.process_id, case_id: d.case_id, lead_id: d.lead_id, client_id: d.client_id },
            }
          : undefined,
        link: d.lead_id ? `/leads/${d.lead_id}` : "/tarefas",
      };
    }
    case "prazo": {
      const d = input as ConfirmedData<"prazo">;
      return {
        table: "tasks",
        row: {
          title: `Prazo: ${d.title}`,
          description: n(d.description),
          due_date: toSaoPauloIso(d.due_date, true),
          priority: d.priority ?? "alta",
          status: "pendente",
          assigned_to: n(d.assigned_to),
          process_id: n(d.process_id),
        },
        processDeadline:
          d.process_id && d.update_process_deadline
            ? { processId: d.process_id, deadline: toSaoPauloIso(d.due_date, true) }
            : undefined,
        attach: d.attach_file
          ? { category: d.attach_category ?? "intimacao", links: { process_id: d.process_id } }
          : undefined,
        link: "/tarefas",
      };
    }
    case "compromisso": {
      const d = input as ConfirmedData<"compromisso">;
      return {
        table: "appointments",
        row: {
          title: d.title,
          date: d.date,
          start_time: d.start_time,
          end_time: n(d.end_time),
          modality: d.modality ?? "presencial",
          meeting_link: n(d.meeting_link),
          status: "agendada",
          assigned_to: n(d.assigned_to),
          lead_id: n(d.lead_id),
          client_id: n(d.client_id),
          notes: n(d.notes),
        },
        link: d.lead_id ? `/leads/${d.lead_id}` : "/agenda",
      };
    }
    case "documento": {
      const d = input as ConfirmedData<"documento">;
      return {
        table: "documents",
        row: {
          file_name: d.file_name,
          category: d.attach_category,
          process_id: n(d.process_id),
          case_id: n(d.case_id),
          lead_id: n(d.lead_id),
          client_id: n(d.client_id),
          review_status: "pendente",
        },
        link: d.lead_id ? `/leads/${d.lead_id}` : "/documentos",
      };
    }
  }
  throw new Error(`Tipo de rascunho desconhecido: ${kind}`);
}
