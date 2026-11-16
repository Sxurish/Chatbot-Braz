import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_AREA_LABELS } from "@/lib/constants";
import type {
  Appointment,
  Client,
  CommercialStatus,
  Lead,
  Payment,
  Process,
  ProcessMovement,
  Task,
} from "@/lib/types";
import {
  addDays,
  dateOnly,
  daysBetween,
  isoDateInSaoPaulo,
  previousBusinessDay,
  relativeDayLabel,
  saoPauloInstant,
  shortDateBr,
  weekdayName,
  DIGEST_HOUR,
} from "./dates";

/**
 * Resumo diário do CRM: prazos dos próximos 7 dias, leads novos e urgentes,
 * andamentos novos e tarefas atrasadas. O financeiro só entra quando
 * `includeFinance` (Admin) e só no painel: nunca na linha do WhatsApp.
 *
 * `buildDailyDigest` consulta o banco com o cliente recebido (o do usuário no
 * painel, com RLS; o de serviço na rotina diária). `computeDailyDigest` é a
 * parte pura, usada também no modo demonstração com os dados fictícios.
 */

export const DIGEST_WINDOW_DAYS = 7;
const MAX_ITEMS = 50;
/** Andamento que chegou agora mas aconteceu antes disso é histórico antigo (primeira busca). */
const BACKLOG_DAYS = 30;

const CLOSED_LEAD_STATUSES: CommercialStatus[] = [
  "contrato_assinado",
  "cliente_ativo",
  "perdido",
  "nao_qualificado",
];

export type DeadlineKind = "processo" | "tarefa" | "compromisso";

export interface DigestDeadline {
  kind: DeadlineKind;
  id: string;
  /** AAAA-MM-DD (São Paulo). */
  date: string;
  time: string | null;
  title: string;
  detail: string | null;
  /** "hoje", "amanhã", "quarta, 18/11", "venceu há 3 dias". */
  when: string;
  overdue: boolean;
  href: string;
}

export interface DigestLead {
  id: string;
  name: string;
  area: string;
  urgent: boolean;
  reason: string | null;
  createdAt: string;
  href: string;
}

export interface DigestProcessMovements {
  processId: string;
  label: string;
  href: string;
  total: number;
  items: { id: string; date: string; description: string }[];
}

export interface DigestTask {
  id: string;
  title: string;
  dueDate: string;
  daysLate: number;
  priority: string;
  href: string;
}

export interface DigestPayment {
  id: string;
  description: string;
  client: string | null;
  amount: number;
  dueDate: string;
  overdue: boolean;
  href: string;
}

export interface DigestList<T> {
  total: number;
  items: T[];
}

export interface DailyDigest {
  version: 1;
  generatedAt: string;
  /** Hoje (AAAA-MM-DD, São Paulo). */
  today: string;
  /** Último dia da janela de prazos. */
  windowEnd: string;
  /** Desde quando contam leads e andamentos novos (dia útil anterior, 9h). */
  since: string;
  prazos: {
    /** Prazos de hoje até windowEnd. */
    upcoming: number;
    today: number;
    tomorrow: number;
    /** Prazos de processo já vencidos. */
    overdue: number;
    /** Vencidos primeiro, depois por data e hora. */
    items: DigestDeadline[];
  };
  leads: {
    novos: DigestList<DigestLead>;
    urgentes: DigestList<DigestLead>;
  };
  andamentos: { total: number; processos: DigestProcessMovements[] };
  tarefasAtrasadas: DigestList<DigestTask>;
  /** Só para Admin, e só no painel. */
  financeiro: {
    aReceber: DigestList<DigestPayment> & { amount: number };
    atrasados: DigestList<DigestPayment> & { amount: number };
  } | null;
}

type ProcessRow = Pick<Process, "id" | "process_number" | "subject" | "status" | "next_deadline">;
type TaskRow = Pick<Task, "id" | "title" | "due_date" | "status" | "priority" | "lead_id" | "process_id">;
type AppointmentRow = Pick<Appointment, "id" | "title" | "date" | "start_time" | "status" | "modality" | "lead_id">;
type LeadRow = Pick<
  Lead,
  "id" | "full_name" | "legal_area" | "urgency" | "urgency_reason" | "commercial_status" | "created_at"
>;
type MovementRow = Pick<ProcessMovement, "id" | "process_id" | "occurred_at" | "description" | "hidden" | "created_at">;
type PaymentRow = Pick<Payment, "id" | "description" | "amount" | "due_date" | "status" | "client_id">;
type ClientRow = Pick<Client, "id" | "full_name">;

