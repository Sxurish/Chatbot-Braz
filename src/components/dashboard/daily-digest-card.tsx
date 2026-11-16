import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Clock,
  Gavel,
  ListChecks,
  MessageCircle,
  Sunrise,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { digestSummaryLine, type DailyDigest } from "@/lib/digest/build";
import { nextDigestRun, relativeDayLabel, shortDateBr, weekdayName } from "@/lib/digest/dates";
import { cn, formatCurrency } from "@/lib/utils";

const TOP = 3;
const PHONE_TOP = 2;
const MORE = 12;

interface Row {
  key: string;
  href: string;
  title: string;
  meta: string;
  tone?: "danger" | "warning" | "muted";
  tag?: string;
}

function ItemLinkInner({ row }: { row: Row }) {
  return (
    <Link
      href={row.href}
      className="group flex min-w-0 flex-col rounded-md px-2 py-1.5 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm text-slate-800 group-hover:text-brand-primary">{row.title}</span>
        {row.tag && (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium uppercase tracking-wide",
              row.tag === "urgente" ? "bg-red-100 text-red-700" : "bg-brand-gold/15 text-amber-800"
            )}
          >
            {row.tag}
          </span>
        )}
      </span>
      <span
        className={cn(
          "truncate text-xs",
          row.tone === "danger" ? "text-red-600" : row.tone === "warning" ? "text-amber-700" : "text-slate-500"
        )}
      >
        {row.meta}
      </span>
    </Link>
  );
}

