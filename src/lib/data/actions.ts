"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireWriterAction } from "@/lib/auth/require-admin";
import { brInputToIso } from "@/lib/datetime-br";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DEMO_NOTICE =
  "Modo demonstração: configure o Supabase para gravar os dados de verdade.";

/** Registra uma ação no log de auditoria (best-effort). */
async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
  entityType: string,
  entityId: string | null
) {
  try {
    const user = await getCurrentUser();
    await supabase.from("audit_logs").insert({
      user_id: user.id?.startsWith("demo") ? null : user.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
    });
  } catch {
    // não bloqueia a operação principal
  }
}

/** Registra o motivo técnico no log do servidor e devolve a mensagem da tela. */
function fail(message: string, error: { message?: string } | null): ActionState {
  if (error) console.error(`[cadastro] ${message}`, error.message);
  return { error: message };
}

// Com o Supabase, ids são UUID; no modo demonstração os leads usam ids curtos.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const leadIdField = z
  .string()
  .refine((v) => UUID_RE.test(v) || !isSupabaseConfigured(), "Lead inválido.")
  .optional();

// ---------------------------------------------------------------------------
// Tarefa
// ---------------------------------------------------------------------------
const taskSchema = z.object({
  title: z.string().trim().min(2, "Informe um título."),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(["alta", "media", "baixa"]).default("media"),
  lead_id: leadIdField,
});

export async function createTaskAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    due_date: formData.get("due_date") || undefined,
    priority: formData.get("priority") || "media",
    lead_id: formData.get("lead_id") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };
  const dueDate = brInputToIso(parsed.data.due_date);
  if (parsed.data.due_date && !dueDate) return { error: "Prazo inválido." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      due_date: dueDate,
      priority: parsed.data.priority,
      status: "pendente",
      lead_id: parsed.data.lead_id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return fail("Falha ao criar a tarefa.", error);
  await audit(supabase, "create", "task", data.id);
  revalidatePath("/tarefas");
  if (parsed.data.lead_id) revalidatePath(`/leads/${parsed.data.lead_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------
const followUpSchema = z.object({
  title: z.string().trim().min(2, "Informe um título."),
  description: z.string().optional(),
  scheduled_at: z.string().min(1, "Informe a data."),
  lead_id: leadIdField,
});

export async function createFollowUpAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = followUpSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    scheduled_at: formData.get("scheduled_at"),
    lead_id: formData.get("lead_id") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };
  const scheduledAt = brInputToIso(parsed.data.scheduled_at);
  if (!scheduledAt) return { error: "Data inválida." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      scheduled_at: scheduledAt,
      status: "pendente",
      lead_id: parsed.data.lead_id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return fail("Falha ao criar o follow-up.", error);
  await audit(supabase, "create", "follow_up", data.id);
  revalidatePath("/follow-up");
  if (parsed.data.lead_id) revalidatePath(`/leads/${parsed.data.lead_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Agendamento
// ---------------------------------------------------------------------------
const appointmentSchema = z.object({
  title: z.string().trim().min(2, "Informe um título."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Informe o horário."),
  end_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário de fim inválido.")
    .optional(),
  modality: z.enum(["online", "presencial", "telefone"]).default("online"),
  meeting_link: z.string().optional(),
  lead_id: leadIdField,
});

export async function createAppointmentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = appointmentSchema.safeParse({
    title: formData.get("title"),
    date: formData.get("date"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time") || undefined,
    modality: formData.get("modality") || "online",
    meeting_link: formData.get("meeting_link") || undefined,
    lead_id: formData.get("lead_id") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };
  if (parsed.data.end_time && parsed.data.end_time <= parsed.data.start_time) {
    return { error: "O fim precisa ser depois do início." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      title: parsed.data.title,
      date: parsed.data.date,
      start_time: parsed.data.start_time,
      end_time: parsed.data.end_time ?? null,
      modality: parsed.data.modality,
      meeting_link: parsed.data.meeting_link ?? null,
      status: "agendada",
      lead_id: parsed.data.lead_id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return fail("Falha ao criar o agendamento.", error);
  await audit(supabase, "create", "appointment", data.id);
  revalidatePath("/agenda");
  if (parsed.data.lead_id) revalidatePath(`/leads/${parsed.data.lead_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Converter lead em cliente
// ---------------------------------------------------------------------------
export async function convertLeadToClientAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const leadId = String(formData.get("lead_id") ?? "");
  if (!leadId) return { error: "Lead inválido." };
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };
  if (!UUID_RE.test(leadId)) return { error: "Lead inválido." };

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Lead não encontrado." };

  // Evita duplicar cliente para o mesmo lead.
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("lead_id", leadId)
    .limit(1)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await supabase.from("clients").insert({
      lead_id: leadId,
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      state: lead.state,
      status: "ativo",
    });
    if (insertError) return fail("Falha ao converter em cliente.", insertError);
  }

  const { error: leadError } = await supabase
    .from("leads")
    .update({ is_existing_client: true, commercial_status: "cliente_ativo" })
    .eq("id", leadId);
  if (leadError) {
    return fail("O cliente foi criado, mas o lead não foi atualizado.", leadError);
  }

  await audit(supabase, "convert_to_client", "lead", leadId);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/clientes");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Criar caso a partir do lead
// ---------------------------------------------------------------------------
export async function createCaseFromLeadAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const leadId = String(formData.get("lead_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!leadId) return { error: "Lead inválido." };
  if (title.length < 2) return { error: "Informe um título para o caso." };
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };
  if (!UUID_RE.test(leadId)) return { error: "Lead inválido." };

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Lead não encontrado." };

  // Se o lead já virou cliente, o caso já nasce ligado ao cliente.
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("lead_id", leadId)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("cases")
    .insert({
      lead_id: leadId,
      client_id: client?.id ?? null,
      title,
      legal_area: lead.legal_area,
      subarea: lead.subarea,
      summary: lead.case_summary,
      status: "triagem_inicial",
      assigned_to: lead.assigned_to,
    })
    .select("id")
    .single();

  if (error || !data) return fail("Falha ao criar o caso.", error);
  await audit(supabase, "create", "case", data.id);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/casos");
  return { ok: true };
}
