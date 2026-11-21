import type { CourtPublication } from "@/lib/intimacoes/types";

/**
 * Filtros extras, ordenação e modo de exibição da aba Intimações.
 * Tudo vem da URL (dá para salvar nos favoritos ou mandar o link) e roda em
 * memória sobre a lista já filtrada no banco por situação, vínculo e datas
 * (são poucas dezenas por mês, com limite de 300 por consulta).
 */

export const SORTS = ["padrao", "recentes", "antigas", "prazo", "tribunal", "processo"] as const;
export type PublicationSort = (typeof SORTS)[number];

export const SORT_LABELS: Record<PublicationSort, string> = {
  padrao: "Para conferir primeiro",
  recentes: "Mais recentes",
  antigas: "Mais antigas",
  prazo: "Menor prazo sugerido",
  tribunal: "Tribunal e órgão",
  processo: "Processo",
};

export type PublicationView = "tabela" | "lista";

export interface PublicationViewOptions {
  /** Busca livre: número do processo, parte, cliente, órgão ou trecho da intimação. */
  q: string | null;
  tribunal: string | null;
  orgao: string | null;
  /** Tipo do ato lido pela IA (ex.: "Intimação para réplica"). */
  tipo: string | null;
  /** Só as que pedem providência (prazo sugerido ou ação pedida). */
  acao: boolean;
  /** Só as em que a IA ficou com dúvida. */
  duvida: boolean;
  /** Só as canceladas no DJEN. */
  cancelada: boolean;
  ordem: PublicationSort;
  vista: PublicationView;
}

type Raw = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | null {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 200) : null;
}

export function parseViewOptions(sp: Raw): PublicationViewOptions {
  const ordem = SORTS.find((s) => s === one(sp.ordem)) ?? "padrao";
  return {
    q: one(sp.q),
    tribunal: one(sp.tribunal),
    orgao: one(sp.orgao),
    tipo: one(sp.tipo),
    acao: one(sp.acao) === "1",
    duvida: one(sp.duvida) === "1",
    cancelada: one(sp.cancelada) === "1",
    ordem,
    vista: one(sp.vista) === "lista" ? "lista" : "tabela",
  };
}

/** Sem acento e em minúsculas, para a busca não depender de digitação. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function actTypeOf(p: CourtPublication): string {
  return p.ai_reading?.actType?.trim() || [p.kind, p.document_type].filter(Boolean).join(" · ") || "Intimação";
}

export function hasDoubt(p: CourtPublication): boolean {
  const r = p.ai_reading;
  return (r?.uncertain?.length ?? 0) > 0 || r?.confidence === "baixa";
}

export function requiresAction(p: CourtPublication): boolean {
  const r = p.ai_reading;
  return Boolean(r && (r.requiresAction || r.suggestedDays));
}

function matchesQuery(p: CourtPublication, q: string): boolean {
  const needle = normalize(q);
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4 && (p.process_number ?? "").includes(digits)) return true;
  const hay = normalize(
    [
      p.process_number_masked,
      p.process_title,
      p.tribunal,
      p.organ,
      p.class_name,
      actTypeOf(p),
      p.ai_reading?.summary,
      ...(p.parties ?? []).map((x) => x.name),
      p.text,
    ]
      .filter(Boolean)
      .join(" \n ")
  );
  return hay.includes(needle);
}

export function applyViewFilters(items: CourtPublication[], o: PublicationViewOptions): CourtPublication[] {
  return items.filter(
    (p) =>
      (!o.q || matchesQuery(p, o.q)) &&
      (!o.tribunal || p.tribunal === o.tribunal) &&
      (!o.orgao || p.organ === o.orgao) &&
      (!o.tipo || actTypeOf(p) === o.tipo) &&
      (!o.acao || requiresAction(p)) &&
      (!o.duvida || hasDoubt(p)) &&
      (!o.cancelada || p.cancelled)
  );
}

/** Prazo sugerido em dias corridos aproximados, só para ordenar (dias úteis pesam mais). */
function deadlineWeight(p: CourtPublication): number {
  const r = p.ai_reading;
  if (!r?.suggestedDays) return Number.POSITIVE_INFINITY;
  const days = r.suggestedDays * (r.dobro ? 2 : 1);
  return r.suggestedUnit === "uteis" ? days * 1.4 : days;
}

function byDate(a: CourtPublication, b: CourtPublication): number {
  return a.available_date.localeCompare(b.available_date) || a.created_at.localeCompare(b.created_at);
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/**
 * Ordena a lista. "padrao" mantém a ordem que já vem do servidor (para
 * conferir primeiro, da mais antiga para a mais nova). Empates caem na data
 * mais antiga primeiro, para a fila andar.
 */
export function sortForView(items: CourtPublication[], sort: PublicationSort): CourtPublication[] {
  if (sort === "padrao") return items;
  const list = [...items];
  switch (sort) {
    case "recentes":
      return list.sort((a, b) => byDate(b, a));
    case "antigas":
      return list.sort(byDate);
    case "prazo":
      return list.sort((a, b) => deadlineWeight(a) - deadlineWeight(b) || byDate(a, b));
    case "tribunal":
      return list.sort(
        (a, b) =>
          collator.compare(a.tribunal ?? "~", b.tribunal ?? "~") ||
          collator.compare(a.organ ?? "~", b.organ ?? "~") ||
          byDate(a, b)
      );
    case "processo":
      return list.sort(
        (a, b) =>
          collator.compare(a.process_number ?? "~", b.process_number ?? "~") || byDate(a, b)
      );
  }
}

/** Valores distintos para os seletores de filtro, em ordem alfabética. */
export function filterOptions(items: CourtPublication[]): { tribunais: string[]; orgaos: string[]; tipos: string[] } {
  const uniq = (xs: (string | null | undefined)[]) =>
    [...new Set(xs.filter((x): x is string => Boolean(x && x.trim())))].sort(collator.compare);
  return {
    tribunais: uniq(items.map((p) => p.tribunal)),
    orgaos: uniq(items.map((p) => p.organ)),
    tipos: uniq(items.map(actTypeOf)),
  };
}

/** Monta a URL da aba mantendo os parâmetros atuais e trocando os pedidos. */
export function intimacoesHref(current: Raw, changes: Record<string, string | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const s = one(v);
    if (s) params.set(k, s);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/intimacoes?${qs}` : "/intimacoes";
}
