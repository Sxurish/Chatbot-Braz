import { AlertTriangle, CalendarCheck, CalendarX } from "lucide-react";
import { brDay, brDayLong } from "@/lib/prazos/calendar";
import { groupSkipped, rangeLabel } from "@/lib/prazos/compute";
import type { DeadlineResult } from "@/lib/prazos/types";

/** A conta passo a passo e os dias pulados, com a fonte. Sem estado: serve no servidor e no navegador. */
export function DeadlineResultView({
  result,
  adjustedTo,
  compact = false,
}: {
  result: DeadlineResult;
  /** Data corrigida pelo advogado (ajuste). */
  adjustedTo?: string | null;
  compact?: boolean;
}) {
  const groups = groupSkipped(result.skipped);
  const final = adjustedTo ?? result.finalDate;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-4 py-3">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Data final sugerida</p>
        <p className="mt-0.5 text-lg font-semibold text-slate-900">{brDayLong(final)}</p>
        {adjustedTo && adjustedTo !== result.finalDate && (
          <p className="mt-1 text-xs text-slate-600">
            Ajustada pelo advogado. A conta deu <span className="line-through">{brDay(result.finalDate)}</span>.
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          {result.countedDays} {result.countedDays === 1 ? "dia contado" : "dias contados"}
          {result.publicationDate ? ` · publicação em ${brDay(result.publicationDate)}` : ""} · início em{" "}
          {brDay(result.startDate)}
        </p>
      </div>

      {result.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {result.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Conta passo a passo</h4>
        <ol className="space-y-2">
          {result.steps.map((s, i) => (
            <li key={`${s.label}-${i}`} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {s.label}
                  {s.date && <span className="font-normal text-slate-500"> · {brDay(s.date)}</span>}
                </p>
                {!compact && <p className="text-slate-600">{s.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <CalendarX className="h-4 w-4 text-slate-400" /> Dias pulados
        </h4>
        {groups.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <CalendarCheck className="h-4 w-4" /> Nenhum dia pulado.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
            {groups.map((g) => (
              <li key={g.from} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="shrink-0 font-medium text-slate-900 sm:w-48">{rangeLabel(g.from, g.to)}</span>
                <span className="min-w-0 text-slate-700">
                  {g.reason}
                  <span className="block text-xs text-slate-500">Fonte: {g.source}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
