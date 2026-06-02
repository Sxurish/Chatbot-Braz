import { Badge } from "@/components/ui/badge";
import {
  COMMERCIAL_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  LEGAL_AREA_LABELS,
  LEGAL_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
} from "@/lib/constants";
import type {
  CommercialStatus,
  ContractStatus,
  FinancialStatus,
  LegalArea,
  LegalStatus,
  PaymentStatus,
  Urgency,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <Badge className={cn("gap-1", URGENCY_COLORS[urgency])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {URGENCY_LABELS[urgency]}
    </Badge>
  );
}

const COMMERCIAL_TONE: Partial<Record<CommercialStatus, string>> = {
  novo_lead: "bg-blue-100 text-blue-700 border-blue-200",
  cliente_ativo: "bg-emerald-100 text-emerald-700 border-emerald-200",
  contrato_assinado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  perdido: "bg-slate-100 text-slate-500 border-slate-200",
  nao_qualificado: "bg-slate-100 text-slate-500 border-slate-200",
};

export function CommercialStatusBadge({ status }: { status: CommercialStatus }) {
  return (
    <Badge
      className={cn(
        COMMERCIAL_TONE[status] ?? "bg-indigo-50 text-indigo-700 border-indigo-200"
      )}
    >
      {COMMERCIAL_STATUS_LABELS[status]}
    </Badge>
  );
}

export function LegalStatusBadge({ status }: { status: LegalStatus }) {
  return (
    <Badge className="border-slate-200 bg-slate-50 text-slate-700">
      {LEGAL_STATUS_LABELS[status]}
    </Badge>
  );
}

export function FinancialStatusBadge({ status }: { status: FinancialStatus }) {
  const danger = status === "em_atraso" || status === "cobranca_necessaria";
  const ok = status === "quitado" || status === "entrada_paga";
  return (
    <Badge
      className={cn(
        danger
          ? "bg-red-100 text-red-700 border-red-200"
          : ok
            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : "bg-slate-50 text-slate-600 border-slate-200"
      )}
    >
      {FINANCIAL_STATUS_LABELS[status]}
    </Badge>
  );
}

export function AreaBadge({ area }: { area: LegalArea }) {
  return (
    <Badge className="border-brand-primary/20 bg-brand-primary/5 text-brand-primary">
      {LEGAL_AREA_LABELS[area]}
    </Badge>
  );
}

const CONTRACT_TONE: Record<ContractStatus, string> = {
  rascunho: "bg-slate-100 text-slate-600 border-slate-200",
  enviado: "bg-indigo-50 text-indigo-700 border-indigo-200",
  assinado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelado: "bg-slate-100 text-slate-500 border-slate-200",
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return <Badge className={CONTRACT_TONE[status]}>{CONTRACT_STATUS_LABELS[status]}</Badge>;
}

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  pendente: "bg-amber-100 text-amber-700 border-amber-200",
  pago: "bg-emerald-100 text-emerald-700 border-emerald-200",
  atrasado: "bg-red-100 text-red-700 border-red-200",
  cancelado: "bg-slate-100 text-slate-500 border-slate-200",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={PAYMENT_TONE[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}