export interface DigestSourceData {
  processes: ProcessRow[];
  tasks: TaskRow[];
  appointments: AppointmentRow[];
  leads: LeadRow[];
  movements: MovementRow[];
  payments?: PaymentRow[];
  clients?: ClientRow[];
}

export interface DigestOptions {
  now: Date;
  includeFinance: boolean;
}

/** Janelas de tempo do resumo (todas no fuso de São Paulo). */
export function digestWindows(now: Date) {
  const today = isoDateInSaoPaulo(now);
  const windowEnd = addDays(today, DIGEST_WINDOW_DAYS);
  // Leads e andamentos novos: desde o dia útil anterior às 9h (segunda cobre o fim de semana).
  const sinceDate = previousBusinessDay(today);
  const since = saoPauloInstant(sinceDate, DIGEST_HOUR);
  const backlogCutoff = saoPauloInstant(addDays(sinceDate, -BACKLOG_DAYS));
  return { today, windowEnd, since, backlogCutoff };
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const isOpenTask = (t: TaskRow) => t.status !== "concluida" && t.status !== "cancelada";

function processLabel(p: ProcessRow | undefined): string {
  if (!p) return "Processo";
  if (p.process_number) return `Processo ${p.process_number}`;
  return p.subject ? `Processo sem número (${p.subject})` : "Processo sem número";
}

function list<T>(items: T[]): DigestList<T> {
  return { total: items.length, items: items.slice(0, MAX_ITEMS) };
}

export function computeDailyDigest(data: DigestSourceData, opts: DigestOptions): DailyDigest {
  const { today, windowEnd, since, backlogCutoff } = digestWindows(opts.now);
  const tomorrow = addDays(today, 1);
  const sinceMs = ms(since);
  const backlogMs = ms(backlogCutoff);
  const processById = new Map(data.processes.map((p) => [p.id, p]));

  // ---------------------------------------------------------------- prazos
  const deadlines: DigestDeadline[] = [];
  for (const p of data.processes) {
    const d = dateOnly(p.next_deadline);
    if (!d || p.status === "encerrado" || d > windowEnd) continue;
    deadlines.push({
      kind: "processo",
      id: p.id,
      date: d,
      time: null,
      title: p.subject ? `Prazo: ${p.subject}` : "Prazo do processo",
      detail: processLabel(p),
      when: relativeDayLabel(today, d),
      overdue: d < today,
      href: `/processos/${p.id}`,
    });
  }
  for (const t of data.tasks) {
    const d = dateOnly(t.due_date);
    if (!d || !isOpenTask(t) || d < today || d > windowEnd) continue;
    deadlines.push({
      kind: "tarefa",
      id: t.id,
      date: d,
      time: null,
      title: t.title,
      detail: t.priority === "alta" ? "Tarefa de prioridade alta" : "Tarefa",
      when: relativeDayLabel(today, d),
      overdue: false,
      href: "/tarefas",
    });
  }
  for (const a of data.appointments) {
    if (a.status !== "agendada" && a.status !== "remarcada") continue;
    if (a.date < today || a.date > windowEnd) continue;
    const time = a.start_time?.slice(0, 5) ?? null;
    deadlines.push({
      kind: "compromisso",
      id: a.id,
      date: a.date,
      time,
      title: a.title,
      detail: `Agenda${time ? ` às ${time}` : ""} (${a.modality})`,
      when: relativeDayLabel(today, a.date),
      overdue: false,
      href: "/agenda",
    });
  }
  deadlines.sort((a, b) =>
    a.overdue !== b.overdue ? (a.overdue ? -1 : 1) : `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`)
  );
  const upcoming = deadlines.filter((d) => !d.overdue);

  // ----------------------------------------------------------------- leads
  const toLead = (l: LeadRow): DigestLead => ({
    id: l.id,
    name: l.full_name,
    area: LEGAL_AREA_LABELS[l.legal_area] ?? "Área não confirmada",
    urgent: l.urgency === "alta",
    reason: l.urgency_reason ?? null,
    createdAt: l.created_at,
    href: `/leads/${l.id}`,
  });
  const byNewest = (a: LeadRow, b: LeadRow) => ms(b.created_at) - ms(a.created_at);
  const novos = data.leads.filter((l) => ms(l.created_at) >= sinceMs).sort(byNewest);
  const urgentes = data.leads
    .filter((l) => l.urgency === "alta" && !CLOSED_LEAD_STATUSES.includes(l.commercial_status))
    .sort(byNewest);

  // ------------------------------------------------------------ andamentos
  const fresh = data.movements
    .filter((m) => !m.hidden && ms(m.created_at) >= sinceMs && ms(m.occurred_at) >= backlogMs)
    .sort((a, b) => ms(b.occurred_at) - ms(a.occurred_at));
  const groups = new Map<string, DigestProcessMovements>();
  for (const m of fresh) {
    let g = groups.get(m.process_id);
    if (!g) {
      g = {
        processId: m.process_id,
        label: processLabel(processById.get(m.process_id)),
        href: `/processos/${m.process_id}`,
        total: 0,
        items: [],
      };
      groups.set(m.process_id, g);
    }
    g.total += 1;
    if (g.items.length < 10) {
      g.items.push({ id: m.id, date: dateOnly(m.occurred_at) ?? today, description: m.description });
    }
  }

  // ------------------------------------------------------ tarefas atrasadas
  const late = data.tasks
    .filter((t) => isOpenTask(t) && (dateOnly(t.due_date) ?? "9999") < today)
    .map((t) => {
      const due = dateOnly(t.due_date)!;
      return {
        id: t.id,
        title: t.title,
        dueDate: due,
        daysLate: daysBetween(due, today),
        priority: t.priority,
        href: "/tarefas",
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // ------------------------------------------------------------ financeiro
  let financeiro: DailyDigest["financeiro"] = null;
  if (opts.includeFinance) {
    const clientName = new Map((data.clients ?? []).map((c) => [c.id, c.full_name]));
    const open = (data.payments ?? [])
      .filter((p) => p.status === "pendente" || p.status === "atrasado")
      .map((p) => ({ p, due: dateOnly(p.due_date) }))
      .filter((x): x is { p: PaymentRow; due: string } => !!x.due)
      .map(({ p, due }) => ({
        id: p.id,
        description: p.description ?? "Pagamento",
        client: p.client_id ? clientName.get(p.client_id) ?? null : null,
        amount: Number(p.amount) || 0,
        dueDate: due,
        overdue: p.status === "atrasado" || due < today,
        href: "/financeiro",
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const aReceber = open.filter((p) => !p.overdue && p.dueDate >= today && p.dueDate <= windowEnd);
    const atrasados = open.filter((p) => p.overdue);
    const sum = (xs: DigestPayment[]) => Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;
    financeiro = {
      aReceber: { ...list(aReceber), amount: sum(aReceber) },
      atrasados: { ...list(atrasados), amount: sum(atrasados) },
    };
  }

  return {
    version: 1,
    generatedAt: opts.now.toISOString(),
    today,
    windowEnd,
    since,
    prazos: {
      upcoming: upcoming.length,
      today: upcoming.filter((d) => d.date === today).length,
      tomorrow: upcoming.filter((d) => d.date === tomorrow).length,
      overdue: deadlines.length - upcoming.length,
      items: deadlines.slice(0, MAX_ITEMS),
    },
    leads: { novos: list(novos.map(toLead)), urgentes: list(urgentes.map(toLead)) },
    andamentos: { total: fresh.length, processos: [...groups.values()].slice(0, MAX_ITEMS) },
    tarefasAtrasadas: list(late),
    financeiro,
  };
}

// ---------------------------------------------------------------------------
// Consulta ao banco
// ---------------------------------------------------------------------------

type AnyClient = Pick<SupabaseClient, "from">;

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as T[] | null) ?? [];
}

/**
 * Busca no banco só o necessário para o resumo e monta o resultado.
 * Lança erro se uma consulta falhar (quem chama decide o que mostrar).
 */
export async function buildDailyDigest(supabase: AnyClient, opts: DigestOptions): Promise<DailyDigest> {
  const { today, windowEnd, since, backlogCutoff } = digestWindows(opts.now);
  // Fim da janela: último instante do último dia, em São Paulo.
  const endInstant = saoPauloInstant(addDays(windowEnd, 1));
  const closedList = `(${CLOSED_LEAD_STATUSES.join(",")})`;

  const [deadlineProcesses, tasks, appointments, newLeads, urgentLeads, movements] = await Promise.all([
    rows<ProcessRow>(
      supabase
        .from("processes")
        .select("id, process_number, subject, status, next_deadline")
        .neq("status", "encerrado")
        .not("next_deadline", "is", null)
        .lt("next_deadline", endInstant)
        .order("next_deadline", { ascending: true })
        .limit(200)
    ),
    rows<TaskRow>(
      supabase
        .from("tasks")
        .select("id, title, due_date, status, priority, lead_id, process_id")
        .not("status", "in", "(concluida,cancelada)")
        .not("due_date", "is", null)
        .lt("due_date", endInstant)
        .order("due_date", { ascending: true })
        .limit(300)
    ),
    rows<AppointmentRow>(
      supabase
        .from("appointments")
        .select("id, title, date, start_time, status, modality, lead_id")
        .in("status", ["agendada", "remarcada"])
        .gte("date", today)
        .lte("date", windowEnd)
        .order("date", { ascending: true })
        .limit(200)
    ),
    rows<LeadRow>(
      supabase
        .from("leads")
        .select("id, full_name, legal_area, urgency, urgency_reason, commercial_status, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    rows<LeadRow>(
      supabase
        .from("leads")
        .select("id, full_name, legal_area, urgency, urgency_reason, commercial_status, created_at")
        .eq("urgency", "alta")
        .not("commercial_status", "in", closedList)
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    rows<MovementRow>(
      supabase
        .from("process_movements")
        .select("id, process_id, occurred_at, description, hidden, created_at")
        .eq("hidden", false)
        .gte("created_at", since)
        .gte("occurred_at", backlogCutoff)
        .order("occurred_at", { ascending: false })
        .limit(300)
    ),
  ]);

  // Processos dos andamentos que ainda não vieram na lista de prazos (para o número).
  const known = new Set(deadlineProcesses.map((p) => p.id));
  const missing = [...new Set(movements.map((m) => m.process_id))].filter((id) => !known.has(id));
  const extraProcesses = missing.length
    ? await rows<ProcessRow>(
        supabase
          .from("processes")
          .select("id, process_number, subject, status, next_deadline")
          .in("id", missing.slice(0, 200))
      )
    : [];

  let payments: PaymentRow[] = [];
  let clients: ClientRow[] = [];
  if (opts.includeFinance) {
    payments = await rows<PaymentRow>(
      supabase
        .from("payments")
        .select("id, description, amount, due_date, status, client_id")
        .in("status", ["pendente", "atrasado"])
        .not("due_date", "is", null)
        .lt("due_date", endInstant)
        .order("due_date", { ascending: true })
        .limit(300)
    );
    const clientIds = [...new Set(payments.map((p) => p.client_id).filter((x): x is string => !!x))];
    if (clientIds.length) {
      clients = await rows<ClientRow>(
        supabase.from("clients").select("id, full_name").in("id", clientIds.slice(0, 200))
      );
    }
  }

  const leadsById = new Map<string, LeadRow>();
  for (const l of [...newLeads, ...urgentLeads]) leadsById.set(l.id, l);

  return computeDailyDigest(
    {
      processes: [...deadlineProcesses, ...extraProcesses],
      tasks,
      appointments,
      leads: [...leadsById.values()],
      movements,
      payments,
      clients,
    },
    opts
  );
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Tira quebras de linha, tabulações e espaços repetidos (exigência dos modelos da Meta). */
function oneLine(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/**
 * Uma linha, sem quebras nem tabulações, com menos de 900 caracteres.
 * Vai no {{2}} do modelo do WhatsApp. Nunca traz valores financeiros.
 */
export function digestSummaryLine(d: DailyDigest): string {
  const parts: string[] = [];
  if (d.prazos.upcoming > 0) {
    const extra = [
      d.prazos.today ? `${d.prazos.today} hoje` : null,
      d.prazos.tomorrow ? `${d.prazos.tomorrow} amanhã` : null,
    ].filter(Boolean);
    parts.push(
      `${plural(d.prazos.upcoming, "prazo", "prazos")} nos próximos ${DIGEST_WINDOW_DAYS} dias` +
        (extra.length ? ` (${extra.join(", ")})` : "")
    );
  }
  if (d.prazos.overdue > 0) parts.push(plural(d.prazos.overdue, "prazo vencido", "prazos vencidos"));
  if (d.leads.novos.total > 0) parts.push(plural(d.leads.novos.total, "lead novo", "leads novos"));
  if (d.leads.urgentes.total > 0) parts.push(plural(d.leads.urgentes.total, "lead urgente", "leads urgentes"));
  if (d.andamentos.total > 0) parts.push(plural(d.andamentos.total, "andamento novo", "andamentos novos"));
  if (d.tarefasAtrasadas.total > 0) {
    parts.push(plural(d.tarefasAtrasadas.total, "tarefa atrasada", "tarefas atrasadas"));
  }
  const line = parts.length
    ? parts.join(" · ")
    : "nada pendente: sem prazos nos próximos 7 dias, leads novos, andamentos novos ou tarefas atrasadas";
  return oneLine(line).slice(0, 899);
}

/** Primeiro nome, sem "Dr."/"Dra." ("Dr. Jean Braz" → "Jean"). */
export function firstName(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = words.find((w) => !/^(dr|dra|sr|sra|prof|profa)\.?$/i.test(w));
  return first ?? "equipe";
}

const WHATSAPP_MAX = 3500;

/** Texto vindo do banco: sem os marcadores de formatação do WhatsApp e numa linha só. */
function clean(text: string, max = 110): string {
  const t = oneLine(text.replace(/[*_~`]/g, ""));
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function renderWhatsapp(d: DailyDigest, appUrl: string, maxPer: number): string {
  const link = (path: string) => `${appUrl}${path}`;
  const out: string[] = [];
  out.push(`*Resumo do CRM — ${weekdayName(d.today)}, ${shortDateBr(d.today)}*`);
  out.push(digestSummaryLine(d));

  const section = <T>(title: string, items: T[], total: number, render: (item: T) => string[]) => {
    if (total === 0) return;
    out.push("", `*${title}*`);
    for (const item of items.slice(0, maxPer)) out.push(...render(item));
    const rest = total - Math.min(items.length, maxPer);
    if (rest > 0) out.push(`_e mais ${rest}_`);
  };

  section(`Prazos (próximos ${DIGEST_WINDOW_DAYS} dias)`, d.prazos.items, d.prazos.upcoming + d.prazos.overdue, (p) => [
    `• ${capitalize(p.when)}${p.time ? ` às ${p.time}` : ""}: ${clean(p.title)}` +
      (p.kind === "processo" && p.detail ? ` (${clean(p.detail, 60)})` : ""),
    `  ${link(p.href)}`,
  ]);
  section("Leads novos", d.leads.novos.items, d.leads.novos.total, (l) => [
    `• ${clean(l.name, 60)}, ${l.area}${l.urgent ? " (urgente)" : ""}`,
    `  ${link(l.href)}`,
  ]);
  // Urgentes que já apareceram em "Leads novos" não se repetem.
  const novosIds = new Set(d.leads.novos.items.map((l) => l.id));
  const urgentes = d.leads.urgentes.items.filter((l) => !novosIds.has(l.id));
  const urgentesTotal = d.leads.urgentes.total - (d.leads.urgentes.items.length - urgentes.length);
  section("Leads urgentes em aberto", urgentes, urgentesTotal, (l) => [
    `• ${clean(l.name, 60)}, ${l.area}${l.reason ? `: ${clean(l.reason, 80)}` : ""}`,
    `  ${link(l.href)}`,
  ]);
  section("Andamentos novos", d.andamentos.processos, d.andamentos.processos.length, (g) => [
    `• ${clean(g.label, 60)}: ${clean(g.items[0]?.description ?? "", 90)}` +
      (g.total > 1 ? ` (+${g.total - 1})` : ""),
    `  ${link(g.href)}`,
  ]);
  section("Tarefas atrasadas", d.tarefasAtrasadas.items, d.tarefasAtrasadas.total, (t) => [
    `• ${clean(t.title)} (${relativeDayLabel(d.today, t.dueDate)})`,
  ]);
  if (d.tarefasAtrasadas.total > 0) out.push(`  ${link("/tarefas")}`);

  out.push("", `Abrir o CRM: ${link("/dashboard")}`);
  return out.join("\n");
}

/**
 * Resumo completo para o WhatsApp (resposta dentro da janela de 24h):
 * negrito com *asterisco*, links absolutos e sem valores financeiros.
 * Até ~3500 caracteres: as listas encurtam com "e mais N".
 */
export function digestToWhatsappText(d: DailyDigest, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  for (const maxPer of [5, 4, 3, 2, 1, 0]) {
    const text = renderWhatsapp(d, base, maxPer);
    if (text.length <= WHATSAPP_MAX) return text;
  }
  return `${renderWhatsapp(d, base, 0).slice(0, WHATSAPP_MAX - 1)}…`;
}
