import { MOVABLE_SOURCE, movableSuspensions } from "./calendar";
import { computeDeadline } from "./compute";
import type { CalendarDay, DeadlineCalculation, DeadlineInput } from "./types";

/**
 * Dados fictícios do modo demonstração (sem Supabase). Com o Supabase ligado
 * nada daqui aparece.
 */

const CREATED = "2026-11-01T12:00:00Z";

const movable: CalendarDay[] = [2026, 2027].flatMap((year) =>
  movableSuspensions(year).map((m, i) => ({
    id: `cal-${year}-${i + 1}`,
    court: "TJSP",
    day: m.day,
    kind: "suspensao" as const,
    comarca: null,
    description: m.description,
    source: MOVABLE_SOURCE,
    source_url: null,
    created_by: null,
    created_at: CREATED,
    removed_at: null,
    removed_by: null,
    removed_reason: null,
  }))
);

export const mockCalendarDays: CalendarDay[] = [
  ...movable,
  {
    id: "cal-2026-90",
    court: "TJSP",
    day: "2026-04-08",
    kind: "feriado_municipal",
    comarca: "Santo André",
    description: "Aniversário de Santo André",
    source: "Lei municipal de Santo André (exemplo para demonstração)",
    source_url: null,
    created_by: "demo-admin",
    created_at: CREATED,
    removed_at: null,
    removed_by: null,
    removed_reason: null,
  },
  {
    id: "cal-2026-91",
    court: "TJSP",
    day: "2026-10-30",
    kind: "ponto_facultativo",
    comarca: null,
    description: "Dia do Servidor Público (exemplo)",
    source: "Comunicado de exemplo",
    source_url: null,
    created_by: "demo-admin",
    created_at: CREATED,
    removed_at: "2026-11-02T13:00:00Z",
    removed_by: "demo-admin",
    removed_reason: "Cadastrado por engano: houve expediente normal.",
  },
];

function demoCalc(
  id: string,
  input: DeadlineInput,
  createdAt: string,
  extra: Partial<DeadlineCalculation> = {}
): DeadlineCalculation {
  const result = computeDeadline(input, mockCalendarDays);
  return {
    id,
    process_id: "proc-001",
    task_id: null,
    publication_id: null,
    previous_id: null,
    action: "calculo",
    input,
    result,
    final_date: result.finalDate,
    reason: null,
    created_by: "demo-admin",
    created_at: createdAt,
    created_by_name: "Dr. Jean Braz",
    process_number: "1002345-67.2026.8.26.0554",
    ...extra,
  };
}

const firstInput: DeadlineInput = {
  start: { kind: "disponibilizacao", date: "2026-11-16" },
  days: 15,
  unit: "uteis",
  comarca: "Santo André",
};

export const mockCalculations: DeadlineCalculation[] = [
  demoCalc("calc-002", firstInput, "2026-11-16T14:10:00Z", {
    action: "confirmacao",
    previous_id: "calc-001",
    task_id: "task-001",
  }),
  demoCalc("calc-001", firstInput, "2026-11-16T14:05:00Z"),
];
