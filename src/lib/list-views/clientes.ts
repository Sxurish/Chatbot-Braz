import {
  compareDate,
  compareText,
  distinct,
  matchesText,
  param,
  pickEnum,
  sortedBy,
  type RawParams,
} from "@/lib/list-params";
import type { Client } from "@/lib/types";

/**
 * Busca, filtros e ordenação da aba Clientes. Tudo vem da URL e roda em
 * memória sobre a lista que já vem do banco (mais recentes primeiro).
 */

export const CLIENT_SORTS = ["recentes", "antigos", "nome", "cidade"] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];

export const CLIENT_SORT_LABELS: Record<ClientSort, string> = {
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  nome: "Nome (A-Z)",
  cidade: "Cidade",
};

export const CLIENT_STATUSES = ["ativo", "inativo"] as const;
export const CLIENT_STATUS_LABELS: Record<Client["status"], string> = { ativo: "Ativo", inativo: "Inativo" };

export interface ClientListOptions {
  /** Nome, telefone, e-mail, CPF/CNPJ ou cidade. */
  q: string | null;
  status: Client["status"] | null;
  /** UF (sigla). */
  uf: string | null;
  cidade: string | null;
  ordem: ClientSort;
}

/** Lê a URL. Com `known`, UF ou cidade que não aparecem na lista são ignoradas. */
export function parseClientOptions(
  sp: RawParams,
  known: { ufs?: readonly string[]; cidades?: readonly string[] } = {}
): ClientListOptions {
  const status = param(sp, "status");
  const rawUf = param(sp, "uf")?.toUpperCase() ?? null;
  const uf = rawUf && /^[A-Z]{2}$/.test(rawUf) && (!known.ufs || known.ufs.includes(rawUf)) ? rawUf : null;
  const rawCidade = param(sp, "cidade");
  const cidade =
    rawCidade && (!known.cidades || known.cidades.some((c) => compareText(c, rawCidade) === 0)) ? rawCidade : null;
  return {
    q: param(sp, "q"),
    status: (CLIENT_STATUSES as readonly string[]).includes(status ?? "") ? (status as Client["status"]) : null,
    uf,
    cidade,
    ordem: pickEnum(sp, "ordem", CLIENT_SORTS, "recentes"),
  };
}

export function clientFiltersActive(o: ClientListOptions): boolean {
  return Boolean(o.q || o.status || o.uf || o.cidade || o.ordem !== "recentes");
}

function sameText(a: string | null | undefined, b: string): boolean {
  return compareText(a ?? "", b) === 0 && Boolean(a);
}

export function filterClients(items: readonly Client[], o: ClientListOptions): Client[] {
  return items.filter(
    (c) =>
      matchesText(o.q, [c.full_name, c.phone, c.email, c.cpf_cnpj, c.city, c.state]) &&
      (!o.status || c.status === o.status) &&
      (!o.uf || (c.state ?? "").toUpperCase() === o.uf) &&
      (!o.cidade || sameText(c.city, o.cidade))
  );
}

function recent(a: Client, b: Client): number {
  return compareDate(a.created_at, b.created_at, "desc");
}

/** "recentes" mantém a ordem que já vem do banco. */
export function sortClients(items: readonly Client[], ordem: ClientSort): Client[] {
  switch (ordem) {
    case "recentes":
      return [...items];
    case "antigos":
      return sortedBy(items, (a, b) => compareDate(a.created_at, b.created_at, "asc"));
    case "nome":
      return sortedBy(items, (a, b) => compareText(a.full_name, b.full_name) || recent(a, b));
    case "cidade":
      return sortedBy(
        items,
        (a, b) => compareText(a.city, b.city) || compareText(a.state, b.state) || compareText(a.full_name, b.full_name)
      );
  }
}

/** UFs e cidades presentes, para os seletores. */
export function clientPlaceOptions(items: readonly Client[]): { ufs: string[]; cidades: string[] } {
  return {
    ufs: distinct(items.map((c) => c.state?.toUpperCase())),
    cidades: distinct(items.map((c) => c.city)),
  };
}
