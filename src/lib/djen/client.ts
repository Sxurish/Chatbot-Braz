import "server-only";
import { djenKey } from "@/lib/djen/dedupe";
import { parseDjenEnvelope, parseDjenItems, type DjenCommunication, type DjenRejectedItem } from "@/lib/djen/parse";

/**
 * Cliente do DJEN (Diário de Justiça Eletrônico Nacional, API Comunica PJe
 * do CNJ). A API é pública e não pede chave, mas só aceita acesso a partir
 * do Brasil: fora daqui o CloudFront responde 403.
 */
const DEFAULT_BASE_URL = "https://comunicaapi.pje.jus.br";
const TIMEOUT_MS = 20_000;
/** Maior página que pedimos ao DJEN. */
export const DJEN_MAX_PER_PAGE = 100;
/** Limite de segurança de páginas numa busca completa. */
export const DJEN_MAX_PAGES = 20;
/** Pausa entre páginas, para não sobrecarregar a API. */
export const DJEN_PAGE_DELAY_MS = 400;

export const DJEN_GEOBLOCK_MESSAGE =
  "O DJEN só aceita acesso a partir do Brasil. Confira se o CRM está rodando na região de São Paulo.";

export interface DjenQuery {
  /** Número da OAB (pontos são ignorados). */
  oab: string;
  /** Sigla do estado da OAB. */
  uf: string;
  /** AAAA-MM-DD. */
  from: string;
  /** AAAA-MM-DD. */
  to: string;
}

export type DjenPageResult =
  | { ok: true; count: number | null; items: DjenCommunication[]; rejected: DjenRejectedItem[]; rawCount: number; error: null; retry: false }
  | { ok: false; items: DjenCommunication[]; rejected: DjenRejectedItem[]; error: string; retry: boolean };

export type DjenAllResult =
  | {
      ok: true;
      count: number | null;
      items: DjenCommunication[];
      rejected: DjenRejectedItem[];
      pages: number;
      /** true quando paramos no limite de páginas antes de ler tudo. */
      truncated: boolean;
      error: null;
      retry: false;
    }
  | { ok: false; items: DjenCommunication[]; rejected: DjenRejectedItem[]; pages: number; error: string; retry: boolean };

export function djenConfig() {
  return { baseUrl: (process.env.DJEN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "") };
}

function fail(error: string, retry: boolean): Extract<DjenPageResult, { ok: false }> {
  return { ok: false, items: [], rejected: [], error, retry };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Confere os filtros. Devolve o erro em português ou os valores limpos. */
function checkQuery(q: DjenQuery): { ok: true; oab: string; uf: string } | { ok: false; error: string } {
  const oab = (q.oab ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const uf = (q.uf ?? "").trim().toUpperCase();
  if (!oab) return { ok: false, error: "Informe o número da OAB." };
  if (!/^[A-Z]{2}$/.test(uf)) return { ok: false, error: "Informe a sigla do estado da OAB (ex.: SP)." };
  if (!ISO_DATE.test(q.from) || !ISO_DATE.test(q.to)) return { ok: false, error: "Datas da busca inválidas." };
  if (q.from > q.to) return { ok: false, error: "A data inicial é depois da data final." };
  return { ok: true, oab, uf };
}

/** O CloudFront diz "block access from your country" no corpo do 403. */
async function looksGeoblocked(res: Response): Promise<boolean> {
  try {
    const body = (await res.text()).slice(0, 4000).toLowerCase();
    return body.includes("country") || body.includes("país");
  } catch {
    return false;
  }
}

/** Busca uma página de comunicações. Nunca lança: devolve o erro em português. */
export async function fetchDjenCommunications(
  params: DjenQuery & { page?: number; perPage?: number },
): Promise<DjenPageResult> {
  const checked = checkQuery(params);
  if (!checked.ok) return fail(checked.error, false);
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const perPage = Math.min(DJEN_MAX_PER_PAGE, Math.max(1, Math.floor(params.perPage ?? DJEN_MAX_PER_PAGE)));

  const url = new URL(`${djenConfig().baseUrl}/api/v1/comunicacao`);
  url.searchParams.set("numeroOab", checked.oab);
  url.searchParams.set("ufOab", checked.uf);
  url.searchParams.set("dataDisponibilizacaoInicio", params.from);
  url.searchParams.set("dataDisponibilizacaoFim", params.to);
  url.searchParams.set("pagina", String(page));
  url.searchParams.set("itensPorPagina", String(perPage));

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timeout = (err as Error)?.name === "TimeoutError";
    return fail(timeout ? "O DJEN demorou demais para responder." : "Não foi possível falar com o DJEN.", true);
  }

  if (res.status === 403) {
    return (await looksGeoblocked(res))
      ? fail(DJEN_GEOBLOCK_MESSAGE, false)
      : fail(`O DJEN recusou o acesso (403). ${DJEN_GEOBLOCK_MESSAGE}`, false);
  }
  if (res.status === 429) {
    return fail("Limite de consultas do DJEN atingido. Tente mais tarde.", true);
  }
  if (res.status >= 500) {
    return fail(`O DJEN está instável agora (erro ${res.status}).`, true);
  }
  if (!res.ok) {
    return fail(`O DJEN recusou a consulta (erro ${res.status}).`, false);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return fail("Resposta do DJEN em formato inesperado.", true);
  }
  const envelope = parseDjenEnvelope(body);
  if (!envelope.ok) return fail(envelope.error, true);

  const parsed = parseDjenItems(envelope.rawItems);
  return {
    ok: true,
    count: envelope.count,
    items: parsed.items,
    rejected: parsed.rejected,
    rawCount: envelope.rawItems.length,
    error: null,
    retry: false,
  };
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * Percorre todas as páginas até juntar `count` itens (ou acabar a lista),
 * com limite de segurança de páginas e uma pausa entre elas.
 * Em caso de erro, devolve também o que já tinha lido (`items`): a
 * gravação é segura porque cada item tem chave estável.
 */
export async function fetchAllDjenCommunications(
  params: DjenQuery & { perPage?: number; maxPages?: number; delayMs?: number },
): Promise<DjenAllResult> {
  const perPage = Math.min(DJEN_MAX_PER_PAGE, Math.max(1, Math.floor(params.perPage ?? DJEN_MAX_PER_PAGE)));
  const maxPages = Math.max(1, Math.floor(params.maxPages ?? DJEN_MAX_PAGES));
  const delayMs = Math.max(0, params.delayMs ?? DJEN_PAGE_DELAY_MS);

  const items: DjenCommunication[] = [];
  const rejected: DjenRejectedItem[] = [];
  const keys = new Set<string>();
  let count: number | null = null;
  let rawSeen = 0;
  let pages = 0;

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await wait(delayMs);
    const res = await fetchDjenCommunications({ ...params, page, perPage });
    pages = page;
    if (!res.ok) {
      return { ok: false, items, rejected, pages, error: res.error, retry: res.retry };
    }
    if (count === null) count = res.count;
    for (const r of res.rejected) rejected.push({ ...r, index: rawSeen + r.index });
    // As páginas podem se deslocar se algo for publicado durante a busca.
    for (const item of res.items) {
      const key = djenKey(item);
      if (keys.has(key)) continue;
      keys.add(key);
      items.push(item);
    }
    rawSeen += res.rawCount;

    const done = res.rawCount === 0 || res.rawCount < perPage || (count !== null && rawSeen >= count);
    if (done) {
      return { ok: true, count, items, rejected, pages, truncated: false, error: null, retry: false };
    }
  }
  return { ok: true, count, items, rejected, pages, truncated: true, error: null, retry: false };
}
