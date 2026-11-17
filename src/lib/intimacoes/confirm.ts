import type { SupabaseClient } from "@supabase/supabase-js";
import { toSaoPauloIso } from "@/lib/assistant/draft-schema";
import { brDay, isIsoDate } from "@/lib/prazos/calendar";
import { MAX_DAYS } from "@/lib/prazos/compute";
import type { CalendarDay, DeadlineResult } from "@/lib/prazos/types";
import { comarcaOf, computePublicationDeadline, movementDescription, uncertainSet } from "./rules";
import type { ConfirmPublicationInput, ConfirmPublicationResult, CourtPublication } from "./types";

/**
 * Conferência das intimações (fase 5, parte B). Serve à tela (cliente do
 * usuário, com RLS) e ao WhatsApp (service client): por isso o cliente vem
 * por parâmetro e quem confere (userId) é sempre explícito.
 *
 * Ordem da confirmação, igual à da tela de prazos:
 *   1. "calculo" em deadline_calculations (com publication_id);
 *   2. "ajuste" ligado ao anterior, quando o advogado escolheu outra data;
 *   3. tarefa "Prazo: ..." (alta, pendente, vence 23:59 em São Paulo);
 *   4. "confirmacao" ligada ao último registro e à tarefa
 *      (se falhar, a tarefa é desfeita: sem histórico, ela não vale);
 *   5. andamento no processo (source 'djen'), quando há processo;
 *   6. próximo prazo do processo, quando pedido;
 *   7. intimação marcada como confirmada, com os vínculos;
 *   8. auditoria, com o canal.
 */

type Db = SupabaseClient;
type Channel = "painel" | "whatsapp";

const UUID_RE = /^[0-9a-f-]{36}$/i;
export const ALREADY_REVIEWED = "Esta intimação já foi conferida.";

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

async function audit(db: Db, action: string, publicationId: string, userId: string, metadata: Record<string, unknown>) {
  try {
    await db.from("audit_logs").insert({
      user_id: UUID_RE.test(userId) ? userId : null,
      action,
      entity_type: "court_publication",
      entity_id: publicationId,
      metadata,
    });
  } catch {
    // auditoria não bloqueia
  }
}

/** Carrega a intimação ainda aberta (para conferir). */
async function loadOpen(db: Db, id: string): Promise<{ error: string } | { pub: CourtPublication }> {
  if (!UUID_RE.test(id)) return { error: "Intimação não encontrada." };
  const { data, error } = await db.from("court_publications").select("*").eq("id", id).maybeSingle();
  if (error) return { error: "Não consegui ler a intimação." };
  if (!data) return { error: "Intimação não encontrada." };
  const pub = data as CourtPublication;
  if (pub.status !== "para_conferir") return { error: ALREADY_REVIEWED };
  return { pub };
}

/** Dias do calendário forense que valem na conta (sem os removidos). */
async function loadCalendar(db: Db): Promise<CalendarDay[] | null> {
  const { data, error } = await db
    .from("forensic_calendar_days")
    .select("*")
    .eq("court", "TJSP")
    .is("removed_at", null)
    .order("day", { ascending: true })
    .limit(5000);
  if (error || !data) return null;
  return data as CalendarDay[];
}

function validate(input: ConfirmPublicationInput): string | null {
  if (!input || !UUID_RE.test(input.publicationId ?? "")) return "Intimação não encontrada.";
  if (!input.userId) return "Usuário não identificado.";
  if (!Number.isInteger(input.days) || input.days < 1) return "Informe o número de dias (1 ou mais).";
  if (input.days > MAX_DAYS) return `Prazo longo demais (máx. ${MAX_DAYS} dias).`;
  if (input.unit !== "uteis" && input.unit !== "corridos") return "Escolha dias úteis ou corridos.";
  if (input.startKind !== "disponibilizacao" && input.startKind !== "intimacao") return "Escolha de onde o prazo conta.";
  const title = (input.title ?? "").trim();
  if (title.length < 2) return "Diga o que vence (ex.: Contestação).";
  if (title.length > 200) return "Título longo demais.";
  if (input.processId && !UUID_RE.test(input.processId)) return "Processo não encontrado.";
  if (input.overrideFinalDate) {
    if (!isIsoDate(input.overrideFinalDate)) return "Data ajustada inválida.";
    const reason = (input.overrideReason ?? "").trim();
    if (reason.length < 5) return "Explique o motivo do ajuste da data.";
    if (reason.length > 1000) return "Motivo longo demais (máx. 1.000).";
  }
  if ((input.note ?? "").length > 2000) return "Observação longa demais (máx. 2.000).";
  return null;
}

