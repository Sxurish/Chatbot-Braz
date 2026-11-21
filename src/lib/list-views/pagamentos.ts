import { PAYMENT_STATUS_LABELS } from "@/lib/constants";
import {
  compareDate,
  compareNumber,
  compareText,
  flag,
  matchesText,
  param,
  pickEnum,
  sortedBy,
  type RawParams,
} from "@/lib/list-params";
import type { Payment, PaymentStatus } from "@/lib/types";
import { dayParam, spDay } from "./dates";

/** Busca, filtros e ordenação dos pagamentos na aba Financeiro (funções puras). */

export const PAYMENT_SORTS = ["vencimento", "vencimento_desc", "valor_desc", "valor_asc", "cliente", "pagos"] as const;
export type PaymentSort = (typeof PAYMENT_SORTS)[number];

/** A primeira é a padrão (igual à ordem de antes: vencimento mais próximo primeiro). */
export const PAYMENT_SORT_LABELS: Record<PaymentSort, string> = {
  vencimento: "Vencimento mais próximo",
  vencimento_desc: "Vencimento mais distante",
  valor_desc: "Maior valor",
  valor_asc: "Menor valor",
  cliente: "Cliente",
  pagos: "Pagos mais recentes",
};

const STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];

export interface PaymentListOptions {
  q: string | null;
  status: PaymentStatus | null;
  cliente: string | null;
  /** Vencimento de/até (AAAA-MM-DD, inclusive). */
  de: string | null;
  ate: string | null;
  /** Só os vencidos e ainda não pagos (atrasados, ou pendentes com vencimento passado). */
  vencidos: boolean;
  ordem: PaymentSort;
}

export function parsePaymentOptions(sp: RawParams): PaymentListOptions {
  const status = pickEnum<PaymentStatus | "">(sp, "status", STATUSES, "");
  return {
    q: param(sp, "q"),
    status: status || null,
    cliente: param(sp, "cliente"),
    de: dayParam(sp, "de"),
    ate: dayParam(sp, "ate"),
    vencidos: flag(sp, "vencidos"),
    ordem: pickEnum(sp, "ordem", PAYMENT_SORTS, "vencimento"),
  };
}

export function hasPaymentFilters(o: PaymentListOptions): boolean {
  return Boolean(o.q || o.status || o.cliente || o.de || o.ate || o.vencidos || o.ordem !== "vencimento");
}

export interface PaymentRow {
  payment: Payment;
  clientName: string | null;
  contractLabel: string | null;
}

export function buildPaymentRows(
  payments: Payment[],
  clientNames: Map<string, string>,
  contractLabels: Map<string, string>
): PaymentRow[] {
  return payments.map((p) => ({
    payment: p,
    clientName: (p.client_id && clientNames.get(p.client_id)) || null,
    contractLabel: (p.contract_id && contractLabels.get(p.contract_id)) || null,
  }));
}

/** Vencido e não pago: atrasado, ou pendente com vencimento antes de hoje (AAAA-MM-DD). */
export function isOverdue(p: Payment, today: string): boolean {
  if (p.status === "atrasado") return true;
  if (p.status !== "pendente") return false;
  const due = spDay(p.due_date);
  return Boolean(due && due < today);
}

export function filterPaymentRows(rows: PaymentRow[], o: PaymentListOptions, today: string): PaymentRow[] {
  return rows.filter((r) => {
    const due = spDay(r.payment.due_date);
    return (
      matchesText(o.q, [r.payment.description, r.clientName, r.contractLabel]) &&
      (!o.status || r.payment.status === o.status) &&
      (!o.cliente || r.payment.client_id === o.cliente) &&
      (!o.de || Boolean(due && due >= o.de)) &&
      (!o.ate || Boolean(due && due <= o.ate)) &&
      (!o.vencidos || isOverdue(r.payment, today))
    );
  });
}

export function sortPaymentRows(rows: PaymentRow[], ordem: PaymentSort): PaymentRow[] {
  const byDue = (a: PaymentRow, b: PaymentRow) => compareDate(a.payment.due_date, b.payment.due_date);
  switch (ordem) {
    case "vencimento_desc":
      return sortedBy(rows, (a, b) => compareDate(a.payment.due_date, b.payment.due_date, "desc"));
    case "valor_desc":
      return sortedBy(rows, (a, b) => compareNumber(a.payment.amount, b.payment.amount, "desc") || byDue(a, b));
    case "valor_asc":
      return sortedBy(rows, (a, b) => compareNumber(a.payment.amount, b.payment.amount, "asc") || byDue(a, b));
    case "cliente":
      return sortedBy(rows, (a, b) => compareText(a.clientName, b.clientName) || byDue(a, b));
    case "pagos":
      return sortedBy(rows, (a, b) => compareDate(a.payment.paid_at, b.payment.paid_at, "desc") || byDue(a, b));
    default:
      return sortedBy(rows, byDue);
  }
}

/** Opções dos seletores, a partir da lista completa. */
export function paymentFilterOptions(rows: PaymentRow[]) {
  const statuses = new Set(rows.map((r) => r.payment.status));
  const clients = new Map<string, string>();
  for (const r of rows) if (r.payment.client_id && r.clientName) clients.set(r.payment.client_id, r.clientName);
  return {
    status: STATUSES.filter((s) => statuses.has(s)).map((s) => ({ value: s, label: PAYMENT_STATUS_LABELS[s] })),
    clientes: [...clients.entries()]
      .sort((a, b) => compareText(a[1], b[1]))
      .map(([value, label]) => ({ value, label })),
  };
}
