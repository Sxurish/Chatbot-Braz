/**
 * Busca, filtros e ordem da aba Follow-up. Funções puras (testes em
 * tests/list-views-operacao.test.ts). Follow-up não tem canal no cadastro,
 * então não há filtro por canal.
 */
import { compareDate, compareText, matchesText, param, pickEnum, sortedBy, type RawParams } from "@/lib/list-params";
import type { TeamNames } from "@/lib/team-names";
import type { FollowUp } from "@/lib/types";
import { assigneeParam, dateParam, dayOf, enumOrNull, inPeriod, matchesAssignee } from "./common";

export type FollowUpStatus = FollowUp["status"];
export const FOLLOW_UP_STATUSES = ["pendente", "concluido", "cancelado"] as const satisfies readonly FollowUpStatus[];
export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/** "agendada" é a ordem de sempre (data agendada mais próxima primeiro). */
export const FOLLOW_UP_SORTS = ["agendada", "agendada_desc", "recentes"] as const;
export type FollowUpSort = (typeof FOLLOW_UP_SORTS)[number];
export const FOLLOW_UP_SORT_LABELS: Record<FollowUpSort, string> = {
  agendada: "Data agendada (mais próxima)",
  agendada_desc: "Data agendada (mais distante)",
  recentes: "Mais recentes",
};

export interface FollowUpView {
  q: string | null;
  status: FollowUpStatus | null;
  responsavel: string | null;
  de: string | null;
  ate: string | null;
  ordem: FollowUpSort;
}

export function parseFollowUpView(sp: RawParams, names: TeamNames): FollowUpView {
  return {
    q: param(sp, "q"),
    status: enumOrNull(sp, "status", FOLLOW_UP_STATUSES),
    responsavel: assigneeParam(sp, names),
    de: dateParam(sp, "de"),
    ate: dateParam(sp, "ate"),
    ordem: pickEnum(sp, "ordem", FOLLOW_UP_SORTS, "agendada"),
  };
}

export function isFollowUpViewFiltered(v: FollowUpView): boolean {
  return Boolean(v.q || v.status || v.responsavel || v.de || v.ate || v.ordem !== "agendada");
}

export function filterFollowUps(items: readonly FollowUp[], v: FollowUpView): FollowUp[] {
  return items.filter((f) => {
    if (v.status && f.status !== v.status) return false;
    if (!matchesAssignee(f.assigned_to, v.responsavel)) return false;
    if (!inPeriod(dayOf(f.scheduled_at), v.de, v.ate)) return false;
    return matchesText(v.q, [f.title, f.description]);
  });
}

export function sortFollowUps(items: readonly FollowUp[], ordem: FollowUpSort): FollowUp[] {
  switch (ordem) {
    case "agendada_desc":
      return sortedBy(items, (a, b) => compareDate(a.scheduled_at, b.scheduled_at, "desc"));
    case "recentes":
      return sortedBy(items, (a, b) => compareDate(a.created_at, b.created_at, "desc") || compareText(a.title, b.title));
    default:
      return sortedBy(items, (a, b) => compareDate(a.scheduled_at, b.scheduled_at));
  }
}
