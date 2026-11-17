"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { toSaoPauloIso } from "@/lib/assistant/draft-schema";
import { getProcess } from "@/lib/data/movements";
import { getCalculation, isCalculationClosed, listActiveCalendarDays } from "@/lib/data/prazos";
import { isIsoDate } from "@/lib/prazos/calendar";
import { computeDeadline, MAX_DAYS } from "@/lib/prazos/compute";
import type { DeadlineInput, DeadlineResult } from "@/lib/prazos/types";

/**
 * Ações dos prazos (fase 5). O cálculo é sempre feito no servidor; o
 * histórico só acrescenta registros (o banco recusa alterar ou apagar).
 * Visualizador calcula, mas não grava. No modo demonstração calcula de
 * verdade e não grava nada.
 */

export interface PrazoActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  input?: DeadlineInput;
  result?: DeadlineResult;
  /** Registro do histórico que a tela está mostrando ("demo" sem Supabase). */
  calculationId?: string | null;
  processId?: string | null;
  /** A conta foi confirmada (tarefa criada) ou descartada. */
  closed?: "confirmacao" | "descarte";
  taskLink?: string;
}

const DEMO_NOTICE = "Modo demonstração: a conta é feita de verdade, mas nada é gravado. Configure o Supabase para registrar.";
const READONLY_NOTICE = "Seu perfil só pode consultar: a conta foi feita, mas não foi registrada.";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DEMO_ID_RE = /^[a-z]+-\d{3}$/;
const optionalId = z
  .string()
  .trim()
  .transform((v) => v || null)
  .refine((v) => v === null || UUID_RE.test(v) || (!isSupabaseConfigured() && DEMO_ID_RE.test(v)), "Registro inválido.");

const isoDate = z.string().refine(isIsoDate, "Data inválida.");

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

async function writer(): Promise<{ error: string } | { userId: string; readonly: boolean }> {
  const user = await getCurrentUser();
  if (!user.active) return { error: "Perfil inativo." };
  return { userId: user.id, readonly: user.role === "visualizador" };
}

