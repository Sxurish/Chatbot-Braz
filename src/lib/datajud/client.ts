import "server-only";
import { parseDatajudResponse, type DatajudSearchResponse } from "@/lib/datajud/parse";
import { cnjOnlyDigits, tribunalFromCnj } from "@/lib/datajud/tribunals";

/**
 * Chave pública da API do DataJud, divulgada pelo CNJ para qualquer pessoa em
 * https://datajud-wiki.cnj.jus.br/api-publica/acesso (não é segredo). O CNJ
 * pode trocá-la: nesse caso, coloque a nova em DATAJUD_API_KEY na Vercel.
 */
const PUBLIC_DATAJUD_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
const DEFAULT_BASE_URL = "https://api-publica.datajud.cnj.jus.br";
const TIMEOUT_MS = 20_000;

export type DatajudFetchResult =
  | { ok: true; found: boolean; tribunal: string; rows: ReturnType<typeof parseDatajudResponse>["rows"]; info: ReturnType<typeof parseDatajudResponse>["info"] }
  | { ok: false; error: string; retry: boolean };

export function datajudConfig() {
  return {
    baseUrl: (process.env.DATAJUD_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    apiKey: process.env.DATAJUD_API_KEY || PUBLIC_DATAJUD_KEY,
  };
}

/** Busca o processo no DataJud pelo número CNJ. Nunca lança: devolve o erro em português. */
export async function fetchDatajudMovements(processNumber: string | null): Promise<DatajudFetchResult> {
  const digits = cnjOnlyDigits(processNumber);
  if (digits.length !== 20) {
    return { ok: false, error: "Sem número CNJ completo (20 dígitos).", retry: false };
  }
  const tribunal = tribunalFromCnj(digits);
  if (!tribunal) {
    return { ok: false, error: "Tribunal deste número não está no DataJud (ex.: STF).", retry: false };
  }

  const { baseUrl, apiKey } = datajudConfig();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api_publica_${tribunal.alias}/_search`, {
      method: "POST",
      headers: { Authorization: `APIKey ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { match: { numeroProcesso: digits } }, size: 20 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timeout = (err as Error)?.name === "TimeoutError";
    return {
      ok: false,
      error: timeout ? "O DataJud demorou demais para responder." : "Não foi possível falar com o DataJud.",
      retry: true,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "O DataJud recusou a chave de acesso. Confira DATAJUD_API_KEY.", retry: false };
  }
  if (res.status === 404) {
    return { ok: false, error: `O ${tribunal.label} não está disponível no DataJud.`, retry: false };
  }
  if (res.status === 429) {
    return { ok: false, error: "Limite de consultas do DataJud atingido. Tente mais tarde.", retry: true };
  }
  if (!res.ok) {
    return { ok: false, error: `O DataJud respondeu com erro (${res.status}).`, retry: true };
  }

  let body: DatajudSearchResponse;
  try {
    body = (await res.json()) as DatajudSearchResponse;
  } catch {
    return { ok: false, error: "Resposta do DataJud em formato inesperado.", retry: true };
  }
  const parsed = parseDatajudResponse(body);
  return { ok: true, found: parsed.found, tribunal: tribunal.label, rows: parsed.rows, info: parsed.info };
}
