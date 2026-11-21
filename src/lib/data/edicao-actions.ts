"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brInputToIso } from "@/lib/datetime-br";
import type { TeamUser } from "@/lib/types";
import {
  QUICK_TABLE,
  buildCasePatch,
  buildClientPatch,
  buildLeadPatch,
  canRemove,
  canWriteRole,
  isQuickStatus,
  parseAppointmentForm,
  parseCaseEdit,
  parseClientEdit,
  parseFollowUpForm,
  parseId,
  parseLeadEdit,
  parseTaskForm,
  removalBlockReason,
  type Links,
  type QuickKind,
  type RecordKind,
} from "@/lib/data/edicao-rules";

/**
 * Editar, concluir e remover registros do dia a dia.
 * Regras de quem pode o quê em edicao-rules.ts. Toda mudança vai para a
 * Auditoria. No modo demonstração nada é gravado.
 */

export interface EditState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DEMO_NOTICE = "Modo demonstração: nada foi gravado. Configure o Supabase para gravar.";
const READONLY = "Seu perfil só pode consultar.";
const ADMIN_ONLY = "Só o Admin pode remover este cadastro.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function demo(): boolean {
  return !isSupabaseConfigured();
}

async function writer(): Promise<{ ok: true; user: TeamUser } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!canWriteRole(user.role, user.active)) return { ok: false, error: READONLY };
  return { ok: true, user };
}

async function remover(kind: RecordKind): Promise<{ ok: true; user: TeamUser } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!canWriteRole(user.role, user.active)) return { ok: false, error: READONLY };
  if (!canRemove(user.role, kind, user.active)) return { ok: false, error: ADMIN_ONLY };
  return { ok: true, user };
}

