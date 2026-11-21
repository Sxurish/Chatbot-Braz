import {
  COMMERCIAL_STATUS_LABELS,
  LEGAL_AREA_LABELS,
  URGENCY_LABELS,
} from "@/lib/constants";
import { SOURCE_LABELS } from "@/lib/data/cadastros-rules";
import {
  compareDate,
  compareText,
  matchesText,
  param,
  pickEnum,
  sortedBy,
  type RawParams,
} from "@/lib/list-params";
import type { CommercialStatus, LegalArea, Lead, Urgency } from "@/lib/types";

/**
 * Busca, filtros e ordenação da aba Leads. Tudo vem da URL e roda em memória
 * sobre a lista que já vem do banco (mais recentes primeiro).
 */

export const LEAD_SORTS = ["recentes", "antigos", "nome", "urgencia", "etapa", "atualizados"] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export const LEAD_SORT_LABELS: Record<LeadSort, string> = {
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  nome: "Nome (A-Z)",
  urgencia: "Mais urgentes",
  etapa: "Etapa do funil",
  atualizados: "Atualizados por último",
};

/** Valor do filtro de responsável para os leads sem ninguém atribuído. */
export const NO_OWNER = "sem";

const AREAS = Object.keys(LEGAL_AREA_LABELS) as LegalArea[];
const URGENCIES = Object.keys(URGENCY_LABELS) as Urgency[];
const STATUSES = Object.keys(COMMERCIAL_STATUS_LABELS) as CommercialStatus[];

export interface LeadListOptions {
  /** Nome, telefone, e-mail, processo, cidade ou resumo do caso. */
  q: string | null;
  area: LegalArea | null;
  urgencia: Urgency | null;
  /** Etapa do funil (status comercial). */
  etapa: CommercialStatus | null;
  /** Origem do lead (texto livre no banco). */
  origem: string | null;
  /** Id de quem é responsável, ou "sem". */
  resp: string | null;
  ordem: LeadSort;
}

function oneOf<T extends string>(sp: RawParams, key: string, values: readonly T[]): T | null {
  const v = param(sp, key);
  return v && (values as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * Lê a URL. Valores fora das listas são ignorados. Com `known`, um
 * responsável ou uma origem que não aparecem na lista também são.
 */
export function parseLeadOptions(
  sp: RawParams,
  known: { owners?: readonly string[]; sources?: readonly string[] } = {}
): LeadListOptions {
  const resp = param(sp, "resp");
  const origem = param(sp, "origem");
  return {
    q: param(sp, "q"),
    area: oneOf(sp, "area", AREAS),
    urgencia: oneOf(sp, "urgencia", URGENCIES),
    etapa: oneOf(sp, "etapa", STATUSES),
    origem: origem && (!known.sources || known.sources.includes(origem)) ? origem : null,
    resp: resp && (resp === NO_OWNER || !known.owners || known.owners.includes(resp)) ? resp : null,
    ordem: pickEnum(sp, "ordem", LEAD_SORTS, "recentes"),
  };
}

/** Algum filtro além do padrão (para mostrar o botão Limpar). */
export function leadFiltersActive(o: LeadListOptions): boolean {
  return Boolean(o.q || o.area || o.urgencia || o.etapa || o.origem || o.resp || o.ordem !== "recentes");
}

export function filterLeads(items: readonly Lead[], o: LeadListOptions): Lead[] {
  return items.filter(
    (l) =>
      matchesText(o.q, [l.full_name, l.phone, l.email, l.process_number, l.city, l.state, l.case_summary]) &&
      (!o.area || l.legal_area === o.area) &&
      (!o.urgencia || l.urgency === o.urgencia) &&
      (!o.etapa || l.commercial_status === o.etapa) &&
      (!o.origem || l.source === o.origem) &&
      (!o.resp || (o.resp === NO_OWNER ? !l.assigned_to : l.assigned_to === o.resp))
  );
}

const URGENCY_RANK: Record<Urgency, number> = { alta: 0, media: 1, baixa: 2 };

function recent(a: Lead, b: Lead): number {
  return compareDate(a.created_at, b.created_at, "desc");
}

/** "recentes" mantém a ordem que já vem do banco. */
export function sortLeads(items: readonly Lead[], ordem: LeadSort): Lead[] {
  switch (ordem) {
    case "recentes":
      return [...items];
    case "antigos":
      return sortedBy(items, (a, b) => compareDate(a.created_at, b.created_at, "asc"));
    case "nome":
      return sortedBy(items, (a, b) => compareText(a.full_name, b.full_name) || recent(a, b));
    case "urgencia":
      return sortedBy(
        items,
        (a, b) => (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9) || recent(a, b)
      );
    case "etapa":
      return sortedBy(
        items,
        (a, b) => rank(STATUSES, a.commercial_status) - rank(STATUSES, b.commercial_status) || recent(a, b)
      );
    case "atualizados":
      return sortedBy(items, (a, b) => compareDate(a.updated_at, b.updated_at, "desc") || recent(a, b));
  }
}

function rank<T>(list: readonly T[], v: T): number {
  const i = list.indexOf(v);
  return i === -1 ? list.length : i;
}

/** Origens presentes na lista, com rótulo legível. */
export function leadSourceOptions(items: readonly Lead[]): { value: string; label: string }[] {
  const values = [...new Set(items.map((l) => l.source).filter(Boolean))];
  return values
    .map((v) => ({ value: v, label: SOURCE_LABELS[v] ?? v }))
    .sort((a, b) => compareText(a.label, b.label));
}
