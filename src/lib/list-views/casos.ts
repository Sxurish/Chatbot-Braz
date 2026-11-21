import { LEGAL_AREA_LABELS, LEGAL_STATUS_LABELS } from "@/lib/constants";
import {
  compareDate,
  compareText,
  matchesText,
  param,
  pickEnum,
  sortedBy,
  type RawParams,
} from "@/lib/list-params";
import type { Case, LegalArea, LegalStatus } from "@/lib/types";

/**
 * Busca, filtros e ordenação da aba Casos. Tudo vem da URL e roda em memória
 * sobre a lista que já vem do banco (mais recentes primeiro).
 */

export const CASE_SORTS = ["recentes", "antigos", "titulo", "status", "atualizados"] as const;
export type CaseSort = (typeof CASE_SORTS)[number];

export const CASE_SORT_LABELS: Record<CaseSort, string> = {
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  titulo: "Título (A-Z)",
  status: "Andamento",
  atualizados: "Atualizados por último",
};

/** Valor do filtro de responsável para os casos sem ninguém atribuído. */
export const NO_OWNER = "sem";

const AREAS = Object.keys(LEGAL_AREA_LABELS) as LegalArea[];
const STATUSES = Object.keys(LEGAL_STATUS_LABELS) as LegalStatus[];

export interface CaseListOptions {
  /** Título, resumo, subárea ou nome do cliente/lead vinculado. */
  q: string | null;
  area: LegalArea | null;
  status: LegalStatus | null;
  /** Id de quem é responsável, ou "sem". */
  resp: string | null;
  ordem: CaseSort;
}

function oneOf<T extends string>(sp: RawParams, key: string, values: readonly T[]): T | null {
  const v = param(sp, key);
  return v && (values as readonly string[]).includes(v) ? (v as T) : null;
}

/** Lê a URL. Com `ownerIds`, um responsável que não é da equipe é ignorado. */
export function parseCaseOptions(sp: RawParams, ownerIds?: readonly string[]): CaseListOptions {
  const resp = param(sp, "resp");
  return {
    q: param(sp, "q"),
    area: oneOf(sp, "area", AREAS),
    status: oneOf(sp, "status", STATUSES),
    resp: resp && (resp === NO_OWNER || !ownerIds || ownerIds.includes(resp)) ? resp : null,
    ordem: pickEnum(sp, "ordem", CASE_SORTS, "recentes"),
  };
}

export function caseFiltersActive(o: CaseListOptions): boolean {
  return Boolean(o.q || o.area || o.status || o.resp || o.ordem !== "recentes");
}

/** Nomes de clientes e leads por id, para a busca achar o caso pelo nome da pessoa. */
export type PeopleNames = Record<string, string>;

export function filterCases(items: readonly Case[], o: CaseListOptions, people: PeopleNames = {}): Case[] {
  return items.filter(
    (c) =>
      matchesText(o.q, [
        c.title,
        c.summary,
        c.subarea,
        c.client_id ? people[c.client_id] : null,
        c.lead_id ? people[c.lead_id] : null,
      ]) &&
      (!o.area || c.legal_area === o.area) &&
      (!o.status || c.status === o.status) &&
      (!o.resp || (o.resp === NO_OWNER ? !c.assigned_to : c.assigned_to === o.resp))
  );
}

function recent(a: Case, b: Case): number {
  return compareDate(a.created_at, b.created_at, "desc");
}

function statusRank(s: LegalStatus): number {
  const i = STATUSES.indexOf(s);
  return i === -1 ? STATUSES.length : i;
}

/** "recentes" mantém a ordem que já vem do banco. "status" segue o andamento (triagem até encerrado). */
export function sortCases(items: readonly Case[], ordem: CaseSort): Case[] {
  switch (ordem) {
    case "recentes":
      return [...items];
    case "antigos":
      return sortedBy(items, (a, b) => compareDate(a.created_at, b.created_at, "asc"));
    case "titulo":
      return sortedBy(items, (a, b) => compareText(a.title, b.title) || recent(a, b));
    case "status":
      return sortedBy(items, (a, b) => statusRank(a.status) - statusRank(b.status) || recent(a, b));
    case "atualizados":
      return sortedBy(items, (a, b) => compareDate(a.updated_at, b.updated_at, "desc") || recent(a, b));
  }
}
