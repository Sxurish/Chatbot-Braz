/**
 * Regras puras da conferência das intimações. Sem banco e sem rede: servem
 * ao servidor (confirm.ts), à tela (cálculo ao vivo) e aos testes. A tela e o
 * servidor montam a conta pela MESMA função, para o número ser o mesmo.
 */

import { brDay } from "@/lib/prazos/calendar";
import { computeDeadline, MAX_DAYS } from "@/lib/prazos/compute";
import type { CalendarDay, DeadlineInput, DeadlineResult, DeadlineUnit, StartKind } from "@/lib/prazos/types";
import type { CourtPublication } from "./types";

/** Aviso quando o advogado escolhe contar da ciência: no DJEN só temos a disponibilização. */
export const CIENCIA_WARNING =
  "Contado a partir da ciência. O DJEN só informa a disponibilização: usamos essa data como a da ciência. Confira.";

/** "Comarca de Santo André" → "Santo André" (para os feriados municipais). */
export function comarcaOf(jurisdiction: string | null | undefined): string {
  return String(jurisdiction ?? "")
    .replace(/^comarca d[aeo]s?\s+/i, "")
    .split(/[-–/]/)[0]
    .trim();
}

export interface PublicationDeadlineOptions {
  days: number;
  unit: DeadlineUnit;
  startKind: StartKind;
  dobro: boolean;
  comarca?: string | null;
}

/** Entrada do cálculo: sempre a partir da data de disponibilização da intimação. */
export function publicationDeadlineInput(pub: Pick<CourtPublication, "available_date">, o: PublicationDeadlineOptions): DeadlineInput {
  const comarca = (o.comarca ?? "").trim();
  return {
    start: { kind: o.startKind, date: pub.available_date },
    days: o.days,
    unit: o.unit,
    ...(o.dobro ? { dobro: true } : {}),
    ...(comarca ? { comarca } : {}),
  };
}

/** Faz a conta (lança erro se a entrada for inválida) e acrescenta o aviso da ciência. */
export function computePublicationDeadline(
  pub: Pick<CourtPublication, "available_date">,
  o: PublicationDeadlineOptions,
  calendar: CalendarDay[]
): { input: DeadlineInput; result: DeadlineResult } {
  const input = publicationDeadlineInput(pub, o);
  const result = computeDeadline(input, calendar);
  if (o.startKind === "intimacao") result.warnings = [CIENCIA_WARNING, ...result.warnings];
  return { input, result };
}

/** Texto curto do andamento criado na confirmação. */
export function movementDescription(
  pub: Pick<CourtPublication, "kind" | "ai_reading">,
  finalDate: string
): string {
  const what = pub.ai_reading?.actType?.trim() || pub.kind?.trim() || "Intimação";
  return `Intimação (DJEN): ${what} — prazo até ${brDay(finalDate)}`;
}

/** Valores iniciais do formulário de confirmação (sugestão da IA ou padrão). */
export interface ConfirmFormDefaults {
  days: number | null;
  unit: DeadlineUnit;
  startKind: StartKind;
  dobro: boolean;
  title: string;
}

export function confirmFormDefaults(pub: Pick<CourtPublication, "ai_reading" | "kind">): ConfirmFormDefaults {
  const r = pub.ai_reading;
  const days = r?.suggestedDays && Number.isInteger(r.suggestedDays) && r.suggestedDays >= 1 && r.suggestedDays <= MAX_DAYS ? r.suggestedDays : null;
  return {
    days,
    unit: r?.suggestedUnit ?? "uteis",
    startKind: r?.startKind ?? "disponibilizacao",
    dobro: r?.dobro ?? false,
    title: (r?.taskTitle || r?.actType || "").trim(),
  };
}

/** Campos que a IA marcou com dúvida (nomes normalizados). */
export function uncertainSet(pub: Pick<CourtPublication, "ai_reading">): Set<string> {
  return new Set((pub.ai_reading?.uncertain ?? []).map((f) => String(f).trim().toLowerCase()));
}