function ItemLink({ row, hideOnPhone = false }: { row: Row; hideOnPhone?: boolean }) {
  return (
    <li className={cn(hideOnPhone && "max-sm:hidden")}>
      <ItemLinkInner row={row} />
    </li>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  countHint,
  tone = "default",
  rows,
  total,
  empty,
  allHref,
  allLabel,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  countHint?: string;
  tone?: "default" | "danger" | "gold";
  rows: Row[];
  total: number;
  empty: string;
  allHref: string;
  allLabel: string;
}) {
  const top = rows.slice(0, TOP);
  const more = rows.slice(TOP, TOP + MORE);
  const hidden = Math.max(0, total - top.length - more.length);
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3">
      <header className="flex items-center gap-2 px-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            tone === "danger"
              ? "bg-red-100 text-red-600"
              : tone === "gold"
                ? "bg-brand-gold/15 text-brand-gold"
                : "bg-brand-primary/10 text-brand-primary"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-slate-700">{title}</h4>
          {countHint && <p className="truncate text-xs text-slate-500">{countHint}</p>}
        </div>
        <span className="text-xl font-semibold tabular-nums text-slate-900">{count}</span>
      </header>

      {top.length === 0 ? (
        <p className="mt-2 px-2 text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {top.map((r, i) => (
            <ItemLink key={r.key} row={r} hideOnPhone={i >= PHONE_TOP} />
          ))}
        </ul>
      )}

      {top.length > PHONE_TOP && (
        // No celular a lista mostra 2 itens; o 3º entra no "ver mais".
        <details className={cn("group/more mt-1", more.length === 0 && "sm:hidden")}>
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-primary hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/more:rotate-180" />
            <span className="sm:hidden">Ver mais {total - PHONE_TOP}</span>
            <span className="max-sm:hidden">Ver mais {total - top.length}</span>
          </summary>
          <ul className="mt-1 space-y-0.5">
            {top.slice(PHONE_TOP).map((r) => (
              <li key={r.key} className="sm:hidden">
                <ItemLinkInner row={r} />
              </li>
            ))}
            {more.map((r) => (
              <ItemLink key={r.key} row={r} />
            ))}
          </ul>
          {hidden > 0 && <p className="px-2 pt-1 text-xs text-slate-500">e mais {hidden}</p>}
        </details>
      )}

      <div className="mt-auto px-2 pt-2">
        <Link href={allHref} className="text-xs font-medium text-slate-500 hover:text-brand-primary">
          {allLabel} →
        </Link>
      </div>
    </section>
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function DailyDigestCard({
  digest,
  error,
  todaySend,
  now = new Date(),
}: {
  digest: DailyDigest | null;
  error?: string | null;
  todaySend?: { sentAt: string | null; error: string | null } | null;
  now?: Date;
}) {
  const next = nextDigestRun(now);

  if (!digest) {
    return (
      <Card className="mb-6 flex items-start gap-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{error ?? "Resumo do dia indisponível."}</p>
      </Card>
    );
  }

  const d = digest;
  const prazoRows: Row[] = d.prazos.items.map((p) => ({
    key: `${p.kind}-${p.id}`,
    href: p.href,
    title: p.title,
    meta: `${p.when.charAt(0).toUpperCase()}${p.when.slice(1)}${p.time ? ` às ${p.time}` : ""} · ${
      p.kind === "processo" ? p.detail : p.kind === "compromisso" ? "Agenda" : "Tarefa"
    }`,
    tone: p.overdue ? "danger" : p.date === d.today ? "warning" : undefined,
  }));

  const novosIds = new Set(d.leads.novos.items.map((l) => l.id));
  const leadRows: Row[] = [
    ...d.leads.novos.items.map((l) => ({
      key: `novo-${l.id}`,
      href: l.href,
      title: l.name,
      meta: l.area,
      tag: l.urgent ? "urgente" : "novo",
    })),
    ...d.leads.urgentes.items
      .filter((l) => !novosIds.has(l.id))
      .map((l) => ({
        key: `urg-${l.id}`,
        href: l.href,
        title: l.name,
        meta: l.reason ?? l.area,
        tag: "urgente",
      })),
  ];
  const urgentOnly = d.leads.urgentes.total - d.leads.urgentes.items.filter((l) => novosIds.has(l.id)).length;
  const leadTotal = d.leads.novos.total + urgentOnly;

  const movementRows: Row[] = d.andamentos.processos.map((g) => ({
    key: g.processId,
    href: g.href,
    title: g.items[0]?.description ?? g.label,
    meta: `${g.label}${g.total > 1 ? ` · +${g.total - 1}` : ""}`,
  }));

  const taskRows: Row[] = d.tarefasAtrasadas.items.map((t) => ({
    key: t.id,
    href: t.href,
    title: t.title,
    meta: `${relativeDayLabel(d.today, t.dueDate)}${t.priority === "alta" ? " · prioridade alta" : ""}`,
    tone: "danger",
  }));

  const prazoHint = [
    `${d.prazos.upcoming} em 7 dias`,
    d.prazos.today ? `${d.prazos.today} hoje` : null,
    d.prazos.tomorrow ? `${d.prazos.tomorrow} amanhã` : null,
    d.prazos.overdue ? `${d.prazos.overdue} vencido${d.prazos.overdue > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const f = d.financeiro;

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-primary/[0.06] to-transparent p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-gold/15 text-brand-gold">
            <Sunrise className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">
              Resumo do dia{" "}
              <span className="font-normal text-slate-500">
                · {weekdayName(d.today)}, {shortDateBr(d.today)}
              </span>
            </h3>
            <p className="mt-1 text-sm text-slate-600">{digestSummaryLine(d)}.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 text-xs text-slate-500 sm:items-end sm:text-right">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Próximo resumo automático: {next.label}
          </span>
          {todaySend?.sentAt ? (
            <span className="flex items-center gap-1.5 text-emerald-700">
              <MessageCircle className="h-3.5 w-3.5" /> Enviado hoje pelo WhatsApp às {formatTime(todaySend.sentAt)}
            </span>
          ) : todaySend?.error ? (
            <span className="flex items-center gap-1.5 text-amber-700">
              <MessageCircle className="h-3.5 w-3.5 shrink-0" /> WhatsApp de hoje: {todaySend.error}
            </span>
          ) : (
            <span>Dias úteis às 9h (Brasília), no painel e no WhatsApp</span>
          )}
        </div>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
        <Section
          icon={CalendarClock}
          title="Prazos"
          count={d.prazos.upcoming + d.prazos.overdue}
          countHint={prazoHint}
          tone={d.prazos.overdue || d.prazos.today ? "danger" : "default"}
          rows={prazoRows}
          total={d.prazos.upcoming + d.prazos.overdue}
          empty="Nada vencendo nos próximos 7 dias."
          allHref="/agenda"
          allLabel="Abrir agenda"
        />
        <Section
          icon={UserPlus}
          title="Leads novos e urgentes"
          count={leadTotal}
          countHint={`${d.leads.novos.total} novo${d.leads.novos.total === 1 ? "" : "s"} · ${d.leads.urgentes.total} urgente${d.leads.urgentes.total === 1 ? "" : "s"}`}
          tone="gold"
          rows={leadRows}
          total={leadTotal}
          empty="Nenhum lead novo ou urgente."
          allHref="/leads"
          allLabel="Ver leads"
        />
        <Section
          icon={Gavel}
          title="Andamentos novos"
          count={d.andamentos.total}
          countHint={
            d.andamentos.processos.length
              ? `em ${d.andamentos.processos.length} processo${d.andamentos.processos.length > 1 ? "s" : ""}`
              : undefined
          }
          rows={movementRows}
          total={d.andamentos.processos.length}
          empty="Nenhum andamento novo desde o último dia útil."
          allHref="/processos"
          allLabel="Ver processos"
        />
        <Section
          icon={ListChecks}
          title="Tarefas atrasadas"
          count={d.tarefasAtrasadas.total}
          tone={d.tarefasAtrasadas.total ? "danger" : "default"}
          rows={taskRows}
          total={d.tarefasAtrasadas.total}
          empty="Nenhuma tarefa atrasada."
          allHref="/tarefas"
          allLabel="Ver tarefas"
        />
      </div>

      {f && (
        <div className="mx-3 mb-3 flex flex-col gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 text-sm sm:mx-4 sm:mb-4 sm:flex-row sm:items-center sm:gap-6">
          <span className="flex items-center gap-2 font-medium text-slate-700">
            <Wallet className="h-4 w-4 text-brand-primary" /> Financeiro
            <span className="rounded-full bg-slate-200 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-slate-600">
              só Admin
            </span>
          </span>
          <Link href="/financeiro" className="text-slate-600 hover:text-brand-primary">
            A receber em 7 dias:{" "}
            <strong className="font-semibold text-slate-900">{formatCurrency(f.aReceber.amount)}</strong>{" "}
            <span className="text-slate-500">({f.aReceber.total})</span>
          </Link>
          <Link href="/financeiro" className="text-slate-600 hover:text-brand-primary">
            Em atraso:{" "}
            <strong className={cn("font-semibold", f.atrasados.total ? "text-red-600" : "text-slate-900")}>
              {formatCurrency(f.atrasados.amount)}
            </strong>{" "}
            <span className="text-slate-500">({f.atrasados.total})</span>
          </Link>
          <span className="text-xs text-slate-400 sm:ml-auto">Não vai no WhatsApp</span>
        </div>
      )}
    </Card>
  );
}