async function audit(action: string, entityType: string, entityId: string, userId: string, metadata: Record<string, unknown> = {}) {
  try {
    const supabase = await createClient();
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

function refresh(processId?: string | null) {
  revalidatePath("/prazos");
  if (processId) revalidatePath(`/processos/${processId}`);
}

// ---------------------------------------------------------------------------
// Calcular
// ---------------------------------------------------------------------------

const calcSchema = z.object({
  start_kind: z.enum(["disponibilizacao", "intimacao"], { error: "Escolha o tipo de início." }),
  start_date: isoDate,
  days: z.coerce
    .number({ error: "Informe o número de dias." })
    .int("Use um número inteiro de dias.")
    .min(1, "Informe o número de dias (1 ou mais).")
    .max(MAX_DAYS, `Prazo longo demais (máx. ${MAX_DAYS} dias).`),
  unit: z.enum(["uteis", "corridos"], { error: "Escolha dias úteis ou corridos." }),
  dobro: z.boolean(),
  comarca: z.string().trim().max(120, "Comarca longa demais."),
  process_id: optionalId,
});

export async function calculateDeadlineAction(_prev: PrazoActionState, formData: FormData): Promise<PrazoActionState> {
  const parsed = calcSchema.safeParse({
    start_kind: text(formData, "start_kind"),
    start_date: text(formData, "start_date"),
    days: text(formData, "days"),
    unit: text(formData, "unit"),
    dobro: formData.get("dobro") === "on" || formData.get("dobro") === "true",
    comarca: text(formData, "comarca"),
    process_id: text(formData, "process_id"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const g = await writer();
  if ("error" in g) return g;

  const d = parsed.data;
  if (d.process_id && !(await getProcess(d.process_id))) return { error: "Processo não encontrado." };

  const input: DeadlineInput = {
    start: { kind: d.start_kind, date: d.start_date },
    days: d.days,
    unit: d.unit,
    ...(d.dobro ? { dobro: true } : {}),
    ...(d.comarca ? { comarca: d.comarca } : {}),
  };
  const result = computeDeadline(input, await listActiveCalendarDays());
  const base = { ok: true, input, result, processId: d.process_id };

  if (!isSupabaseConfigured()) return { ...base, calculationId: "demo", message: DEMO_NOTICE };
  if (g.readonly) return { ...base, calculationId: null, message: READONLY_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deadline_calculations")
    .insert({
      process_id: d.process_id,
      action: "calculo",
      input,
      result,
      final_date: result.finalDate,
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ...base, calculationId: null, error: "A conta foi feita, mas não consegui registrar no histórico." };
  await audit("calculate_deadline", "deadline_calculation", data.id, g.userId, {
    process_id: d.process_id,
    final_date: result.finalDate,
  });
  refresh(d.process_id);
  return { ...base, calculationId: data.id, message: "Conta registrada no histórico. Confira e confirme." };
}

// ---------------------------------------------------------------------------
// Confirmar, ajustar, descartar
// ---------------------------------------------------------------------------

async function loadOpen(id: string): Promise<{ error: string } | { calc: NonNullable<Awaited<ReturnType<typeof getCalculation>>> }> {
  const calc = await getCalculation(id);
  if (!calc || calc.action === "confirmacao" || calc.action === "descarte" || !calc.final_date) {
    return { error: "Cálculo não encontrado." };
  }
  if (await isCalculationClosed(id)) return { error: "Este cálculo já foi confirmado ou descartado." };
  return { calc };
}

const confirmSchema = z.object({
  calculation_id: z.string().refine((v) => UUID_RE.test(v), "Calcule o prazo antes de confirmar."),
  title: z.string().trim().min(2, "Diga o que vence (ex.: Contestação).").max(200, "Título longo demais."),
  process_id: optionalId,
  update_process_deadline: z.boolean(),
  description: z.string().trim().max(2000, "Observação longa demais (máx. 2.000)."),
});

/**
 * Confirma a conta: cria a tarefa de prazo (prioridade alta), igual ao
 * rascunho "prazo" do assistente, e registra a confirmação no histórico.
 */
export async function confirmDeadlineAction(prev: PrazoActionState, formData: FormData): Promise<PrazoActionState> {
  const g = await writer();
  if ("error" in g) return { ...prev, ok: false, message: undefined, error: g.error };
  if (g.readonly) return { ...prev, ok: false, message: undefined, error: "Seu perfil só pode consultar." };
  if (!isSupabaseConfigured()) {
    return { ...prev, ok: true, error: undefined, message: "Modo demonstração: prazo conferido, mas nenhuma tarefa foi criada." };
  }
  const parsed = confirmSchema.safeParse({
    calculation_id: text(formData, "calculation_id"),
    title: text(formData, "title"),
    process_id: text(formData, "process_id"),
    update_process_deadline: formData.get("update_process_deadline") === "on",
    description: text(formData, "description"),
  });
  if (!parsed.success) return { ...prev, ok: false, message: undefined, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const open = await loadOpen(d.calculation_id);
  if ("error" in open) return { ...prev, ok: false, message: undefined, error: open.error };
  const { calc } = open;
  const processId = d.process_id ?? calc.process_id;
  if (processId && !(await getProcess(processId))) return { ...prev, ok: false, message: undefined, error: "Processo não encontrado." };
  if (d.update_process_deadline && !processId) {
    return { ...prev, ok: false, message: undefined, error: "Escolha o processo para atualizar o próximo prazo." };
  }

  const finalDate = calc.final_date!;
  const due = toSaoPauloIso(finalDate, true);
  const supabase = await createClient();
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      title: `Prazo: ${d.title}`,
      description: d.description || null,
      due_date: due,
      priority: "alta",
      status: "pendente",
      assigned_to: g.userId,
      process_id: processId,
    })
    .select("id")
    .single();
  if (taskError || !task) return { ...prev, ok: false, message: undefined, error: "Não consegui criar a tarefa do prazo." };

  const { data: rec, error: recError } = await supabase
    .from("deadline_calculations")
    .insert({
      process_id: processId,
      task_id: task.id,
      previous_id: calc.id,
      action: "confirmacao",
      input: calc.input,
      result: calc.result,
      final_date: finalDate,
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (recError || !rec) {
    // Sem o registro no histórico a tarefa não vale: desfaz.
    await supabase.from("tasks").delete().eq("id", task.id);
    return {
      ...prev,
      ok: false,
      message: undefined,
      error: recError?.code === "23505" ? "Este cálculo já foi confirmado ou descartado." : "Não consegui registrar a confirmação.",
    };
  }

  if (d.update_process_deadline && processId) {
    await supabase
      .from("processes")
      .update({ next_deadline: due, updated_at: new Date().toISOString() })
      .eq("id", processId);
  }

  await audit("confirm_deadline", "deadline_calculation", rec.id, g.userId, {
    previous_id: calc.id,
    task_id: task.id,
    process_id: processId,
    final_date: finalDate,
    update_process_deadline: d.update_process_deadline,
  });
  refresh(processId);
  revalidatePath("/tarefas");
  return {
    ...prev,
    ok: true,
    error: undefined,
    closed: "confirmacao",
    calculationId: rec.id,
    taskLink: "/tarefas",
    message: "Prazo confirmado: a tarefa foi criada com prioridade alta.",
  };
}

const adjustSchema = z.object({
  calculation_id: z.string().refine((v) => UUID_RE.test(v), "Calcule o prazo antes de ajustar."),
  final_date: isoDate,
  reason: z.string().trim().min(5, "Explique o motivo do ajuste.").max(1000, "Motivo longo demais (máx. 1.000)."),
});

/** O advogado corrige a data final: novo registro "ajuste" ligado ao anterior. */
export async function adjustDeadlineAction(prev: PrazoActionState, formData: FormData): Promise<PrazoActionState> {
  const g = await writer();
  if ("error" in g) return { ...prev, ok: false, message: undefined, error: g.error };
  if (g.readonly) return { ...prev, ok: false, message: undefined, error: "Seu perfil só pode consultar." };
  const parsed = adjustSchema.safeParse({
    calculation_id: isSupabaseConfigured() ? text(formData, "calculation_id") : "00000000-0000-0000-0000-000000000000",
    final_date: text(formData, "final_date"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return { ...prev, ok: false, message: undefined, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;
  if (!isSupabaseConfigured()) {
    return { ...prev, ok: true, error: undefined, message: `Modo demonstração: ajuste para ${d.final_date.split("-").reverse().join("/")} conferido, mas não gravado.` };
  }

  const open = await loadOpen(d.calculation_id);
  if ("error" in open) return { ...prev, ok: false, message: undefined, error: open.error };
  const { calc } = open;
  if (d.final_date === calc.final_date) return { ...prev, ok: false, message: undefined, error: "A data é a mesma da conta." };

  const result = { ...calc.result, adjusted: { from: calc.final_date!, to: d.final_date } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deadline_calculations")
    .insert({
      process_id: calc.process_id,
      previous_id: calc.id,
      action: "ajuste",
      input: calc.input,
      result,
      final_date: d.final_date,
      reason: d.reason,
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ...prev, ok: false, message: undefined, error: "Não consegui registrar o ajuste." };
  await audit("adjust_deadline", "deadline_calculation", data.id, g.userId, {
    previous_id: calc.id,
    from: calc.final_date,
    to: d.final_date,
  });
  refresh(calc.process_id);
  return {
    ...prev,
    ok: true,
    error: undefined,
    calculationId: data.id,
    result: { ...(prev.result ?? calc.result), finalDate: d.final_date },
    message: "Ajuste registrado. Agora confirme para criar o prazo.",
  };
}

const discardSchema = z.object({
  calculation_id: z.string().refine((v) => UUID_RE.test(v), "Nada para descartar."),
  reason: z.string().trim().max(1000, "Motivo longo demais (máx. 1.000)."),
});

/** Descarta a conta (fica no histórico como descartada). */
export async function discardDeadlineAction(prev: PrazoActionState, formData: FormData): Promise<PrazoActionState> {
  const g = await writer();
  if ("error" in g) return { ...prev, ok: false, message: undefined, error: g.error };
  if (g.readonly) return { ...prev, ok: false, message: undefined, error: "Seu perfil só pode consultar." };
  if (!isSupabaseConfigured()) return { ...prev, ok: true, error: undefined, message: "Modo demonstração: nada foi gravado." };
  const parsed = discardSchema.safeParse({
    calculation_id: text(formData, "calculation_id"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return { ...prev, ok: false, message: undefined, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const open = await loadOpen(parsed.data.calculation_id);
  if ("error" in open) return { ...prev, ok: false, message: undefined, error: open.error };
  const { calc } = open;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deadline_calculations")
    .insert({
      process_id: calc.process_id,
      previous_id: calc.id,
      action: "descarte",
      input: calc.input,
      result: calc.result,
      final_date: calc.final_date,
      reason: parsed.data.reason || null,
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ...prev, ok: false, message: undefined, error: "Não consegui registrar o descarte." };
  await audit("discard_deadline", "deadline_calculation", data.id, g.userId, { previous_id: calc.id });
  refresh(calc.process_id);
  return { ...prev, ok: true, error: undefined, closed: "descarte", calculationId: data.id, message: "Cálculo descartado." };
}

// ---------------------------------------------------------------------------
// Calendário (só Admin)
// ---------------------------------------------------------------------------

export interface CalendarActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const addDaySchema = z
  .object({
    day: isoDate,
    kind: z.enum(["feriado", "suspensao", "ponto_facultativo", "feriado_municipal"], { error: "Escolha o tipo." }),
    comarca: z.string().trim().max(120, "Comarca longa demais."),
    description: z.string().trim().min(3, "Descreva o dia (ex.: Aniversário da cidade).").max(200, "Descrição longa demais."),
    source: z.string().trim().min(3, "Informe a fonte (lei, provimento ou comunicado).").max(300, "Fonte longa demais."),
    source_url: z
      .string()
      .trim()
      .max(500, "Endereço longo demais.")
      .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "O link da fonte precisa começar com https://."),
  })
  .refine((d) => d.kind !== "feriado_municipal" || d.comarca.length > 0, {
    message: "Feriado municipal precisa da comarca.",
  });

export async function addCalendarDayAction(_prev: CalendarActionState, formData: FormData): Promise<CalendarActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };
  const parsed = addDaySchema.safeParse({
    day: text(formData, "day"),
    kind: text(formData, "kind"),
    comarca: text(formData, "comarca"),
    description: text(formData, "description"),
    source: text(formData, "source"),
    source_url: text(formData, "source_url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (!isSupabaseConfigured()) return { ok: true, message: "Modo demonstração: configure o Supabase para gravar o calendário." };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forensic_calendar_days")
    .insert({
      court: "TJSP",
      day: d.day,
      kind: d.kind,
      comarca: d.comarca || null,
      description: d.description,
      source: d.source,
      source_url: d.source_url || null,
      created_by: admin.user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Falha ao cadastrar o dia." };
  await audit("add_calendar_day", "forensic_calendar_day", data.id, admin.user.id, { day: d.day, kind: d.kind, comarca: d.comarca || null });
  revalidatePath("/prazos/calendario");
  revalidatePath("/prazos");
  return { ok: true, message: "Dia cadastrado. Ele já entra nas próximas contas." };
}

const removeDaySchema = z.object({
  id: z.string().refine((v) => UUID_RE.test(v) || (!isSupabaseConfigured() && /^cal-[\w-]+$/.test(v)), "Dia inválido."),
  reason: z.string().trim().min(3, "Informe o motivo da remoção.").max(500, "Motivo longo demais."),
});

/** Remove um dia (fica registrado, riscado, com o motivo). */
export async function removeCalendarDayAction(_prev: CalendarActionState, formData: FormData): Promise<CalendarActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };
  const parsed = removeDaySchema.safeParse({ id: text(formData, "id"), reason: text(formData, "reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (!isSupabaseConfigured()) return { ok: true, message: "Modo demonstração: configure o Supabase para gravar o calendário." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forensic_calendar_days")
    .update({ removed_at: new Date().toISOString(), removed_by: admin.user.id, removed_reason: parsed.data.reason })
    .eq("id", parsed.data.id)
    .is("removed_at", null)
    .select("id");
  if (error || !data?.length) return { error: "Falha ao remover o dia (talvez já tenha sido removido)." };
  await audit("remove_calendar_day", "forensic_calendar_day", parsed.data.id, admin.user.id, { reason: parsed.data.reason });
  revalidatePath("/prazos/calendario");
  revalidatePath("/prazos");
  return { ok: true, message: "Dia removido. Ele continua no histórico, riscado." };
}
