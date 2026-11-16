/**
 * Datas dos processos sempre no horário de Brasília, igual no servidor e no
 * navegador (evita diferença de fuso entre o que o servidor desenha e a tela).
 */
const TZ = "America/Sao_Paulo";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const dayMonthFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const isoPartsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 16/11/2026 */
export function brDate(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : "—";
}

/** 16/11 */
export function brDayMonth(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? dayMonthFmt.format(d) : "—";
}

/** 14:30 */
export function brTime(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? timeFmt.format(d) : "";
}

/** 16/11/2026 às 14:30 */
export function brDateTime(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? `${dateFmt.format(d)} às ${timeFmt.format(d)}` : "—";
}

/** Partes para os campos de data/hora do formulário ("2026-11-16", "14:30"). */
export function brInputParts(value: string | Date | null | undefined): { date: string; time: string } {
  const d = value instanceof Date ? value : toDate(value);
  if (!d) return { date: "", time: "" };
  const parts = Object.fromEntries(isoPartsFmt.formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
