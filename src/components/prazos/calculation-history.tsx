import Link from "next/link";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { brDateTime } from "@/app/(crm)/processos/format";
import { brDay } from "@/lib/prazos/calendar";
import { ACTION_LABELS, START_KIND_LABELS, UNIT_LABELS, type CalculationAction, type DeadlineCalculation } from "@/lib/prazos/types";
import { DeadlineResultView } from "./deadline-result";

const ACTION_TONE: Record<CalculationAction, string> = {
  calculo: "border-slate-200 bg-slate-50 text-slate-700",
  ajuste: "border-amber-200 bg-amber-50 text-amber-800",
  confirmacao: "border-emerald-200 bg-emerald-50 text-emerald-700",
  descarte: "border-slate-200 bg-white text-slate-500",
};

/** "15 dias úteis (em dobro) da disponibilização em 16/11/2026" */
export function describeInput(c: DeadlineCalculation): string {
  const i = c.input;
  if (!i?.start) return "Cálculo";
  const dobro = i.dobro ? " (em dobro)" : "";
  const from = i.start.kind === "disponibilizacao" ? "da disponibilização" : "da intimação";
  const comarca = i.comarca ? ` · ${i.comarca}` : "";
  return `${i.days} ${UNIT_LABELS[i.unit]}${dobro} ${from} em ${brDay(i.start.date)}${comarca}`;
}

/** Histórico de cálculos (só leitura): quem, quando, o quê. */
export function CalculationHistory({
  items,
  showProcess = true,
  emptyText = "Nenhum cálculo registrado ainda.",
}: {
  items: DeadlineCalculation[];
  showProcess?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <EmptyState icon={History} title={emptyText} className="py-8" />;
  }
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={ACTION_TONE[c.action]}>{ACTION_LABELS[c.action]}</Badge>
            {c.final_date && (
              <span className={c.action === "descarte" ? "text-slate-500 line-through" : "font-semibold text-slate-900"}>
                {brDay(c.final_date)}
              </span>
            )}
            <span className="text-xs text-slate-500">
              {c.created_by_name ?? "Equipe"} · {brDateTime(c.created_at)}
            </span>
          </div>
          <p className="mt-1 text-slate-600">{describeInput(c)}</p>
          {c.result?.adjusted && (
            <p className="mt-1 text-xs text-amber-800">
              Data mudou de {brDay(c.result.adjusted.from)} para {brDay(c.result.adjusted.to)}.
            </p>
          )}
          {c.reason && <p className="mt-1 text-xs text-slate-600">Motivo: {c.reason}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
            {showProcess && c.process_id && (
              <Link href={`/processos/${c.process_id}`} className="text-brand-primary hover:underline">
                Processo {c.process_number ?? ""}
              </Link>
            )}
            {c.action === "confirmacao" && c.task_id && (
              <Link href="/tarefas" className="text-brand-primary hover:underline">
                Ver tarefa
              </Link>
            )}
          </div>
          {c.result?.steps && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-brand-primary">
                Ver a conta ({START_KIND_LABELS[c.input.start.kind] ?? "início"})
              </summary>
              <div className="mt-3">
                <DeadlineResultView result={c.result} adjustedTo={c.final_date} compact />
              </div>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