export async function confirmPublication(db: Db, input: ConfirmPublicationInput): Promise<ConfirmPublicationResult> {
  const invalid = validate(input);
  if (invalid) return fail(invalid);

  const open = await loadOpen(db, input.publicationId);
  if ("error" in open) return fail(open.error);
  const { pub } = open;
  if (pub.cancelled) return fail("Esta intimação foi cancelada no DJEN. Descarte-a com o motivo.");

  // Processo: o escolhido na conferência ou o ligado pela captura.
  const processId = input.processId !== undefined ? input.processId || null : pub.process_id;
  let jurisdiction: string | null = null;
  if (processId) {
    const { data: proc } = await db.from("processes").select("id, jurisdiction").eq("id", processId).maybeSingle();
    if (!proc) return fail("Processo não encontrado.");
    jurisdiction = (proc as { jurisdiction: string | null }).jurisdiction ?? null;
  }
  const updateProcessDeadline = input.updateProcessDeadline ?? Boolean(processId);
  if (updateProcessDeadline && !processId) return fail("Escolha o processo para atualizar o próximo prazo.");

  const calendar = await loadCalendar(db);
  if (!calendar) return fail("Não consegui ler o calendário forense. Tente de novo.");

  let computed: ReturnType<typeof computePublicationDeadline>;
  try {
    computed = computePublicationDeadline(
      pub,
      { days: input.days, unit: input.unit, startKind: input.startKind, dobro: input.dobro, comarca: comarcaOf(jurisdiction) },
      calendar
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Não consegui calcular o prazo.");
  }
  const { input: calcInput, result } = computed;

  // 1. Cálculo
  const { data: calc, error: calcError } = await db
    .from("deadline_calculations")
    .insert({
      process_id: processId,
      publication_id: pub.id,
      action: "calculo",
      input: calcInput,
      result,
      final_date: result.finalDate,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (calcError || !calc) return fail("Não consegui registrar o cálculo no histórico.");

  // 2. Ajuste (motivo obrigatório)
  let last: { id: string; result: DeadlineResult & { adjusted?: { from: string; to: string } }; finalDate: string } = {
    id: (calc as { id: string }).id,
    result,
    finalDate: result.finalDate,
  };
  const override = input.overrideFinalDate && input.overrideFinalDate !== result.finalDate ? input.overrideFinalDate : null;
  if (override) {
    const adjusted = { ...result, adjusted: { from: result.finalDate, to: override } };
    const { data: adj, error: adjError } = await db
      .from("deadline_calculations")
      .insert({
        process_id: processId,
        publication_id: pub.id,
        previous_id: last.id,
        action: "ajuste",
        input: calcInput,
        result: adjusted,
        final_date: override,
        reason: (input.overrideReason ?? "").trim(),
        created_by: input.userId,
      })
      .select("id")
      .single();
    if (adjError || !adj) return fail("Não consegui registrar o ajuste da data.");
    last = { id: (adj as { id: string }).id, result: adjusted, finalDate: override };
  }

  // 3. Tarefa
  const finalDate = last.finalDate;
  const due = toSaoPauloIso(finalDate, true);
  const title = input.title.trim();
  const note = (input.note ?? "").trim();
  const description = [
    note,
    `Intimação do DJEN disponibilizada em ${brDay(pub.available_date)}${pub.process_number_masked ? `, processo ${pub.process_number_masked}` : ""}.`,
    override ? `Data ajustada pelo advogado (a conta deu ${brDay(result.finalDate)}): ${(input.overrideReason ?? "").trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const { data: task, error: taskError } = await db
    .from("tasks")
    .insert({
      title: `Prazo: ${title}`,
      description,
      due_date: due,
      priority: "alta",
      status: "pendente",
      assigned_to: input.userId,
      process_id: processId,
    })
    .select("id")
    .single();
  if (taskError || !task) return fail("Não consegui criar a tarefa do prazo.");
  const taskId = (task as { id: string }).id;

  // 4. Confirmação no histórico
  const { data: rec, error: recError } = await db
    .from("deadline_calculations")
    .insert({
      process_id: processId,
      publication_id: pub.id,
      task_id: taskId,
      previous_id: last.id,
      action: "confirmacao",
      input: calcInput,
      result: last.result,
      final_date: finalDate,
      reason: note || null,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (recError || !rec) {
    // Sem o registro no histórico a tarefa não vale: desfaz.
    await db.from("tasks").delete().eq("id", taskId);
    return fail(recError?.code === "23505" ? ALREADY_REVIEWED : "Não consegui registrar a confirmação.");
  }
  const calculationId = (rec as { id: string }).id;

  // 5. Andamento no processo
  let movementId: string | null = null;
  const warnings: string[] = [];
  if (processId) {
    const externalKey = `djen:${pub.external_key}`;
    const { data: mov, error: movError } = await db
      .from("process_movements")
      .insert({
        process_id: processId,
        occurred_at: toSaoPauloIso(pub.available_date),
        description: movementDescription(pub, finalDate),
        source: "djen",
        external_key: externalKey,
        created_by: input.userId,
      })
      .select("id")
      .single();
    if (mov) movementId = (mov as { id: string }).id;
    else if (movError?.code === "23505") {
      const { data: existing } = await db
        .from("process_movements")
        .select("id")
        .eq("process_id", processId)
        .eq("external_key", externalKey)
        .maybeSingle();
      movementId = (existing as { id: string } | null)?.id ?? null;
    } else warnings.push("andamento não lançado");
  }

  // 6. Próximo prazo do processo
  if (updateProcessDeadline && processId) {
    const { error } = await db
      .from("processes")
      .update({ next_deadline: due, updated_at: new Date().toISOString() })
      .eq("id", processId);
    if (error) warnings.push("próximo prazo do processo não atualizado");
  }

  // 7. Intimação conferida (só se ainda estiver aberta)
  const { data: marked, error: markError } = await db
    .from("court_publications")
    .update({
      status: "confirmada",
      reviewed_by: input.userId,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
      calculation_id: calculationId,
      task_id: taskId,
      movement_id: movementId,
      process_id: processId,
    })
    .eq("id", pub.id)
    .eq("status", "para_conferir")
    .select("id");
  if (markError || !marked || (marked as unknown[]).length === 0) {
    // Outra pessoa conferiu ao mesmo tempo (ou o banco recusou): a tarefa
    // desta tentativa sai, para não ficar prazo em dobro.
    await db.from("tasks").delete().eq("id", taskId);
    const { data: now } = await db.from("court_publications").select("status").eq("id", pub.id).maybeSingle();
    const closed = (now as { status?: string } | null)?.status && (now as { status: string }).status !== "para_conferir";
    return fail(closed ? ALREADY_REVIEWED : "Não consegui marcar a intimação como conferida.");
  }

  // 8. Auditoria
  await audit(db, "confirm_publication", pub.id, input.userId, {
    channel: input.channel,
    calculation_id: calculationId,
    task_id: taskId,
    movement_id: movementId,
    process_id: processId,
    final_date: finalDate,
    computed_final_date: result.finalDate,
    adjusted: Boolean(override),
    days: input.days,
    unit: input.unit,
    start_kind: input.startKind,
    dobro: input.dobro,
    update_process_deadline: updateProcessDeadline,
    ...(warnings.length ? { warnings } : {}),
  });

  return { ok: true, finalDate, taskId, calculationId, movementId, processId };
}

export async function discardPublication(
  db: Db,
  input: { publicationId: string; userId: string; reason: string; channel: Channel }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = (input.reason ?? "").trim();
  if (reason.length < 3) return fail("Informe o motivo do descarte.");
  if (reason.length > 1000) return fail("Motivo longo demais (máx. 1.000).");
  const open = await loadOpen(db, input.publicationId);
  if ("error" in open) return fail(open.error);

  const { data, error } = await db
    .from("court_publications")
    .update({
      status: "descartada",
      reviewed_by: input.userId,
      reviewed_at: new Date().toISOString(),
      review_note: reason,
    })
    .eq("id", input.publicationId)
    .eq("status", "para_conferir")
    .select("id");
  if (error || !data || (data as unknown[]).length === 0) return fail(error ? "Não consegui descartar a intimação." : ALREADY_REVIEWED);

  await audit(db, "discard_publication", input.publicationId, input.userId, { channel: input.channel, reason });
  return { ok: true };
}

/** Liga (ou desliga, com null) a intimação a um processo do CRM, enquanto está para conferir. */
export async function linkPublicationProcess(
  db: Db,
  input: { publicationId: string; processId: string | null; userId: string; channel: Channel }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.processId && !UUID_RE.test(input.processId)) return fail("Processo não encontrado.");
  const open = await loadOpen(db, input.publicationId);
  if ("error" in open) return fail(open.error);
  if (input.processId) {
    const { data: proc } = await db.from("processes").select("id").eq("id", input.processId).maybeSingle();
    if (!proc) return fail("Processo não encontrado.");
  }
  const { data, error } = await db
    .from("court_publications")
    .update({ process_id: input.processId })
    .eq("id", input.publicationId)
    .eq("status", "para_conferir")
    .select("id");
  if (error || !data || (data as unknown[]).length === 0) return fail(error ? "Não consegui vincular o processo." : ALREADY_REVIEWED);
  await audit(db, "link_publication_process", input.publicationId, input.userId, {
    channel: input.channel,
    from: open.pub.process_id,
    to: input.processId,
  });
  return { ok: true };
}

/** Campos de dúvida que impedem a confirmação automática ("OK" no WhatsApp). */
const BLOCKING_UNCERTAIN = ["dias", "unidade", "inicio", "início", "dobro"];

/**
 * Monta a confirmação a partir da leitura da IA. Devolve null (e o WhatsApp
 * manda abrir o painel) quando: a intimação não está para conferir ou foi
 * cancelada; a leitura não está pronta; a IA não sugeriu dias e unidade; a
 * intimação não pede providência; a confiança é baixa; ou a IA marcou dúvida
 * em dias, unidade, início ou dobro.
 */
export function defaultConfirmInput(pub: CourtPublication, userId: string, channel: Channel): ConfirmPublicationInput | null {
  if (pub.status !== "para_conferir" || pub.cancelled) return null;
  const r = pub.ai_reading;
  if (pub.ai_status !== "pronta" || !r) return null;
  if (!r.requiresAction || r.confidence === "baixa") return null;
  if (!r.suggestedUnit || !Number.isInteger(r.suggestedDays) || !r.suggestedDays || r.suggestedDays < 1 || r.suggestedDays > MAX_DAYS) {
    return null;
  }
  const doubts = uncertainSet(pub);
  if (BLOCKING_UNCERTAIN.some((f) => doubts.has(f))) return null;
  const title = (r.taskTitle || r.actType || "").trim() || `${pub.kind?.trim() || "Intimação"} (DJEN)`;
  return {
    publicationId: pub.id,
    userId,
    days: r.suggestedDays,
    unit: r.suggestedUnit,
    startKind: r.startKind === "intimacao" ? "intimacao" : "disponibilizacao",
    dobro: Boolean(r.dobro),
    title: title.slice(0, 200),
    processId: pub.process_id,
    updateProcessDeadline: Boolean(pub.process_id),
    channel,
  };
}
