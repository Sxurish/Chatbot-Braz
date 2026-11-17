"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireWriterAction } from "@/lib/auth/require-admin";
import { getSettings } from "@/lib/data/settings";
import {
  buildCaseRow,
  buildClientRow,
  buildConsentLogRow,
  buildLeadRow,
  cpfCnpjDigits,
  escapeLike,
  findDuplicate,
  firstIssue,
  formatCpfCnpj,
  parseCaseForm,
  parseClientForm,
  parseLeadForm,
  phoneSearchPattern,
  type ContactRow,
  type DuplicateMatch,
} from "@/lib/data/cadastros-rules";

/**
 * Cadastros manuais do CRM: novo lead, novo cliente e novo caso.
 * Todos: só quem grava (não o visualizador), validação com Zod, auditoria em
 * audit_logs e, no modo demonstração, sucesso sem gravar nada.
 */

export interface CadastroState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Id do registro criado (o lead novo abre a página dele). */
  id?: string;
  /** Já existe alguém com o mesmo contato: a tela pergunta o que fazer. */
  duplicate?: DuplicateMatch;
}

const DEMO_NOTICE = "Modo demonstração: nada foi gravado. Configure o Supabase para gravar.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function audit(
  supabase: Supabase,
  action: string,
  entityType: string,
  entityId: string,
  userId: string,
  metadata: Record<string, unknown>
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId.startsWith("demo") ? null : userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  } catch {
    // auditoria não bloqueia
  }
}

/** Busca, na tabela, quem tem o mesmo e-mail, telefone ou CPF/CNPJ. */
async function contactCandidates(
  supabase: Supabase,
  table: "leads" | "clients",
  input: { phone?: string; email?: string; cpf_cnpj?: string }
): Promise<ContactRow[]> {
  const cols = table === "clients" ? "id, full_name, phone, email, cpf_cnpj" : "id, full_name, phone, email";
  const queries = [];
  if (input.email) {
    queries.push(supabase.from(table).select(cols).ilike("email", escapeLike(input.email.trim())).limit(5));
  }
  const pattern = input.phone ? phoneSearchPattern(input.phone) : null;
  if (pattern) {
    queries.push(supabase.from(table).select(cols).ilike("phone", pattern).limit(20));
  }
  if (table === "clients" && input.cpf_cnpj) {
    const digits = cpfCnpjDigits(input.cpf_cnpj);
    queries.push(
      supabase.from(table).select(cols).in("cpf_cnpj", [digits, formatCpfCnpj(digits)]).limit(5)
    );
  }
  const results = await Promise.all(queries);
  return results.flatMap((r) => (r.data as ContactRow[] | null) ?? []);
}

// ===========================================================================
// NOVO LEAD
// ===========================================================================
export async function createLeadAction(_prev: CadastroState, formData: FormData): Promise<CadastroState> {
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };
  const demo = !isSupabaseConfigured();
  const parsed = parseLeadForm(formData, demo);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (demo) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();

  if (!d.allow_duplicate) {
    const dup = findDuplicate("lead", await contactCandidates(supabase, "leads", d), d);
    if (dup) return { duplicate: dup };
  }

  const settings = await getSettings();
  const policyVersion = settings.privacy_policy_version;
  const { data, error } = await supabase
    .from("leads")
    .insert(buildLeadRow(d, { nowIso: new Date().toISOString(), policyVersion }))
    .select("id")
    .single();
  if (error || !data) return { error: "Falha ao cadastrar o lead." };

  if (d.consent) {
    // Trilha LGPD: o consentimento só vale com o registro em consent_logs.
    const { error: consentError } = await supabase
      .from("consent_logs")
      .insert(buildConsentLogRow(data.id, policyVersion));
    if (consentError) {
      await supabase.from("leads").delete().eq("id", data.id);
      return { error: "Falha ao registrar o consentimento. O lead não foi gravado." };
    }
  }

  await audit(supabase, "create_lead", "lead", data.id, writer.user.id, {
    origem: "cadastro_manual",
    source: d.source,
    consentimento_registrado: d.consent,
    duplicado_confirmado: d.allow_duplicate,
  });
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

// ===========================================================================
// NOVO CLIENTE
// ===========================================================================
export async function createClientAction(_prev: CadastroState, formData: FormData): Promise<CadastroState> {
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };
  const parsed = parseClientForm(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();

  if (!d.allow_duplicate) {
    // Primeiro outro cliente; depois um lead com o mesmo contato (nesse caso
    // o certo é converter o lead, para não perder o histórico dele).
    const dup =
      findDuplicate("client", await contactCandidates(supabase, "clients", d), d) ??
      findDuplicate("lead", await contactCandidates(supabase, "leads", d), d);
    if (dup) return { duplicate: dup };
  }

  const { data, error } = await supabase.from("clients").insert(buildClientRow(d)).select("id").single();
  if (error || !data) return { error: "Falha ao cadastrar o cliente." };

  await audit(supabase, "create_client", "client", data.id, writer.user.id, {
    origem: "cadastro_manual",
    duplicado_confirmado: d.allow_duplicate,
  });
  revalidatePath("/clientes");
  revalidatePath("/contratos");
  revalidatePath("/financeiro");
  revalidatePath("/casos");
  return { ok: true, id: data.id };
}

// ===========================================================================
// NOVO CASO
// ===========================================================================
export async function createCaseAction(_prev: CadastroState, formData: FormData): Promise<CadastroState> {
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };
  const demo = !isSupabaseConfigured();
  const parsed = parseCaseForm(formData, demo);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (demo) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase.from("cases").insert(buildCaseRow(d)).select("id").single();
  if (error || !data) return { error: "Falha ao criar o caso." };

  await audit(supabase, "create_case", "case", data.id, writer.user.id, {
    origem: "cadastro_manual",
    client_id: d.client_id ?? null,
    lead_id: d.lead_id ?? null,
  });
  revalidatePath("/casos");
  revalidatePath("/processos");
  revalidatePath("/contratos");
  if (d.lead_id) revalidatePath(`/leads/${d.lead_id}`);
  return { ok: true, id: data.id };
}