async function audit(
  supabase: Supabase,
  action: string,
  entityType: string,
  entityId: string,
  userId: string,
  metadata: Record<string, unknown> = {}
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

function fail(message: string, error: { message?: string } | null): EditState {
  if (error) console.error(`[edicao] ${message}`, error.message);
  return { error: message };
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

/** Conta quantos registros de cada tabela apontam para o id. */
async function countLinks(
  supabase: Supabase,
  column: "lead_id" | "client_id" | "case_id",
  id: string,
  tables: { key: keyof Links; table: string }[]
): Promise<Links | null> {
  const results = await Promise.all(
    tables.map((t) => supabase.from(t.table).select("id", { count: "exact", head: true }).eq(column, id))
  );
  if (results.some((r) => r.error)) return null;
  return Object.fromEntries(tables.map((t, i) => [t.key, results[i].count ?? 0])) as Links;
}

// ===========================================================================
// LEADS
// ===========================================================================
export async function updateLeadAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const parsed = parseLeadEdit(formData, demo());
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const w = await writer();
  if (!w.ok) return { error: w.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const patch = buildLeadPatch(parsed.data);
  const { error } = await supabase.from("leads").update(patch).eq("id", id.data);
  if (error) return fail("Não foi possível salvar o lead.", error);
  await audit(supabase, "update_lead", "lead", id.data, w.user.id, {
    commercial_status: patch.commercial_status,
    legal_status: patch.legal_status,
    financial_status: patch.financial_status,
    assigned_to: patch.assigned_to,
  });
  revalidatePath("/leads");
  revalidatePath(`/leads/${id.data}`);
  return { ok: true };
}

export async function deleteLeadAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const r = await remover("lead");
  if (!r.ok) return { error: r.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const links = await countLinks(supabase, "lead_id", id.data, [
    { key: "clients", table: "clients" },
    { key: "cases", table: "cases" },
    { key: "contracts", table: "contracts" },
  ]);
  if (!links) return { error: "Não consegui conferir os vínculos do lead agora. Tente de novo." };
  const blocked = removalBlockReason("lead", links);
  if (blocked) return { error: blocked };

  const { data: lead } = await supabase.from("leads").select("full_name").eq("id", id.data).maybeSingle();
  const { error } = await supabase.from("leads").delete().eq("id", id.data);
  if (error) return fail("Não foi possível remover o lead.", error);
  await audit(supabase, "delete_lead", "lead", id.data, r.user.id, { nome: lead?.full_name ?? null });
  revalidatePath("/leads");
  redirect("/leads");
}

// ===========================================================================
// CLIENTES
// ===========================================================================
export async function updateClientAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const parsed = parseClientEdit(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const w = await writer();
  if (!w.ok) return { error: w.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const patch = buildClientPatch(parsed.data);
  const { error } = await supabase.from("clients").update(patch).eq("id", id.data);
  if (error) return fail("Não foi possível salvar o cliente.", error);
  await audit(supabase, "update_client", "client", id.data, w.user.id, { status: patch.status });
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id.data}`);
  return { ok: true };
}

export async function deleteClientAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const r = await remover("client");
  if (!r.ok) return { error: r.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const links = await countLinks(supabase, "client_id", id.data, [
    { key: "cases", table: "cases" },
    { key: "contracts", table: "contracts" },
    { key: "payments", table: "payments" },
  ]);
  if (!links) return { error: "Não consegui conferir os vínculos do cliente agora. Tente de novo." };
  const blocked = removalBlockReason("client", links);
  if (blocked) return { error: blocked };

  const { data: client } = await supabase.from("clients").select("full_name").eq("id", id.data).maybeSingle();
  const { error } = await supabase.from("clients").delete().eq("id", id.data);
  if (error) return fail("Não foi possível remover o cliente.", error);
  await audit(supabase, "delete_client", "client", id.data, r.user.id, { nome: client?.full_name ?? null });
  revalidatePath("/clientes");
  redirect("/clientes");
}

// ===========================================================================
// CASOS
// ===========================================================================
export async function updateCaseAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const parsed = parseCaseEdit(formData, demo());
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const w = await writer();
  if (!w.ok) return { error: w.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const patch = buildCasePatch(parsed.data);
  const { error } = await supabase.from("cases").update(patch).eq("id", id.data);
  if (error) return fail("Não foi possível salvar o caso.", error);
  await audit(supabase, "update_case", "case", id.data, w.user.id, {
    status: patch.status,
    assigned_to: patch.assigned_to,
  });
  revalidatePath("/casos");
  revalidatePath(`/casos/${id.data}`);
  if (patch.client_id) revalidatePath(`/clientes/${patch.client_id}`);
  return { ok: true };
}

export async function deleteCaseAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const r = await remover("case");
  if (!r.ok) return { error: r.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const links = await countLinks(supabase, "case_id", id.data, [
    { key: "processes", table: "processes" },
    { key: "contracts", table: "contracts" },
  ]);
  if (!links) return { error: "Não consegui conferir os vínculos do caso agora. Tente de novo." };
  const blocked = removalBlockReason("case", links);
  if (blocked) return { error: blocked };

  const { data: row } = await supabase.from("cases").select("title").eq("id", id.data).maybeSingle();
  const { error } = await supabase.from("cases").delete().eq("id", id.data);
  if (error) return fail("Não foi possível remover o caso.", error);
  await audit(supabase, "delete_case", "case", id.data, r.user.id, { titulo: row?.title ?? null });
  revalidatePath("/casos");
  redirect("/casos");
}

// ===========================================================================
// TAREFAS, FOLLOW-UPS e AGENDA
// ===========================================================================
/**
 * Status e responsável só mudam quando o formulário traz o campo: um
 * formulário sem a lista da equipe não apaga o responsável que já existe.
 */
function optionalFields(formData: FormData, d: { status: string; assigned_to?: string }) {
  return {
    ...(formData.has("status") ? { status: d.status } : {}),
    ...(formData.has("assigned_to") ? { assigned_to: d.assigned_to ?? null } : {}),
  };
}

function revalidateOps(path: string, leadId?: string | null) {
  revalidatePath(path);
  revalidatePath("/dashboard");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

export async function updateTaskAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const parsed = parseTaskForm(formData, demo());
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const dueDate = brInputToIso(parsed.data.due_date);
  if (parsed.data.due_date && !dueDate) return { error: "Prazo inválido." };
  const w = await writer();
  if (!w.ok) return { error: w.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      due_date: dueDate,
      priority: parsed.data.priority,
      ...optionalFields(formData, parsed.data),
    })
    .eq("id", id.data)
    .select("lead_id")
    .maybeSingle();
  if (error) return fail("Não foi possível salvar a tarefa.", error);
  await audit(supabase, "update_task", "task", id.data, w.user.id, { status: parsed.data.status });
  revalidateOps("/tarefas", data?.lead_id);
  return { ok: true };
}

export async function updateFollowUpAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const parsed = parseFollowUpForm(formData, demo());
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const scheduledAt = brInputToIso(parsed.data.scheduled_at);
  if (!scheduledAt) return { error: "Data inválida." };
  const w = await writer();
  if (!w.ok) return { error: w.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .update({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      scheduled_at: scheduledAt,
      ...optionalFields(formData, parsed.data),
    })
    .eq("id", id.data)
    .select("lead_id")
    .maybeSingle();
  if (error) return fail("Não foi possível salvar o follow-up.", error);
  await audit(supabase, "update_follow_up", "follow_up", id.data, w.user.id, { status: parsed.data.status });
  revalidateOps("/follow-up", data?.lead_id);
  return { ok: true };
}

export async function updateAppointmentAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const parsed = parseAppointmentForm(formData, demo());
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const w = await writer();
  if (!w.ok) return { error: w.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      title: parsed.data.title,
      date: parsed.data.date,
      start_time: parsed.data.start_time,
      end_time: parsed.data.end_time ?? null,
      modality: parsed.data.modality,
      meeting_link: parsed.data.meeting_link ?? null,
      notes: parsed.data.notes ?? null,
      ...optionalFields(formData, parsed.data),
    })
    .eq("id", id.data)
    .select("lead_id")
    .maybeSingle();
  if (error) return fail("Não foi possível salvar o compromisso.", error);
  await audit(supabase, "update_appointment", "appointment", id.data, w.user.id, { status: parsed.data.status });
  revalidateOps("/agenda", data?.lead_id);
  return { ok: true };
}

const OPS: Record<"task" | "follow_up" | "appointment", { table: string; path: string; label: string }> = {
  task: { table: "tasks", path: "/tarefas", label: "a tarefa" },
  follow_up: { table: "follow_ups", path: "/follow-up", label: "o follow-up" },
  appointment: { table: "appointments", path: "/agenda", label: "o compromisso" },
};

/** Remove tarefa, follow-up ou compromisso (quem grava pode; fica na Auditoria). */
export async function deleteOperationAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const kind = String(formData.get("kind") ?? "") as keyof typeof OPS;
  const cfg = OPS[kind];
  if (!cfg) return { error: "Registro inválido." };
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const r = await remover(kind);
  if (!r.ok) return { error: r.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(cfg.table)
    .delete()
    .eq("id", id.data)
    .select("lead_id, title")
    .maybeSingle();
  if (error) return fail(`Não foi possível remover ${cfg.label}.`, error);
  if (!data) return { error: `Não encontrei ${cfg.label}. Talvez já tenha sido removido.` };
  await audit(supabase, `delete_${kind}`, kind, id.data, r.user.id, { titulo: data.title ?? null });
  revalidateOps(cfg.path, data.lead_id as string | null);
  return { ok: true };
}

// ===========================================================================
// Troca rápida de status
// ===========================================================================
const QUICK_PATHS: Record<QuickKind, string> = {
  task: "/tarefas",
  follow_up: "/follow-up",
  appointment: "/agenda",
  client: "/clientes",
  conversation: "/conversas",
};

/** Concluir, reabrir, cancelar, inativar, encerrar conversa... */
export async function setStatusAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const kind = String(formData.get("kind") ?? "") as QuickKind;
  if (!(kind in QUICK_TABLE)) return { error: "Registro inválido." };
  const status = String(formData.get("status") ?? "");
  if (!isQuickStatus(kind, status)) return { error: "Status inválido." };
  const id = parseId(formData, demo());
  if (!id.success) return { error: firstIssue(id.error) };
  const w = await writer();
  if (!w.ok) return { error: w.error };
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { error } = await supabase.from(QUICK_TABLE[kind]).update({ status }).eq("id", id.data);
  if (error) return fail("Não foi possível mudar o status.", error);
  await audit(supabase, "set_status", kind, id.data, w.user.id, { status });
  revalidatePath(QUICK_PATHS[kind]);
  revalidatePath("/dashboard");
  if (kind === "client") revalidatePath(`/clientes/${id.data}`);
  if (kind === "conversation") revalidatePath(`/conversas/${id.data}`);
  return { ok: true };
}

// ===========================================================================
// Notificações (todo perfil ativo, inclusive o Visualizador)
// ===========================================================================
export async function markNotificationReadAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await getCurrentUser();
  if (!user.active) return { error: "Perfil inativo." };
  const all = formData.get("all") === "1";
  const id = all ? null : parseId(formData, demo());
  if (id && !id.success) return { error: firstIssue(id.error) };
  const read = formData.get("read") !== "0";
  if (demo()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const query = supabase.from("notifications").update({ read });
  const { error } = all ? await query.eq("read", false) : await query.eq("id", id!.data!);
  if (error) return fail("Não foi possível atualizar a notificação.", error);
  revalidatePath("/notificacoes");
  revalidatePath("/dashboard");
  return { ok: true };
}
