import { z } from "zod";
import { cnjDigits, formatCnj } from "@/lib/assistant/draft-schema";
import type { LegalArea, LegalStatus, Urgency } from "@/lib/types";

/**
 * Regras dos cadastros manuais (novo lead, novo cliente, novo caso).
 *
 * Nada aqui grava: este arquivo só valida o formulário (Zod), monta as linhas
 * que vão para o banco e confere duplicados. Quem grava são as ações em
 * cadastros-actions.ts. Fica separado para poder ser testado sem banco.
 */

// ---------------------------------------------------------------------------
// Listas aceitas pelo banco (ENUMs do schema.sql)
// ---------------------------------------------------------------------------
export const LEGAL_AREAS = [
  "penal",
  "civil",
  "administrativo",
  "previdenciario",
  "bancario",
  "imobiliario",
  "trabalhista",
  "familia",
  "consumidor",
  "empresarial",
  "tributario",
  "contratos",
  "lgpd",
  "outro",
  "nao_confirmada",
] as const satisfies readonly LegalArea[];

export const URGENCIES = ["alta", "media", "baixa"] as const satisfies readonly Urgency[];

export const LEGAL_STATUSES = [
  "triagem_inicial",
  "analise_documental",
  "estrategia_em_definicao",
  "aguardando_procuracao",
  "aguardando_contrato",
  "em_elaboracao",
  "protocolado",
  "em_andamento",
  "aguardando_audiencia",
  "aguardando_decisao",
  "recurso",
  "encerrado",
] as const satisfies readonly LegalStatus[];

/**
 * Origens do lead. A coluna leads.source é texto livre, mas as telas de
 * métricas só conhecem estes valores (LeadSource). "chatbot" fica de fora:
 * lead do chatbot é criado pelo próprio chatbot.
 */
