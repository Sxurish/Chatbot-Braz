import { param, type RawParams } from "@/lib/list-params";
import { isIsoDate } from "@/lib/prazos/calendar";

/**
 * Dia (AAAA-MM-DD) no horário de Brasília. Datas puras ("2026-11-16") ficam
 * como estão; data e hora viram o dia em que caem em Brasília.
 */
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function spDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string" && isIsoDate(value)) return value;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : dayFmt.format(d);
}

/** Parâmetro de data (AAAA-MM-DD) válido; qualquer outro valor é ignorado. */
export function dayParam(sp: RawParams, key: string): string | null {
  const v = param(sp, key);
  return isIsoDate(v) ? v : null;
}
