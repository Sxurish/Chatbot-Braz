/**
 * Busca, filtros e ordem da aba Templates de documentos. Funções puras (testes
 * em tests/list-views-operacao.test.ts).
 */
import { compareDate, compareText, distinct, matchesText, param, pickEnum, sortedBy, type RawParams } from "@/lib/list-params";
import { TEMPLATE_CATEGORY_LABELS, type DocumentTemplate } from "@/lib/data/templates-types";
import { enumOrNull, type Option } from "./common";

export const TEMPLATE_STATES = ["ativos", "inativos"] as const;
export type TemplateState = (typeof TEMPLATE_STATES)[number];
export const TEMPLATE_STATE_LABELS: Record<TemplateState, string> = {
  ativos: "Ativos",
  inativos: "Inativos",
};

/** "nome" é a ordem de sempre. */
export const TEMPLATE_SORTS = ["nome", "categoria", "recentes"] as const;
export type TemplateSort = (typeof TEMPLATE_SORTS)[number];
export const TEMPLATE_SORT_LABELS: Record<TemplateSort, string> = {
  nome: "Nome (A a Z)",
  categoria: "Categoria",
  recentes: "Mais recentes",
};

export interface TemplateView {
  q: string | null;
  categoria: string | null;
  situacao: TemplateState | null;
  ordem: TemplateSort;
}

export function parseTemplateView(sp: RawParams): TemplateView {
  return {
    q: param(sp, "q"),
    // Categoria é texto livre no banco: o valor é comparado como veio.
    categoria: param(sp, "categoria"),
    situacao: enumOrNull(sp, "situacao", TEMPLATE_STATES),
    ordem: pickEnum(sp, "ordem", TEMPLATE_SORTS, "nome"),
  };
}

export function isTemplateViewFiltered(v: TemplateView): boolean {
  return Boolean(v.q || v.categoria || v.situacao || v.ordem !== "nome");
}

export function categoryLabel(category: string): string {
  return TEMPLATE_CATEGORY_LABELS[category] ?? category;
}

/** Categorias conhecidas e as que aparecem nos templates cadastrados. */
export function templateCategoryOptions(items: readonly DocumentTemplate[]): Option[] {
  return distinct([...Object.keys(TEMPLATE_CATEGORY_LABELS), ...items.map((t) => t.category)])
    .map((value) => ({ value, label: categoryLabel(value) }))
    .sort((a, b) => compareText(a.label, b.label));
}

export function filterTemplates(items: readonly DocumentTemplate[], v: TemplateView): DocumentTemplate[] {
  return items.filter((t) => {
    if (v.categoria && t.category !== v.categoria) return false;
    if (v.situacao === "ativos" && !t.active) return false;
    if (v.situacao === "inativos" && t.active) return false;
    return matchesText(v.q, [t.name, t.description, categoryLabel(t.category)]);
  });
}

export function sortTemplates(items: readonly DocumentTemplate[], ordem: TemplateSort): DocumentTemplate[] {
  switch (ordem) {
    case "categoria":
      return sortedBy(items, (a, b) => compareText(categoryLabel(a.category), categoryLabel(b.category)) || compareText(a.name, b.name));
    case "recentes":
      return sortedBy(items, (a, b) => compareDate(a.created_at, b.created_at, "desc") || compareText(a.name, b.name));
    default:
      return sortedBy(items, (a, b) => compareText(a.name, b.name));
  }
}
