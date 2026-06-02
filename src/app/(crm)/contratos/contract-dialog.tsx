"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONTRACT_STATUS_LABELS } from "@/lib/constants";
import {
  createContractAction,
  updateContractAction,
  type ActionState,
} from "@/lib/data/fase6-actions";
import type { SelectOption } from "@/lib/data/fase6-options";
import type { Contract, ContractStatus } from "@/lib/types";

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

export function ContractDialog({
  open,
  contract,
  clients,
  cases,
  onClose,
}: {
  open: boolean;
  contract: Contract | null;
  clients: SelectOption[];
  cases: SelectOption[];
  onClose: () => void;
}) {
  const isEdit = Boolean(contract);
  const [state, action] = useFormState(
    isEdit ? updateContractAction : createContractAction,
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
      title={isEdit ? "Editar contrato" : "Novo contrato"}
      className="max-w-lg"
    >
      <form action={action} className="space-y-3">
        {isEdit && contract && (
          <input type="hidden" name="id" value={contract.id} />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Cliente *</FieldLabel>
            <Select
              name="client_id"
              defaultValue={contract?.client_id ?? ""}
              required
            >
              <option value="">Selecione o cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Caso (opcional)</FieldLabel>
            <Select name="case_id" defaultValue={contract?.case_id ?? ""}>
              <option value="">Sem vínculo</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Tipo</FieldLabel>
            <Input
              name="contract_type"
              defaultValue={contract?.contract_type ?? ""}
              placeholder="Honorários, êxito, consultoria..."
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Status *</FieldLabel>
            <Select
              name="status"
              defaultValue={contract?.status ?? "rascunho"}
              required
            >
              {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {CONTRACT_STATUS_LABELS[s]}
                  </option>
                )
              )}
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Valor (R$)</FieldLabel>
            <Input
              name="value"
              type="number"
              step="0.01"
              min="0"
              defaultValue={contract?.value ?? ""}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Data de assinatura</FieldLabel>
            <Input
              type="date"
              name="signed_at"
              defaultValue={toDateInput(contract?.signed_at)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Condições de pagamento</FieldLabel>
          <Textarea
            name="payment_terms"
            rows={2}
            defaultValue={contract?.payment_terms ?? ""}
            placeholder="Ex.: 30% entrada + 4x mensais"
          />
        </div>

        <Feedback state={state} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Submit label={isEdit ? "Salvar" : "Criar contrato"} />
        </div>
      </form>
    </Dialog>
  );
}
