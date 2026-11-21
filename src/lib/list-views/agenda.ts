/**
 * Busca, filtros e ordem da aba Agenda (lista de compromissos). Funções puras
 * (testes em tests/list-views-operacao.test.ts).
 */
import { compareDate, compareText, matchesText, param, pickEnum, sortedBy, type RawParams } from "@/lib/list-params";
import type { TeamNames } from "@/lib/team-names";
import type { Appointment } from "@/lib/types";
import { assigneeParam, dateParam, enumOrNull, inPeriod, matchesAssignee } from "./common";

export type AppointmentModality = Appointment["modality"];
export type AppointmentStatus = Appointment["status"];

export const APPOINTMENT_MODALITIES = ["online", "presencial", "telefone"] as const satisfies readonly AppointmentModality[];
export const APPOINTMENT_MODALITY_LABELS: Record<AppointmentModality, string> = {
  online: "Online",
  presencial: "Presencial",
  telefone: "Telefone",
};

export const APPOINTMENT_STATUSES = ["agendada", "concluida", "cancelada", "remarcada"] as const satisfies readonly AppointmentStatus[];
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendada: "Agendada",
  concluida: "Concluída",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};

/** "data" é a ordem de sempre (mais próximos primeiro). */
export const APPOINTMENT_SORTS = ["data", "data_desc", "recentes"] as const;
export type AppointmentSort = (typeof APPOINTMENT_SORTS)[number];
export const APPOINTMENT_SORT_LABELS: Record<AppointmentSort, string> = {
  data: "Data (mais próxima)",
  data_desc: "Data (mais distante)",
  recentes: "Cadastrados por último",
};

export interface AppointmentView {
  q: string | null;
  modalidade: AppointmentModality | null;
  situacao: AppointmentStatus | null;
  responsavel: string | null;
  de: string | null;
  ate: string | null;
  ordem: AppointmentSort;
}

export function parseAppointmentView(sp: RawParams, names: TeamNames): AppointmentView {
  return {
    q: param(sp, "q"),
    modalidade: enumOrNull(sp, "modalidade", APPOINTMENT_MODALITIES),
    situacao: enumOrNull(sp, "situacao", APPOINTMENT_STATUSES),
    responsavel: assigneeParam(sp, names),
    de: dateParam(sp, "de"),
    ate: dateParam(sp, "ate"),
    ordem: pickEnum(sp, "ordem", APPOINTMENT_SORTS, "data"),
  };
}

export function isAppointmentViewFiltered(v: AppointmentView): boolean {
  return Boolean(v.q || v.modalidade || v.situacao || v.responsavel || v.de || v.ate || v.ordem !== "data");
}

export function filterAppointments(items: readonly Appointment[], v: AppointmentView): Appointment[] {
  return items.filter((a) => {
    if (v.modalidade && a.modality !== v.modalidade) return false;
    if (v.situacao && a.status !== v.situacao) return false;
    if (!matchesAssignee(a.assigned_to, v.responsavel)) return false;
    if (!inPeriod(a.date.slice(0, 10), v.de, v.ate)) return false;
    return matchesText(v.q, [a.title, a.notes]);
  });
}

/** Dia e hora juntos, para desempatar compromissos no mesmo dia. */
function when(a: Appointment): string {
  return `${a.date.slice(0, 10)}T${a.start_time ?? ""}`;
}

export function sortAppointments(items: readonly Appointment[], ordem: AppointmentSort): Appointment[] {
  switch (ordem) {
    case "data_desc":
      return sortedBy(items, (a, b) => compareDate(when(a), when(b), "desc"));
    case "recentes":
      return sortedBy(items, (a, b) => compareDate(a.created_at, b.created_at, "desc") || compareText(a.title, b.title));
    default:
      return sortedBy(items, (a, b) => compareDate(when(a), when(b)));
  }
}