export const MANUAL_SOURCES = [
  { value: "indicacao", label: "Indicação" },
  { value: "telefone", label: "Telefone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "site", label: "Site" },
  { value: "google", label: "Google" },
  { value: "outro", label: "Outro (presencial, e-mail...)" },
] as const;

const SOURCE_VALUES = MANUAL_SOURCES.map((s) => s.value) as [string, ...string[]];

export const SOURCE_LABELS: Record<string, string> = {
  chatbot: "Chatbot (site)",
  ...Object.fromEntries(MANUAL_SOURCES.map((s) => [s.value, s.label.replace(/ \(.*\)$/, "")])),
};

/** Canal gravado em consent_logs quando a equipe registra o consentimento. */
export const MANUAL_CONSENT_CHANNEL = "manual";

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// No modo demonstração os registros de exemplo usam ids curtos (client-001).
const DEMO_ID_RE = /^[a-z]+-\d{3}$/;

export function isRecordId(value: string, demo: boolean): boolean {
  return UUID_RE.test(value) || (demo && DEMO_ID_RE.test(value));
}

/** Texto opcional: vazio vira undefined; corta espaços; limita o tamanho. */
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

function get(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

/** Só os dígitos do telefone, sem o 55 do Brasil na frente. */
export function phoneKey(value: string | null | undefined): string {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

/** Telefone com 10 ou 11 dígitos (DDD + número), com ou sem +55. */
export function isValidPhone(value: string): boolean {
  const d = phoneKey(value);
  return d.length === 10 || d.length === 11;
}

/** Formata como (11) 98765-4321 / (11) 3456-7890. */
export function formatPhone(value: string): string {
  const d = phoneKey(value);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value.trim();
}

/**
 * Padrão para buscar o telefone no banco com ILIKE, aceitando qualquer
 * formatação gravada: os 8 últimos dígitos com "%" entre eles. O resultado
 * ainda é conferido com phoneKey (a busca só junta candidatos).
 */
export function phoneSearchPattern(value: string): string | null {
  const d = phoneKey(value);
  if (d.length < 8) return null;
  return `%${d.slice(-8).split("").join("%")}`;
}

/** Escapa % e _ para usar um valor exato dentro de ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function cpfCnpjDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const d = cpfCnpjDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(value: string): boolean {
  const d = cpfCnpjDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** 000.000.000-00 ou 00.000.000/0000-00. */
export function formatCpfCnpj(value: string): string {
  const d = cpfCnpjDigits(value);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return value.trim();
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

// ---------------------------------------------------------------------------
// NOVO LEAD
// ---------------------------------------------------------------------------
export function leadSchema(demo: boolean) {
  return z
    .object({
      full_name: nameField,
      phone: phoneField,
      email: emailField,
      city: optText(80),
      state: ufField,
      legal_area: z.enum(LEGAL_AREAS, { error: "Área inválida." }).default("nao_confirmada"),
      case_type: optText(120),
      case_summary: optText(4000, "Observações longas demais (máx. 4.000)."),
      urgency: z.enum(URGENCIES, { error: "Urgência inválida." }).default("baixa"),
      urgency_reason: optText(300),
      source: z.enum(SOURCE_VALUES, { error: "Escolha a origem do lead." }),
      assigned_to: optId(demo, "Responsável inválido."),
      preferred_contact_time: optText(80),
      process_number: optText(40).refine(
        (v) => v === undefined || cnjDigits(v).length === 20,
        "O número do processo (CNJ) tem 20 dígitos."
      ),
      next_action: optText(300),
      consent: z.boolean().default(false),
      allow_duplicate: z.boolean().default(false),
    })
    .refine((v) => v.phone || v.email, {
      message: "Informe telefone/WhatsApp ou e-mail.",
      path: ["phone"],
    });
}

export type LeadInput = z.output<ReturnType<typeof leadSchema>>;

export function parseLeadForm(formData: FormData, demo: boolean) {
  return leadSchema(demo).safeParse({
    full_name: get(formData, "full_name"),
    phone: get(formData, "phone"),
    email: get(formData, "email"),
    city: get(formData, "city"),
    state: get(formData, "state"),
    legal_area: get(formData, "legal_area") || undefined,
    case_type: get(formData, "case_type"),
    case_summary: get(formData, "case_summary"),
    urgency: get(formData, "urgency") || undefined,
    urgency_reason: get(formData, "urgency_reason"),
    source: get(formData, "source") || undefined,
    assigned_to: get(formData, "assigned_to"),
    preferred_contact_time: get(formData, "preferred_contact_time"),
    process_number: get(formData, "process_number"),
    next_action: get(formData, "next_action"),
    consent: formData.get("consent") === "on",
    allow_duplicate: formData.get("allow_duplicate") === "1",
  });
}

/**
 * Linha gravada em public.leads.
 *
 * LGPD: o cadastro feito pela equipe NÃO marca consentimento por padrão. Só
 * marca quando a pessoa autorizou de forma expressa e a equipe confirmou no
 * formulário; aí grava a data e a versão da política vigente (e a ação grava
 * o registro em consent_logs, como o chatbot faz).
 */
export function buildLeadRow(
  d: LeadInput,
  opts: { nowIso: string; policyVersion: string }
) {
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
    commercial_status: "novo_lead" as const,
    legal_status: "triagem_inicial" as const,
    financial_status: "sem_cobranca" as const,
    source: d.source,
    assigned_to: d.assigned_to ?? null,
    consent_given: d.consent,
    consent_at: d.consent ? opts.nowIso : null,
    privacy_policy_version: d.consent ? opts.policyVersion : null,
    process_number: d.process_number ? formatCnj(d.process_number) : null,
    has_existing_process: Boolean(d.process_number),
    is_existing_client: false,
    preferred_contact_time: d.preferred_contact_time ?? null,
    next_action: d.next_action ?? null,
  };
}

export function buildConsentLogRow(leadId: string, policyVersion: string) {
  return {
    lead_id: leadId,
    consent_type: "atendimento",
    consent_given: true,
    policy_version: policyVersion,
    // Registrado pela equipe: IP e navegador seriam os do escritório, não os
    // do titular, então ficam vazios. Quem registrou fica em audit_logs.
    ip_address: null,
    user_agent: null,
    channel: MANUAL_CONSENT_CHANNEL,
  };
}

// ---------------------------------------------------------------------------
// NOVO CLIENTE
// ---------------------------------------------------------------------------
export function clientSchema() {
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
    allow_duplicate: z.boolean().default(false),
  });
}

export type ClientInput = z.output<ReturnType<typeof clientSchema>>;

export function parseClientForm(formData: FormData) {
  return clientSchema().safeParse({
    full_name: get(formData, "full_name"),
    cpf_cnpj: get(formData, "cpf_cnpj"),
    phone: get(formData, "phone"),
    email: get(formData, "email"),
    city: get(formData, "city"),
    state: get(formData, "state"),
    allow_duplicate: formData.get("allow_duplicate") === "1",
  });
}

/** Linha gravada em public.clients (cadastro direto: sem lead de origem). */
export function buildClientRow(d: ClientInput) {
  return {
    lead_id: null,
    full_name: d.full_name,
    cpf_cnpj: d.cpf_cnpj ? formatCpfCnpj(d.cpf_cnpj) : null,
    phone: d.phone ? formatPhone(d.phone) : null,
    email: d.email ? d.email.toLowerCase() : null,
    city: d.city ?? null,
    state: d.state ?? null,
    status: "ativo",
  };
}

// ---------------------------------------------------------------------------
// NOVO CASO
// ---------------------------------------------------------------------------
export function caseSchema(demo: boolean) {
  return z
    .object({
      client_id: optId(demo, "Cliente inválido."),
      lead_id: optId(demo, "Lead inválido."),
      title: z
        .string({ error: "Informe o título do caso." })
        .trim()
        .min(3, "Informe o título do caso.")
        .max(200, "Título longo demais (máx. 200)."),
      legal_area: z.enum(LEGAL_AREAS, { error: "Área inválida." }).default("nao_confirmada"),
      subarea: optText(120),
      status: z.enum(LEGAL_STATUSES, { error: "Status inválido." }).default("triagem_inicial"),
      assigned_to: optId(demo, "Responsável inválido."),
      summary: optText(4000, "Resumo longo demais (máx. 4.000)."),
    })
    .refine((v) => v.client_id || v.lead_id, {
      message: "Escolha o cliente (ou o lead) do caso.",
      path: ["client_id"],
    });
}

export type CaseInput = z.output<ReturnType<typeof caseSchema>>;

export function parseCaseForm(formData: FormData, demo: boolean) {
  return caseSchema(demo).safeParse({
    client_id: get(formData, "client_id"),
    lead_id: get(formData, "lead_id"),
    title: get(formData, "title"),
    legal_area: get(formData, "legal_area") || undefined,
    subarea: get(formData, "subarea"),
    status: get(formData, "status") || undefined,
    assigned_to: get(formData, "assigned_to"),
    summary: get(formData, "summary"),
  });
}

export function buildCaseRow(d: CaseInput) {
  return {
    client_id: d.client_id ?? null,
    lead_id: d.lead_id ?? null,
    title: d.title,
    legal_area: d.legal_area,
    subarea: d.subarea ?? null,
    summary: d.summary ?? null,
    status: d.status,
    assigned_to: d.assigned_to ?? null,
  };
}

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------
export interface ContactRow {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  cpf_cnpj?: string | null;
}

export interface DuplicateMatch {
  kind: "lead" | "client";
  id: string;
  name: string;
  reason: "telefone" | "e-mail" | "CPF/CNPJ";
}

/**
 * Entre os candidatos que o banco devolveu, acha o primeiro que é a mesma
 * pessoa: mesmo CPF/CNPJ, mesmo telefone (só dígitos, sem +55) ou mesmo
 * e-mail (sem diferença de maiúsculas).
 */
export function findDuplicate(
  kind: DuplicateMatch["kind"],
  candidates: ContactRow[],
  input: { phone?: string; email?: string; cpf_cnpj?: string }
): DuplicateMatch | null {
  const phone = input.phone ? phoneKey(input.phone) : "";
  const email = input.email ? input.email.trim().toLowerCase() : "";
  const doc = input.cpf_cnpj ? cpfCnpjDigits(input.cpf_cnpj) : "";
  for (const c of candidates) {
    const base = { kind, id: c.id, name: c.full_name };
    if (doc && cpfCnpjDigits(c.cpf_cnpj) === doc) return { ...base, reason: "CPF/CNPJ" };
    if (phone && phoneKey(c.phone) === phone) return { ...base, reason: "telefone" };
    if (email && (c.email ?? "").trim().toLowerCase() === email) return { ...base, reason: "e-mail" };
  }
  return null;
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}
