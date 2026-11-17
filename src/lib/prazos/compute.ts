import {
  addDays,
  brDay,
  brDayLong,
  buildCalendar,
  isIsoDate,
  RECESS_REASON,
  RECESS_SOURCE,
  type ForensicCalendar,
} from "./calendar";
import type { CalendarDay, DeadlineInput, DeadlineResult, DeadlineStep, SkippedDay } from "./types";

/**
 * Cálculo de prazos processuais (TJSP). Função pura: recebe a entrada e os
 * dias da tabela do calendário e devolve a conta passo a passo, com cada dia
 * pulado e a fonte. É uma SUGESTÃO: o advogado confere antes de valer.
 */

export const MAX_DAYS = 365;

/** Confere a entrada. Devolve a mensagem de erro ou null. */
export function validateDeadlineInput(input: DeadlineInput): string | null {
  if (!input || !input.start) return "Informe a data de início.";
  if (input.start.kind !== "disponibilizacao" && input.start.kind !== "intimacao") return "Tipo de início inválido.";
  if (!isIsoDate(input.start.date)) return "Data inválida.";
  if (!Number.isInteger(input.days) || input.days < 1) return "Informe o número de dias (1 ou mais).";
  if (input.days > MAX_DAYS) return `Prazo longo demais (máx. ${MAX_DAYS} dias).`;
  if (input.unit !== "uteis" && input.unit !== "corridos") return "Escolha dias úteis ou corridos.";
  return null;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function computeDeadline(input: DeadlineInput, calendarDays: CalendarDay[]): DeadlineResult {
  const invalid = validateDeadlineInput(input);
  if (invalid) throw new Error(invalid);

  const cal = buildCalendar(calendarDays, input.comarca);
  const skipped: SkippedDay[] = [];
  const steps: DeadlineStep[] = [];
  const seen = new Set<string>();

  const skip = (date: string, reason: string, source: string) => {
    if (seen.has(date)) return;
    seen.add(date);
    skipped.push({ date, reason, source });
  };

  /** Primeiro dia útil DEPOIS de `iso`, anotando os dias pulados no caminho. */
  const nextBusinessDay = (iso: string, c: ForensicCalendar = cal): string => {
    let d = addDays(iso, 1);
    for (let guard = 0; guard < 400; guard++) {
      const why = c.nonWorking(d);
      if (!why) return d;
      skip(d, why.reason, why.source);
      d = addDays(d, 1);
    }
    throw new Error("Calendário sem dia útil em mais de um ano.");
  };

  const { kind, date } = input.start;
  let publicationDate: string | undefined;
  let startDate: string;

  if (kind === "disponibilizacao") {
    steps.push({
      label: "Disponibilização no DJEN",
      date,
      detail: `A intimação foi disponibilizada no Diário de Justiça Eletrônico Nacional em ${brDayLong(date)}.`,
    });
    publicationDate = nextBusinessDay(date);
    steps.push({
      label: "Publicação",
      date: publicationDate,
      detail: `Considera-se publicada no 1º dia útil seguinte à disponibilização: ${brDayLong(publicationDate)} (Lei 11.419/2006, art. 4º, §3º).`,
    });
    startDate = nextBusinessDay(publicationDate);
    steps.push({
      label: "Início da contagem",
      date: startDate,
      detail: `O prazo começa no 1º dia útil seguinte à publicação: ${brDayLong(startDate)} (Lei 11.419/2006, art. 4º, §4º; CPC, art. 224, §3º).`,
    });
  } else {
    steps.push({
      label: "Intimação",
      date,
      detail: `A intimação ocorreu em ${brDayLong(date)}. O dia da intimação não conta (CPC, art. 224).`,
    });
    startDate = nextBusinessDay(date);
    steps.push({
      label: "Início da contagem",
      date: startDate,
      detail: `O prazo começa no 1º dia útil seguinte: ${brDayLong(startDate)} (CPC, art. 224).`,
    });
  }

  const total = input.dobro ? input.days * 2 : input.days;
  if (input.dobro) {
    steps.push({
      label: "Prazo em dobro",
      date: null,
      detail: `${plural(input.days, "dia", "dias")} × 2 = ${plural(total, "dia", "dias")} (CPC, arts. 180, 183, 186 e 229).`,
    });
  }

  let finalDate: string;
  if (input.unit === "uteis") {
    // O início já é dia útil: ele é o 1º dia.
    let d = startDate;
    for (let n = 1; n < total; n++) d = nextBusinessDay(d);
    finalDate = d;
    steps.push({
      label: "Contagem em dias úteis",
      date: finalDate,
      detail: `Contam-se só os dias úteis (CPC, art. 219). 1º dia: ${brDay(startDate)}; ${total}º dia: ${brDay(finalDate)}.`,
    });
  } else {
    // Corridos: conta todo dia, menos os do recesso (CPC, art. 220).
    let d = startDate;
    let counted = 1;
    while (counted < total) {
      d = addDays(d, 1);
      if (cal.nonWorking(d)?.kind === "recesso") {
        skip(d, RECESS_REASON, RECESS_SOURCE);
        continue;
      }
      counted++;
    }
    steps.push({
      label: "Contagem em dias corridos",
      date: d,
      detail: `Contam-se todos os dias, menos os do recesso forense (CPC, art. 220). 1º dia: ${brDay(startDate)}; ${total}º dia: ${brDay(d)}.`,
    });
    const why = cal.nonWorking(d);
    if (why) {
      skip(d, why.reason, why.source);
      finalDate = nextBusinessDay(d);
      steps.push({
        label: "Prorrogação",
        date: finalDate,
        detail: `O último dia (${brDayLong(d)}) não é dia útil (${why.reason.toLowerCase()}). O prazo vai para o próximo dia útil: ${brDay(finalDate)} (CPC, art. 224, §1º).`,
      });
    } else {
      finalDate = d;
    }
  }

  steps.push({
    label: "Data final",
    date: finalDate,
    detail: `Vence em ${brDayLong(finalDate)}.`,
  });

  skipped.sort((a, b) => a.date.localeCompare(b.date));

  const warnings: string[] = [];
  const firstYear = Number(date.slice(0, 4));
  const lastYear = Number(finalDate.slice(0, 4));
  for (let y = firstYear; y <= lastYear; y++) {
    if (!cal.yearsWithTable.has(y)) {
      warnings.push(
        `Não há dias cadastrados no calendário de ${y} (Carnaval, Semana Santa, suspensões). Confira esse ano antes de usar a data.`
      );
    }
  }
  if (!input.comarca?.trim()) {
    warnings.push("Comarca não informada: feriados municipais não entraram na conta.");
  }

  return {
    finalDate,
    publicationDate,
    startDate,
    countedDays: total,
    steps,
    skipped,
    warnings,
  };
}

/** Junta dias pulados seguidos com o mesmo motivo (ex.: o recesso inteiro numa linha). */
export function groupSkipped(skipped: SkippedDay[]): { from: string; to: string; reason: string; source: string }[] {
  const out: { from: string; to: string; reason: string; source: string }[] = [];
  for (const s of skipped) {
    const last = out[out.length - 1];
    if (last && last.reason === s.reason && last.source === s.source && addDays(last.to, 1) === s.date) {
      last.to = s.date;
    } else {
      out.push({ from: s.date, to: s.date, reason: s.reason, source: s.source });
    }
  }
  return out;
}

/** "16/11/2026" ou "20/12/2026 a 20/01/2027". */
export function rangeLabel(from: string, to: string): string {
  return from === to ? brDay(from) : `${brDay(from)} a ${brDay(to)}`;
}
