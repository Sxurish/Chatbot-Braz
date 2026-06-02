"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAdminAction } from "@/lib/auth/require-admin";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DEMO_NOTICE =
  "Modo demonstração: configure o Supabase para gravar os dados.";

async function audit(
  supabase: ReturnType<typeof createClient>,
  action: string,
  entityType: string,
  entityId: string | null,
  userId: string | null
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId && !userId.startsWith("demo") ? userId : null,
      action,
      entity_type: entityType,
      entity_id: entityId,
    });
  } catch {
    // não bloqueia
  }
}

function isoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ===========================================================================
// PROCESSOS
// ===========================================================================
const LEGAL_STATUS = [
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
] as const;

const processSchema = z.object({
  case_id: z.string().uuid("Selecione um caso válido."),
  process_number: z.string().optional(),
  court: z.string().optional(),
  jurisdiction: z.string().optional(),
  class: z.string().optional(),
  subject: z.string().optional(),
  status: z.enum(LEGAL_STATUS).default("em_andamento"),
  next_deadline: z.string().optional(),
});

function parseProcess(formData: FormData) {
  return processSchema.safeParse({
    case_id: formData.get("case_id"),
    process_number: formData.get("process_number") || undefined,
    court: formData.get("court") || undefined,
    jurisdiction: formData.get("jurisdiction") || undefined,
    class: formData.get("class") || undefined,
    subject: formData.get("subject") || undefined,
    status: formData.get("status") || "em_andamento",
    next_deadline: formData.get("next_deadline") || undefined,
  });
}

export async function createProcessAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseProcess(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from("processes")
    .insert({
      case_id: parsed.data.case_id,
      process_number: parsed.data.process_number ?? null,
      court: parsed.data.court ?? null,
      jurisdiction: parsed.data.jurisdiction ?? null,
      class: parsed.data.class ?? null,
      subject: parsed.data.subject ?? null,
      status: parsed.data.status,
      next_deadline: isoOrNull(parsed.data.next_deadline),
    })
    .select("id")
    .single();

  if (error) return { error: "Falha ao criar o processo." };
  await audit(supabase, "create_process", "process", data.id, user.id);
  revalidatePath("/processos");
  return { ok: true };
}

export async function updateProcessAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Processo inválido." };
  const parsed = parseProcess(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("processes")
    .update({
      case_id: parsed.data.case_id,
      process_number: parsed.data.process_number ?? null,
      court: parsed.data.court ?? null,
      jurisdiction: parsed.data.jurisdiction ?? null,
      class: parsed.data.class ?? null,
      subject: parsed.data.subject ?? null,
      status: parsed.data.status,
      next_deadline: isoOrNull(parsed.data.next_deadline),
    })
    .eq("id", id);

  if (error) return { error: "Falha ao atualizar o processo." };
  await audit(supabase, "update_process", "process", id, user.id);
  revalidatePath("/processos");
  return { ok: true };
}

export async function deleteProcessAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Processo inválido." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { error } = await supabase.from("processes").delete().eq("id", id);
  if (error) return { error: "Falha ao excluir o processo." };
  await audit(supabase, "delete_process", "process", id, admin.user.id);
  revalidatePath("/processos");
  return { ok: true };
}

// ===========================================================================
// CONTRATOS
// ===========================================================================
const CONTRACT_STATUS = ["rascunho", "enviado", "assinado", "cancelado"] as const;

const contractSchema = z.object({
  client_id: z.string().uuid("Selecione um cliente válido."),
  case_id: z
    .string()
    .uuid("Caso inválido.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  contract_type: z.string().optional(),
  status: z.enum(CONTRACT_STATUS).default("rascunho"),
  value: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? Number(v) : null))
    .refine(
      (v) => v === null || (!isNaN(v) && v >= 0),
      "Valor deve ser numérico (≥ 0)."
    ),
  payment_terms: z.string().optional(),
  signed_at: z.string().optional(),
});

function parseContract(formData: FormData) {
  return contractSchema.safeParse({
    client_id: formData.get("client_id"),
    case_id: formData.get("case_id") || "",
    contract_type: formData.get("contract_type") || undefined,
    status: formData.get("status") || "rascunho",
    value: formData.get("value") || undefined,
    payment_terms: formData.get("payment_terms") || undefined,
    signed_at: formData.get("signed_at") || undefined,
  });
}

