/**
 * Datas digitadas nos formulários do CRM, sempre no horário de Brasília.
 *
 * O servidor (Vercel) roda em UTC. Sem isto, `new Date("2026-11-20T14:00")`
 * vira 14:00 UTC (11:00 em Brasília) e `new Date("2026-11-20")` vira
 * 20/11 00:00 UTC, que aparece como 19/11 na tela.
 * São Paulo não tem horário de verão desde 2019: o deslocamento é sempre -03:00.
 */
const OFFSET = "-03:00";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function valid(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Campo `datetime-local` ("2026-11-20T14:00") ou `date` ("2026-11-20") em ISO.
 * Só a data: meio-dia em Brasília (o dia não muda em nenhum fuso do Brasil).
 * Texto que já traz fuso (Z ou ±hh:mm) é mantido. Vazio ou inválido: null.
 */
export function brInputToIso(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (DATE_RE.test(v)) return valid(`${v}T12:00:00${OFFSET}`);
  if (LOCAL_DATETIME_RE.test(v)) return valid(`${v.length === 16 ? `${v}:00` : v}${OFFSET}`);
  return valid(v);
}

/**
 * O contrário de brInputToIso: data gravada (ISO) no formato do campo
 * `datetime-local` ("2026-11-20T14:00"), no horário de Brasília. Usado para
 * preencher os formulários de edição. Vazio ou inválido: "".
 */
export function isoToBrInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // -03:00 fixo (sem horário de verão desde 2019).
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 16);
}
