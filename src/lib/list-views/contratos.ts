import { CONTRACT_STATUS_LABELS } from "@/lib/constants";
import {
  compareDate,
  compareNumber,
  compareText,
  distinct,
  matchesText,
  param,
  pickEnum,
  sortedBy,
  type RawParams,
} from "@/lib/list-params";
import type { Contract, ContractStatus } from "@/lib/types";

/** Busca, filtros e ordenação da aba Contratos (funções puras). */

export const CONTRACT_SORTS = ["recentes", "valor_desc", "valor_asc", "assinatura", "cliente", "tipo"] as const;
export type ContractSort = (typeof CONTRACT_SORTS)[number];

/** A primeira é a padrão (igual à ordem de antes: cadastrados mais recentes primeiro). */
export const CONTRACT_SORT_LABELS: Record<ContractSort, string> = {
  recentes: "Mais recentes",
  valor_desc: "Maior valor",
  valor_asc: "Menor valor",
  assinatura: "Assinados mais recentes",
  cliente: "Cliente",
  tipo: "Tipo",
};

const STATUSES = Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[];

export interface ContractListOptions {
  q: string | null;
  status: ContractStatus | null;
  tipo: string | null;
  ordem: ContractSort;
}

export function parseContractOptions(sp: RawParams): ContractListOptions {
  const status = pickEnum<ContractStatus | "">(sp, "status", STATUSES, "");
  return {
    q: param(sp, "q"),
    status: status || null,
    tipo: param(sp, "tipo"),
    ordem: pickEnum(sp, "ordem", CONTRACT_SORTS, "recentes"),
  };
}

export function hasContractFilters(o: ContractListOptions): boolean {
  return Boolean(o.q || o.status || o.tipo || o.ordem !== "recentes");
}

export interface ContractRow {
  contract: Contract;
  clientName: string | null;
  caseTitle: string | null;
}

export function buildContractRows(
  contracts: Contract[],
  clientNames: Map<string, string>,
  caseTitles: Map<string, string>
): ContractRow[] {
  return contracts.map((c) => ({
    contract: c,
    clientName: (c.client_id && clientNames.get(c.client_id)) || null,
    caseTitle: (c.case_id && caseTitles.get(c.case_id)) || null,
  }));
}

export function filterContractRows(rows: ContractRow[], o: ContractListOptions): ContractRow[] {
  return rows.filter(
    (r) =>
      matchesText(o.q, [
        r.clientName,
        r.caseTitle,
        r.contract.contract_type,
        r.contract.payment_terms,
        CONTRACT_STATUS_LABELS[r.contract.status],
      ]) &&
      (!o.status || r.contract.status === o.status) &&
      (!o.tipo || r.contract.contract_type === o.tipo)
  );
}

export function sortContractRows(rows: ContractRow[], ordem: ContractSort): ContractRow[] {
  const recent = (a: ContractRow, b: ContractRow) => compareDate(a.contract.created_at, b.contract.created_at, "desc");
  switch (ordem) {
    case "valor_desc":
      return sortedBy(rows, (a, b) => compareNumber(a.contract.value, b.contract.value, "desc") || recent(a, b));
    case "valor_asc":
      return sortedBy(rows, (a, b) => compareNumber(a.contract.value, b.contract.value, "asc") || recent(a, b));
    case "assinatura":
      return sortedBy(rows, (a, b) => compareDate(a.contract.signed_at, b.contract.signed_at, "desc") || recent(a, b));
    case "cliente":
      return sortedBy(rows, (a, b) => compareText(a.clientName, b.clientName) || recent(a, b));
    case "tipo":
      return sortedBy(rows, (a, b) => compareText(a.contract.contract_type, b.contract.contract_type) || recent(a, b));
    default:
      return sortedBy(rows, recent);
  }
}

/** Opções dos seletores, a partir da lista completa. */
export function contractFilterOptions(rows: ContractRow[]) {
  const statuses = new Set(rows.map((r) => r.contract.status));
  return {
    status: STATUSES.filter((s) => statuses.has(s)).map((s) => ({ value: s, label: CONTRACT_STATUS_LABELS[s] })),
    tipos: distinct(rows.map((r) => r.contract.contract_type)).map((v) => ({ value: v, label: v })),
  };
}
