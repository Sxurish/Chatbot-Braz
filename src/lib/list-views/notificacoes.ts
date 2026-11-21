/**
 * Busca, filtros e ordem da aba Notificações. Funções puras (testes em
 * tests/list-views-operacao.test.ts).
 */
import { compareDate, matchesText, param, pickEnum, sortedBy, type RawParams } from "@/lib/list-params";
import type { AppNotification, NotificationType } from "@/lib/types";
import { enumOrNull } from "./common";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  novo_lead: "Novo lead",
  lead_urgente: "Lead urgente",
  documento_enviado: "Documento enviado",
  consulta_agendada: "Consulta agendada",
  tarefa_vencendo: "Tarefa vencendo",
  tarefa_atrasada: "Tarefa atrasada",
  lead_aguardando: "Lead aguardando",
  follow_up_pendente: "Follow-up pendente",
  contrato_enviado: "Contrato enviado",
  contrato_assinado: "Contrato assinado",
  pagamento_atraso: "Pagamento em atraso",
  andamento_novo: "Andamento novo",
  automacao_falhou: "Automação falhou",
};
export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[];

export const READ_FILTERS = ["nao_lidas", "lidas"] as const;
export type ReadFilter = (typeof READ_FILTERS)[number];
export const READ_FILTER_LABELS: Record<ReadFilter, string> = {
  nao_lidas: "Não lidas",
  lidas: "Lidas",
};

/** "recentes" é a ordem de sempre. */
export const NOTIFICATION_SORTS = ["recentes", "antigas"] as const;
export type NotificationSort = (typeof NOTIFICATION_SORTS)[number];
export const NOTIFICATION_SORT_LABELS: Record<NotificationSort, string> = {
  recentes: "Mais recentes",
  antigas: "Mais antigas",
};

export interface NotificationView {
  q: string | null;
  leitura: ReadFilter | null;
  tipo: NotificationType | null;
  ordem: NotificationSort;
}

export function parseNotificationView(sp: RawParams): NotificationView {
  return {
    q: param(sp, "q"),
    leitura: enumOrNull(sp, "leitura", READ_FILTERS),
    tipo: enumOrNull(sp, "tipo", NOTIFICATION_TYPES),
    ordem: pickEnum(sp, "ordem", NOTIFICATION_SORTS, "recentes"),
  };
}

export function isNotificationViewFiltered(v: NotificationView): boolean {
  return Boolean(v.q || v.leitura || v.tipo || v.ordem !== "recentes");
}

export function filterNotifications(items: readonly AppNotification[], v: NotificationView): AppNotification[] {
  return items.filter((n) => {
    if (v.leitura === "lidas" && !n.read) return false;
    if (v.leitura === "nao_lidas" && n.read) return false;
    if (v.tipo && n.type !== v.tipo) return false;
    return matchesText(v.q, [n.title, n.body]);
  });
}

export function sortNotifications(items: readonly AppNotification[], ordem: NotificationSort): AppNotification[] {
  return sortedBy(items, (a, b) => compareDate(a.created_at, b.created_at, ordem === "antigas" ? "asc" : "desc"));
}
