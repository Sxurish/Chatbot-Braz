import type { CalendarDay } from "./types";

/**
 * Calendário forense do TJSP (funções puras, sem banco).
 *
 * Dias sem expediente forense, nesta ordem de prioridade:
 * 1. Recesso de 20/12 a 20/01 (CPC art. 220): prazos suspensos.
 * 2. Sábado e domingo (CPC art. 216).
 * 3. Feriados nacionais fixos e o 9 de julho (feriado estadual de SP).
 * 4. Dias cadastrados na tabela (Carnaval, Semana Santa, Corpus Christi,
 *    feriados municipais e suspensões pontuais), sem os removidos.
 */

// ---------------------------------------------------------------------------
// Datas "AAAA-MM-DD" (meio-dia UTC: sem problema de fuso)
// ---------------------------------------------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado. */
export function weekday(iso: string): number {
  return toUtc(iso).getUTCDay();
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function weekdayName(iso: string): string {
  return WEEKDAYS[weekday(iso)];
}

/** "2026-11-16" → "16/11/2026" */
export function brDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-11-16" → "segunda-feira, 16/11/2026" */
export function brDayLong(iso: string): string {
  return `${weekdayName(iso)}, ${brDay(iso)}`;
}

// ---------------------------------------------------------------------------
// Páscoa e dias móveis (só para conferir a semente do banco e o modo demonstração)
// ---------------------------------------------------------------------------

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Dias móveis que o TJSP costuma suspender. Quarta-feira de Cinzas NÃO entra:
 * normalmente há expediente (a partir do meio-dia).
 */
export function movableSuspensions(year: number): { day: string; description: string }[] {
  const easter = easterSunday(year);
  return [
    { day: addDays(easter, -48), description: "Carnaval (segunda-feira)" },
    { day: addDays(easter, -47), description: "Carnaval (terça-feira)" },
    { day: addDays(easter, -3), description: "Quinta-feira Santa" },
    { day: addDays(easter, -2), description: "Sexta-feira Santa" },
    { day: addDays(easter, 60), description: "Corpus Christi" },
  ];
}

export const MOVABLE_SOURCE = "Calendário forense do TJSP (conferir o provimento do CSM do ano)";

// ---------------------------------------------------------------------------
// Feriados calculados pelo sistema
// ---------------------------------------------------------------------------

export interface AutomaticHoliday {
  /** MM-DD */
  monthDay: string;
  description: string;
  source: string;
}

const LEI_662 = "Lei 662/1949, com a redação da Lei 10.607/2002";

export const FIXED_HOLIDAYS: AutomaticHoliday[] = [
  { monthDay: "01-01", description: "Confraternização Universal", source: LEI_662 },
  { monthDay: "04-21", description: "Tiradentes", source: LEI_662 },
  { monthDay: "05-01", description: "Dia do Trabalho", source: LEI_662 },
  { monthDay: "07-09", description: "Revolução Constitucionalista (feriado estadual de SP)", source: "Lei estadual 9.497/1997" },
  { monthDay: "09-07", description: "Independência do Brasil", source: LEI_662 },
  { monthDay: "10-12", description: "Nossa Senhora Aparecida", source: "Lei 6.802/1980" },
  { monthDay: "11-02", description: "Finados", source: LEI_662 },
  { monthDay: "11-15", description: "Proclamação da República", source: LEI_662 },
  { monthDay: "11-20", description: "Dia Nacional de Zumbi e da Consciência Negra", source: "Lei 14.759/2023" },
  { monthDay: "12-25", description: "Natal", source: LEI_662 },
];

export const RECESS_REASON = "Recesso forense (20/12 a 20/01): prazos suspensos";
export const RECESS_SOURCE = "CPC, art. 220";
export const WEEKEND_SOURCE = "CPC, art. 216";

export function isRecess(iso: string): boolean {
  const md = iso.slice(5);
  return md >= "12-20" || md <= "01-20";
}

/** Feriados automáticos de um ano, com a data completa (para a tela do calendário). */
export function automaticHolidays(year: number): { day: string; description: string; source: string }[] {
  return FIXED_HOLIDAYS.map((h) => ({ day: `${year}-${h.monthDay}`, description: h.description, source: h.source }));
}

// ---------------------------------------------------------------------------
// Calendário montado para uma conta
// ---------------------------------------------------------------------------

export interface NonWorkingReason {
  kind: "recesso" | "fim_de_semana" | "feriado" | "tabela";
  reason: string;
  source: string;
}

/** Comarca para comparação: minúsculas, sem acento e sem "Comarca de". */
export function normalizeComarca(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^comarca d[aeo]s?\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ForensicCalendar {
  /** Motivo de o dia não ser útil; null = dia útil. */
  nonWorking(iso: string): NonWorkingReason | null;
  isBusinessDay(iso: string): boolean;
  /** Anos que têm ao menos um dia cadastrado na tabela. */
  yearsWithTable: Set<number>;
}

/**
 * Monta o calendário: só dias do TJSP, não removidos, gerais (comarca vazia)
 * ou da comarca pedida.
 */
export function buildCalendar(days: CalendarDay[], comarca?: string | null): ForensicCalendar {
  const wanted = normalizeComarca(comarca);
  const table = new Map<string, NonWorkingReason>();
  const yearsWithTable = new Set<number>();
  for (const d of days) {
    if (d.removed_at || (d.court ?? "TJSP") !== "TJSP" || !isIsoDate(d.day)) continue;
    yearsWithTable.add(Number(d.day.slice(0, 4)));
    if (d.comarca && normalizeComarca(d.comarca) !== wanted) continue;
    if (table.has(d.day)) continue;
    const where = d.comarca ? ` (comarca de ${d.comarca})` : "";
    table.set(d.day, { kind: "tabela", reason: `${d.description}${where}`, source: d.source });
  }
  const fixed = new Map(FIXED_HOLIDAYS.map((h) => [h.monthDay, h]));

  function nonWorking(iso: string): NonWorkingReason | null {
    if (isRecess(iso)) return { kind: "recesso", reason: RECESS_REASON, source: RECESS_SOURCE };
    const wd = weekday(iso);
    if (wd === 0 || wd === 6) {
      return { kind: "fim_de_semana", reason: wd === 0 ? "Domingo" : "Sábado", source: WEEKEND_SOURCE };
    }
    const h = fixed.get(iso.slice(5));
    if (h) return { kind: "feriado", reason: `Feriado: ${h.description}`, source: h.source };
    return table.get(iso) ?? null;
  }

  return { nonWorking, isBusinessDay: (iso) => nonWorking(iso) === null, yearsWithTable };
}