export async function createContractAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseContract(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from("contracts")
    .insert({
      client_id: parsed.data.client_id,
      case_id: parsed.data.case_id ?? null,
      contract_type: parsed.data.contract_type ?? null,
      status: parsed.data.status,
      value: parsed.data.value,
      payment_terms: parsed.data.payment_terms ?? null,
      signed_at: isoOrNull(parsed.data.signed_at),
    })
    .select("id")
    .single();

  if (error) return { error: "Falha ao criar o contrato." };
  await audit(supabase, "create_contract", "contract", data.id, user.id);
  revalidatePath("/contratos");
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function updateContractAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Contrato inválido." };
  const parsed = parseContract(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("contracts")
    .update({
      client_id: parsed.data.client_id,
      case_id: parsed.data.case_id ?? null,
      contract_type: parsed.data.contract_type ?? null,
      status: parsed.data.status,
      value: parsed.data.value,
      payment_terms: parsed.data.payment_terms ?? null,
      signed_at: isoOrNull(parsed.data.signed_at),
    })
    .eq("id", id);

  if (error) return { error: "Falha ao atualizar o contrato." };
  await audit(supabase, "update_contract", "contract", id, user.id);
  revalidatePath("/contratos");
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function deleteContractAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Contrato inválido." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) return { error: "Falha ao excluir o contrato." };
  await audit(supabase, "delete_contract", "contract", id, admin.user.id);
  revalidatePath("/contratos");
  revalidatePath("/financeiro");
  return { ok: true };
}

// ===========================================================================
// PAGAMENTOS
// ===========================================================================
const PAYMENT_STATUS = ["pendente", "pago", "atrasado", "cancelado"] as const;

const paymentSchema = z.object({
  contract_id: z
    .string()
    .uuid("Contrato inválido.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  client_id: z
    .string()
    .uuid("Cliente inválido.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  description: z.string().optional(),
  amount: z
    .string()
    .min(1, "Informe o valor.")
    .transform((v) => Number(v))
    .refine((v) => !isNaN(v) && v >= 0, "Valor inválido."),
  due_date: z.string().optional(),
  paid_at: z.string().optional(),
  status: z.enum(PAYMENT_STATUS).default("pendente"),
});

function parsePayment(formData: FormData) {
  return paymentSchema.safeParse({
    contract_id: formData.get("contract_id") || "",
    client_id: formData.get("client_id") || "",
    description: formData.get("description") || undefined,
    amount: formData.get("amount"),
    due_date: formData.get("due_date") || undefined,
    paid_at: formData.get("paid_at") || undefined,
    status: formData.get("status") || "pendente",
  });
}

export async function createPaymentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parsePayment(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      contract_id: parsed.data.contract_id ?? null,
      client_id: parsed.data.client_id ?? null,
      description: parsed.data.description ?? null,
      amount: parsed.data.amount,
      due_date: isoOrNull(parsed.data.due_date),
      paid_at: isoOrNull(parsed.data.paid_at),
      status: parsed.data.status,
    })
    .select("id")
    .single();

  if (error) return { error: "Falha ao criar o pagamento." };
  await audit(supabase, "create_payment", "payment", data.id, user.id);
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function updatePaymentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Pagamento inválido." };
  const parsed = parsePayment(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("payments")
    .update({
      contract_id: parsed.data.contract_id ?? null,
      client_id: parsed.data.client_id ?? null,
      description: parsed.data.description ?? null,
      amount: parsed.data.amount,
      due_date: isoOrNull(parsed.data.due_date),
      paid_at: isoOrNull(parsed.data.paid_at),
      status: parsed.data.status,
    })
    .eq("id", id);

  if (error) return { error: "Falha ao atualizar o pagamento." };
  await audit(supabase, "update_payment", "payment", id, user.id);
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function deletePaymentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Pagamento inválido." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) return { error: "Falha ao excluir o pagamento." };
  await audit(supabase, "delete_payment", "payment", id, admin.user.id);
  revalidatePath("/financeiro");
  return { ok: true };
}
