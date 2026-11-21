import { compareText } from "@/lib/list-params";
import type { TeamNames } from "@/lib/team-names";

/**
 * Opções do filtro de responsável: só quem aparece na lista, em ordem
 * alfabética, e "Sem responsável" no fim quando há registros sem ninguém.
 */
export function ownerOptions(
  assigned: (string | null | undefined)[],
  names: TeamNames,
  noOwnerValue = "sem"
): { value: string; label: string }[] {
  const ids = [...new Set(assigned.filter((v): v is string => Boolean(v)))];
  const opts = ids
    .map((id) => ({ value: id, label: names[id] ?? "Pessoa removida da equipe" }))
    .sort((a, b) => compareText(a.label, b.label));
  if (assigned.some((v) => !v)) opts.push({ value: noOwnerValue, label: "Sem responsável" });
  return opts;
}
