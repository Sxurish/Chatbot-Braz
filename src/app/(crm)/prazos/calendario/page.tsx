import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listCalendarDays } from "@/lib/data/prazos";
import { automaticHolidays, brDay, RECESS_REASON, RECESS_SOURCE, weekdayName } from "@/lib/prazos/calendar";
import { CALENDAR_KIND_LABELS } from "@/lib/prazos/types";
import { AddDayForm, RemoveDayButton } from "./calendar-admin";

interface Row {
  key: string;
  day: string;
  /** Até (para o recesso). */
  until?: string;
  description: string;
  source: string;
  sourceUrl?: string | null;
  kindLabel: string;
  comarca?: string | null;
  automatic: boolean;
  id?: string;
  removedAt?: string | null;
  removedReason?: string | null;
}

function currentYear() {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
}

export default async function CalendarPage(props: { searchParams: Promise<{ ano?: string }> }) {
  const { ano } = await props.searchParams;
  const thisYear = currentYear();
  const parsed = Number(ano);
  const year = Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : thisYear;

  const [days, admin] = await Promise.all([listCalendarDays(year), checkAdmin()]);

  const rows: Row[] = [
    {
      key: `recesso-ini-${year}`,
      day: `${year}-01-01`,
      until: `${year}-01-20`,
      description: RECESS_REASON,
      source: RECESS_SOURCE,
      kindLabel: "Recesso",
      automatic: true,
    },
    ...automaticHolidays(year).map((h) => ({
      key: `auto-${h.day}`,
      day: h.day,
      description: h.description,
      source: h.source,
      kindLabel: "Feriado",
      automatic: true,
    })),
    {
      key: `recesso-fim-${year}`,
      day: `${year}-12-20`,
      until: `${year}-12-31`,
      description: RECESS_REASON,
      source: RECESS_SOURCE,
      kindLabel: "Recesso",
      automatic: true,
    },
    ...days.map((d) => ({
      key: d.id,
      id: d.id,
      day: d.day,
      description: d.description,
      source: d.source,
      sourceUrl: d.source_url,
      kindLabel: CALENDAR_KIND_LABELS[d.kind] ?? d.kind,
      comarca: d.comarca,
      automatic: false,
      removedAt: d.removed_at,
      removedReason: d.removed_reason,
    })),
  ].sort((a, b) => a.day.localeCompare(b.day) || Number(b.automatic) - Number(a.automatic));

  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  if (!years.includes(year)) years.push(year);

  return (
    <>
      <Link href="/prazos" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary">
        <ArrowLeft className="h-4 w-4" /> Prazos
      </Link>
      <PageHeader
        title={`Calendário forense ${year}`}
        description="Dias sem contagem de prazo no TJSP. Sábados e domingos também não contam (CPC art. 216)."
      />

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Ano">
        {years.sort().map((y) => (
          <Link
            key={y}
            href={`/prazos/calendario?ano=${y}`}
            className={
              y === year
                ? "rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-brand-primary/40"
            }
          >
            {y}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const removed = Boolean(r.removedAt);
                return (
                  <li key={r.key} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:gap-4">
                    <div className={`shrink-0 sm:w-44 ${removed ? "text-slate-400 line-through" : "font-medium text-slate-900"}`}>
                      {r.until ? `${brDay(r.day)} a ${brDay(r.until)}` : brDay(r.day)}
                      {!r.until && <span className="block text-xs font-normal text-slate-500 no-underline">{weekdayName(r.day)}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={removed ? "text-slate-400 line-through" : "text-slate-800"}>
                        {r.description}
                        {r.comarca && <span className="text-slate-500"> · comarca de {r.comarca}</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        Fonte:{" "}
                        {r.sourceUrl ? (
                          <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-brand-primary hover:underline">
                            {r.source}
                          </a>
                        ) : (
                          r.source
                        )}
                      </p>
                      {removed && <p className="mt-1 text-xs text-slate-600">Removido: {r.removedReason}</p>}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge className="border-slate-200 bg-slate-50 text-slate-600">{r.kindLabel}</Badge>
                        {r.automatic && <Badge className="border-sky-200 bg-sky-50 text-sky-700">automático</Badge>}
                        {removed && <Badge className="border-slate-200 bg-white text-slate-500">removido</Badge>}
                      </div>
                    </div>
                    {admin.ok && !r.automatic && !removed && r.id && <RemoveDayButton id={r.id} label={brDay(r.day)} />}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          {admin.ok ? (
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle>Cadastrar dia</CardTitle>
                <p className="text-sm text-slate-500">Feriado municipal, suspensão ou ponto facultativo. A fonte é obrigatória.</p>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <AddDayForm defaultDay={`${year}-01-01`} />
              </CardContent>
            </Card>
          ) : (
            <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
              Só o Admin cadastra e remove dias do calendário.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Os dias marcados como &quot;automático&quot; são calculados pelo sistema e não podem ser removidos. Dias
            removidos continuam aqui, riscados, com o motivo.
          </p>
        </div>
      </div>
    </>
  );
}
