/**
 * Pedaços comuns das listas de operação (tarefas, follow-up, agenda...).
 * Funções puras, sem acesso ao banco.
 */
import { isoDateInSaoPaulo } from "@/lib/digest/dates";
import { param, type RawParams } from "@/lib/list-params";
import type { TeamNames } from "@/lib/team-names";

export interface Option {
  value: string;
  label: string;
}

/** Valor especial do filtro de responsável: itens sem ninguém atribuído. */
export const NO_ASSIGNEE = "sem";

/** Filtro opcional de lista fechada: valor válido ou nada (sem filtro). */
export function enumOrNull<T extends string>(sp: RawParams, key: string, values: readonly T[]): T | null {
  const v = param(sp, key);
  return v && (values as readonly string[]).includes(v) ? (v as T) : null;
}

/** Data AAAA-MM-DD válida da URL; qualquer outra coisa é ignorada. */
export function dateParam(sp: RawParams, key: string): string | null {
  const v = param(sp, key);
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/** Dia (AAAA-MM-DD, fuso de São Paulo) de uma data ISO ou de uma data simples. */
export function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 10) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : isoDateInSaoPaulo(d);
}

/** O dia está dentro do período (limites inclusivos; sem limite, passa). */
export function inPeriod(day: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Responsável da URL: id de alguém da equipe, "sem" ou nada. */
export function assigneeParam(sp: RawParams, names: TeamNames): string | null {
  const v = param(sp, "responsavel");
  if (!v) return null;
  return v === NO_ASSIGNEE || Object.prototype.hasOwnProperty.call(names, v) ? v : null;
}

export function matchesAssignee(assignedTo: string | null, filter: string | null): boolean {
  if (!filter) return true;
  if (filter === NO_ASSIGNEE) return !assignedTo;
  return assignedTo === filter;
}

/** Opções do seletor de responsável: a equipe em ordem alfabética e "Sem responsável". */
export function assigneeOptions(names: TeamNames): Option[] {
  return [
    ...Object.entries(names)
      .sort(([, a], [, b]) => a.localeCompare(b, "pt-BR"))
      .map(([value, label]) => ({ value, label })),
    { value: NO_ASSIGNEE, label: "Sem responsável" },
  ];
}

/** Rótulos de uma lista fechada, no formato dos seletores. */
export function optionsOf<T extends string>(values: readonly T[], labels: Record<T, string>): Option[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
