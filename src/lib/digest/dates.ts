/**
 * Datas no fuso de São Paulo para o resumo diário. O Brasil não tem horário
 * de verão desde 2019, então o deslocamento é sempre -03:00.
 */

const TZ = "America/Sao_Paulo";
export const SP_OFFSET = "-03:00";
/** Horário do resumo automático (ver vercel.json: 12h UTC = 9h de Brasília). */
export const DIGEST_HOUR = 9;

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export function isoDateInSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Hora (0–23) no fuso de São Paulo. */
export function hourInSaoPaulo(date: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(date);
  return Number(h);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

export function weekdayName(isoDate: string): string {
  return WEEKDAYS[weekdayOf(isoDate)];
}

export function isWeekend(isoDate: string): boolean {
  const d = weekdayOf(isoDate);
  return d === 0 || d === 6;
}

/** Dia útil anterior (segunda → sexta). Feriados não entram. */
export function previousBusinessDay(isoDate: string): string {
  let d = addDays(isoDate, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

/** Instante (ISO, UTC) de uma data e hora de São Paulo. */
export function saoPauloInstant(isoDate: string, hour = 0): string {
  return new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00:00${SP_OFFSET}`).toISOString();
}

/**
 * Data de um campo do banco no fuso de São Paulo: "AAAA-MM-DD" fica como
 * está; um timestamp é convertido.
 */
export function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : isoDateInSaoPaulo(d);
}

/** "16/11" */
export function shortDateBr(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}

/** "16/11/2026" */
export function fullDateBr(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
}

/** Diferença em dias entre duas datas AAAA-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** "hoje", "amanhã", "quarta, 18/11", "venceu ontem", "venceu há 3 dias". */
export function relativeDayLabel(today: string, isoDate: string): string {
  const diff = daysBetween(today, isoDate);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "venceu ontem";
  if (diff < 0) return `venceu há ${-diff} dias`;
  return `${weekdayName(isoDate)}, ${shortDateBr(isoDate)}`;
}

/** Próximo resumo automático: dia útil às 9h de Brasília, a partir de `now`. */
export function nextDigestRun(now: Date): { date: string; label: string } {
  const today = isoDateInSaoPaulo(now);
  let date = today;
  if (isWeekend(date) || hourInSaoPaulo(now) >= DIGEST_HOUR) {
    date = addDays(date, 1);
    while (isWeekend(date)) date = addDays(date, 1);
  }
  const diff = daysBetween(today, date);
  const day = diff === 0 ? "hoje" : diff === 1 ? "amanhã" : `${weekdayName(date)}, ${shortDateBr(date)}`;
  return { date, label: `${day}, às ${DIGEST_HOUR}h` };
}
