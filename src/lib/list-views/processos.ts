import { LEGAL_AREA_LABELS, LEGAL_STATUS_LABELS } from "@/lib/constants";
import {
  compareDate,
  compareText,
  distinct,
  flag,
  matchesText,
  param,
  pickEnum,
  sortedBy,
  type RawParams,
} from "@/lib/list-params";
import { addDays } from "@/lib/prazos/calendar";
import type { Case, LegalArea, LegalStatus, Process } from "@/lib/types";
import { spDay } from "./dates";

/**
 * Busca, filtros e ordenação da aba Processos (funções puras).
 * Cliente, área e responsável vêm do caso vinculado ao processo.
 */

export const PROCESS_SORTS = ["prazo", "recentes", "numero", "cliente", "tribunal"] as const;
export type ProcessSort = (typeof PROCESS_SORTS)[number];

/** A primeira é a padrão (igual à ordem de antes: próximo prazo primeiro). */
export const PROCESS_SORT_LABELS: Record<ProcessSort, string> = {
  prazo: "Próximo prazo",
  recentes: "Mais recentes",
  numero: "Número do processo",
  cliente: "Cliente",
  tribunal: "Tribunal",
};

/** Janela do filtro "prazo próximo", em dias corridos a partir de hoje. */
export const NEAR_DEADLINE_DAYS = 15;

const STATUSES = Object.keys(LEGAL_STATUS_LABELS) as LegalStatus[];
const AREAS = Object.keys(LEGAL_AREA_LABELS) as LegalArea[];

export interface ProcessListOptions {
  q: string | null;
  tribunal: string | null;
  status: LegalStatus | null;
  area: LegalArea | null;
  responsavel: string | null;
  prazo: boolean;
  ordem: ProcessSort;
}

export function parseProcessOptions(sp: RawParams): ProcessListOptions {
  const status = pickEnum<LegalStatus | "">(sp, "status", STATUSES, "");
  const area = pickEnum<LegalArea | "">(sp, "area", AREAS, "");
  return {
    q: param(sp, "q"),
    tribunal: param(sp, "tribunal"),
    status: status || null,
    area: area || null,
    responsavel: param(sp, "responsavel"),
    prazo: flag(sp, "prazo"),
    ordem: pickEnum(sp, "ordem", PROCESS_SORTS, "prazo"),
  };
}

export function hasProcessFilters(o: ProcessListOptions): boolean {
  return Boolean(o.q || o.tribunal || o.status || o.area || o.responsavel || o.prazo || o.ordem !== "prazo");
}

/** Processo com os dados do caso e do cliente, para buscar e ordenar. */
export interface ProcessRow {
  process: Process;
  caseTitle: string | null;
  clientName: string | null;
  area: LegalArea | null;
  responsibleId: string | null;
  responsibleName: string | null;
}

export function buildProcessRows(
  processes: Process[],
  cases: Pick<Case, "id" | "title" | "client_id" | "legal_area" | "assigned_to">[],
  clientNames: Map<string, string>,
  teamNames: Map<string, string>
): ProcessRow[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return processes.map((p) => {
    const c = p.case_id ? byId.get(p.case_id) : undefined;
    return {
      process: p,
      caseTitle: c?.title ?? null,
      clientName: (c?.client_id && clientNames.get(c.client_id)) || null,
      area: c?.legal_area ?? null,
      responsibleId: c?.assigned_to ?? null,
      responsibleName: (c?.assigned_to && teamNames.get(c.assigned_to)) || null,
    };
  });
}

/** Próximo prazo entre hoje e daqui a NEAR_DEADLINE_DAYS dias (hoje em AAAA-MM-DD). */
export function hasNearDeadline(p: Process, today: string): boolean {
  const day = spDay(p.next_deadline);
  return Boolean(day && day >= today && day <= addDays(today, NEAR_DEADLINE_DAYS));
}

export function filterProcessRows(rows: ProcessRow[], o: ProcessListOptions, today: string): ProcessRow[] {
  return rows.filter(
    (r) =>
      matchesText(o.q, [
        r.process.process_number,
        r.process.court,
        r.process.jurisdiction,
        r.process.class,
        r.process.subject,
        r.caseTitle,
        r.clientName,
        r.responsibleName,
      ]) &&
      (!o.tribunal || r.process.court === o.tribunal) &&
      (!o.status || r.process.status === o.status) &&
      (!o.area || r.area === o.area) &&
      (!o.responsavel || r.responsibleId === o.responsavel) &&
      (!o.prazo || hasNearDeadline(r.process, today))
  );
}

export function sortProcessRows(rows: ProcessRow[], ordem: ProcessSort): ProcessRow[] {
  const byDeadline = (a: ProcessRow, b: ProcessRow) => compareDate(a.process.next_deadline, b.process.next_deadline);
  switch (ordem) {
    case "recentes":
      return sortedBy(rows, (a, b) => compareDate(a.process.created_at, b.process.created_at, "desc"));
    case "numero":
      return sortedBy(rows, (a, b) => compareText(a.process.process_number, b.process.process_number));
    case "cliente":
      return sortedBy(rows, (a, b) => compareText(a.clientName, b.clientName) || byDeadline(a, b));
    case "tribunal":
      return sortedBy(
        rows,
        (a, b) =>
          compareText(a.process.court, b.process.court) ||
          compareText(a.process.jurisdiction, b.process.jurisdiction) ||
          byDeadline(a, b)
      );
    default:
      return sortedBy(rows, byDeadline);
  }
}

/** Opções dos seletores, a partir da lista completa. */
export function processFilterOptions(rows: ProcessRow[]) {
  const responsible = new Map<string, string>();
  for (const r of rows) if (r.responsibleId && r.responsibleName) responsible.set(r.responsibleId, r.responsibleName);
  const areas = new Set(rows.map((r) => r.area).filter((a): a is LegalArea => Boolean(a)));
  const statuses = new Set(rows.map((r) => r.process.status));
  return {
    tribunais: distinct(rows.map((r) => r.process.court)).map((v) => ({ value: v, label: v })),
    status: STATUSES.filter((s) => statuses.has(s)).map((s) => ({ value: s, label: LEGAL_STATUS_LABELS[s] })),
    areas: AREAS.filter((a) => areas.has(a)).map((a) => ({ value: a, label: LEGAL_AREA_LABELS[a] })),
    responsaveis: [...responsible.entries()]
      .sort((a, b) => compareText(a[1], b[1]))
      .map(([value, label]) => ({ value, label })),
  };
}
