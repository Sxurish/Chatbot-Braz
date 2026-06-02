"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { createDsrAction, type ActionState } from "@/lib/data/lgpd-actions";
import {
  REQUEST_TYPE_LABELS,
  type DsrRequestType,
} from "@/lib/data/lgpd-types";

const initial: ActionState = {};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-slate-700">{children}</label>;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} Criar solicitação
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
  return null;
}

export function DsrCreateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useFormState(createDsrAction, initial);

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
      title="Nova solicitação LGPD"
      description="Registre uma solicitação recebida por e-mail, telefone ou outro canal externo."
      className="max-w-lg"
    >
      <form action={action} className="space-y-3">
        <div className="space-y-1.5">
          <FieldLabel>Nome do titular *</FieldLabel>
          <Input name="requester_name" required maxLength={200} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>E-mail</FieldLabel>
            <Input type="email" name="requester_email" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Telefone</FieldLabel>
            <Input name="requester_phone" />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Tipo de solicitação *</FieldLabel>
          <Select name="request_type" defaultValue="exclusao" required>
            {(Object.keys(REQUEST_TYPE_LABELS) as DsrRequestType[]).map((k) => (
              <option key={k} value={k}>
                {REQUEST_TYPE_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Descrição</FieldLabel>
          <Textarea
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="Detalhes da solicitação, dados afetados, prazo, etc."
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Lead vinculado (UUID, opcional)</FieldLabel>
          <Input
            name="lead_id"
            placeholder="Cole o ID do lead, se houver"
            className="font-mono text-xs"
          />
        </div>

        <Feedback state={state} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Submit />
        </div>
      </form>
    </Dialog>
  );
}
