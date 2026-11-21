/**
 * Ajudantes das abas com busca, filtros e ordenação na URL.
 * Tudo fica nos parâmetros do endereço (dá para salvar nos favoritos ou mandar
 * o link) e funciona sem JavaScript, com um formulário GET.
 * Funções puras: podem ser usadas no servidor, no cliente e nos testes.
 */

export type RawParams = Record<string, string | string[] | undefined>;

/** Primeiro valor de um parâmetro, sem espaços nas pontas e com no máximo 200 caracteres. */
export function param(sp: RawParams, key: string): string | null {
  const v = sp[key];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 200) : null;
}

/** Caixa marcada ("1"). */
export function flag(sp: RawParams, key: string): boolean {
  return param(sp, key) === "1";
}

/** Valor de uma lista fechada; qualquer outro vira o padrão. */
export function pickEnum<T extends string>(sp: RawParams, key: string, values: readonly T[], fallback: T): T {
  const v = param(sp, key);
  return (values as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
}

/** Sem acento e em minúsculas, para a busca não depender de digitação. */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Busca livre: todas as palavras precisam aparecer em algum dos campos.
 * Números com 4 dígitos ou mais também casam com campos só de dígitos
 * (telefone, CPF, número do processo), ignorando pontos e traços.
 */
export function matchesText(q: string | null, fields: (string | null | undefined)[]): boolean {
  if (!q) return true;
  const hay = normalizeText(fields.filter(Boolean).join(" \n "));
  const hayDigits = hay.replace(/\D/g, "");
  return normalizeText(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => {
      if (hay.includes(word)) return true;
      const digits = word.replace(/\D/g, "");
      return digits.length >= 4 && digits === word.replace(/[.\-/()]/g, "") && hayDigits.includes(digits);
    });
}

/** Monta o endereço mantendo os parâmetros atuais e trocando os pedidos (null apaga). */
export function hrefWith(path: string, current: RawParams, changes: Record<string, string | null>): string {
  const params = new URLSearchParams();
  for (const k of Object.keys(current)) {
    const s = param(current, k);
    if (s) params.set(k, s);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Ordem alfabética em português; vazios sempre no fim. */
export function compareText(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return collator.compare(a, b);
}

/** Datas ISO (ou AAAA-MM-DD); vazias sempre no fim, nos dois sentidos. */
export function compareDate(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: "asc" | "desc" = "asc"
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

/** Números; vazios sempre no fim. */
export function compareNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: "asc" | "desc" = "asc"
): number {
  const na = a ?? null;
  const nb = b ?? null;
  if (na === null && nb === null) return 0;
  if (na === null) return 1;
  if (nb === null) return -1;
  return dir === "asc" ? na - nb : nb - na;
}

/** Ordena sem alterar a lista original. */
export function sortedBy<T>(items: readonly T[], cmp: (a: T, b: T) => number): T[] {
  return [...items].sort(cmp);
}

/** Valores distintos (sem vazios) em ordem alfabética, para os seletores. */
export function distinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort(collator.compare);
}
