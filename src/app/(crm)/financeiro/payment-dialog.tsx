"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PAYMENT_STATUS_LABELS } from "@/lib/constants";
import {
  createPaymentAction,
  updatePaymentAction,
  type ActionState,
} from "@/lib/data/fase6-actions";
import type { SelectOption } from "@/lib/data/fase6-options";
import type { Payment, PaymentStatus } from "@/lib/types";

const initial: ActionState = {};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-slate-700">{children}</label>;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} {label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p className="flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle className="h-4 w-4" /> {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className="flex items-center gap-1.5 text-sm text-amber-600">
        <Info className="h-4 w-4" /> {state.message}
      </p>
    );
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4" /> Salvo.
      </p>
    );
  return null;
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function PaymentDialog({
  open,
  payment,
  contracts,
  clients,
  onClose,
}: {
  open: boolean;
  payment: Payment | null;
  contracts: SelectOption[];
  clients: SelectOption[];
  onClose: () => void;
}) {
  const isEdit = Boolean(payment);
  const [state, action] = useFormState(
    isEdit ? updatePaymentAction : createPaymentAction,
    initial
  );

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => onClose(), 600);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar pagamento" : "Novo pagamento"}
      className="max-w-lg"
    >
      <form action={action} className="space-y-3">
        {isEdit && payment && (
          <input type="hidden" name="id" value={payment.id} />
        )}

        <div className="space-y-1.5">
          <FieldLabel>Descrição</FieldLabel>
          <Input
            name="description"
            defaultValue={payment?.description ?? ""}
            placeholder="Honorários iniciais, parcela 1/4..."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Valor (R$) *</FieldLabel>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={payment?.amount ?? ""}
              required
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Status *</FieldLabel>
            <Select
              name="status"
              defaultValue={payment?.status ?? "pendente"}
              required
            >
              {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {PAYMENT_STATUS_LABELS[s]}
                  </option>
                )
              )}
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Vencimento</FieldLabel>
            <Input
              type="date"
              name="due_date"
              defaultValue={toDateInput(payment?.due_date)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Data do pagamento</FieldLabel>
            <Input
              type="date"
              name="paid_at"
              defaultValue={toDateInput(payment?.paid_at)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Contrato</FieldLabel>
            <Select name="contract_id" defaultValue={payment?.contract_id ?? ""}>
              <option value="">Sem vínculo</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cliente</FieldLabel>
            <Select name="client_id" defaultValue={payment?.client_id ?? ""}>
              <option value="">Sem vínculo</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Feedback state={state} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Submit label={isEdit ? "Salvar" : "Criar pagamento"} />
        </div>
      </form>
    </Dialog>
  );
}
