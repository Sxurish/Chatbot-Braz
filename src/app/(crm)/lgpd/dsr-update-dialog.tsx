"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { updateDsrAction, type ActionState } from "@/lib/data/lgpd-actions";
import {
  DSR_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  type DsrRow,
  type DsrStatus,
} from "@/lib/data/lgpd-types";

const initial: ActionState = {};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-slate-700">{children}</label>;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
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

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{value}</span>
    </div>
  );
}

export function DsrUpdateDialog({
  open,
  dsr,
  onClose,
}: {
  open: boolean;
  dsr: DsrRow | null;
  onClose: () => void;
}) {
  const [state, action] = useFormState(updateDsrAction, initial);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => onClose(), 800);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose]);

  if (!dsr) return null;
  const statusMeta = DSR_STATUS_LABELS[dsr.status];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Solicitação LGPD"
      description={REQUEST_TYPE_LABELS[dsr.request_type]}
      className="max-w-lg"
    >
      <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <InfoRow label="Titular" value={dsr.requester_name} />
        {dsr.requester_email && (
          <InfoRow label="E-mail" value={dsr.requester_email} />
        )}
        {dsr.requester_phone && (
          <InfoRow label="Telefone" value={dsr.requester_phone} />
        )}
        <InfoRow
          label="Recebida em"
          value={new Date(dsr.received_at).toLocaleString("pt-BR")}
        />
        <InfoRow
          label="Status atual"
          value={<Badge className={statusMeta.tone}>{statusMeta.label}</Badge>}
        />
        {dsr.description && (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Descrição
            </p>
            <p className="whitespace-pre-line text-sm text-slate-700">
              {dsr.description}
            </p>
          </div>
        )}
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={dsr.id} />

        <div className="space-y-1.5">
          <FieldLabel>Novo status *</FieldLabel>
          <Select name="status" defaultValue={dsr.status} required>
            {(Object.keys(DSR_STATUS_LABELS) as DsrStatus[]).map((s) => (
              <option key={s} value={s}>
                {DSR_STATUS_LABELS[s].label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-slate-500">
            Marcar como "concluída" ou "negada" registra a data de resolução.
          </p>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Notas de resolução</FieldLabel>
          <Textarea
            name="resolution_notes"
            rows={4}
            maxLength={2000}
            defaultValue={dsr.resolution_notes ?? ""}
            placeholder="Detalhes do tratamento dado à solicitação."
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
