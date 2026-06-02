"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LEGAL_STATUS_LABELS } from "@/lib/constants";
import {
  createProcessAction,
  updateProcessAction,
  type ActionState,
} from "@/lib/data/fase6-actions";
import type { SelectOption } from "@/lib/data/fase6-options";
import type { LegalStatus, Process } from "@/lib/types";

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

export function ProcessDialog({
  open,
  process,
  cases,
  onClose,
}: {
  open: boolean;
  process: Process | null;
  cases: SelectOption[];
  onClose: () => void;
}) {
  const isEdit = Boolean(process);
  const [state, action] = useFormState(
    isEdit ? updateProcessAction : createProcessAction,
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
      title={isEdit ? "Editar processo" : "Novo processo"}
      className="max-w-lg"
    >
      <form action={action} className="space-y-3">
        {isEdit && process && (
          <input type="hidden" name="id" value={process.id} />
        )}

        <div className="space-y-1.5">
          <FieldLabel>Caso vinculado *</FieldLabel>
          <Select
            name="case_id"
            defaultValue={process?.case_id ?? ""}
            required
          >
            <option value="">Selecione um caso</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Número do processo</FieldLabel>
          <Input
            name="process_number"
            defaultValue={process?.process_number ?? ""}
            placeholder="0000000-00.0000.0.00.0000"
            className="font-mono"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Vara / órgão</FieldLabel>
            <Input name="court" defaultValue={process?.court ?? ""} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Comarca / jurisdição</FieldLabel>
            <Input
              name="jurisdiction"
              defaultValue={process?.jurisdiction ?? ""}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Classe</FieldLabel>
            <Input name="class" defaultValue={process?.class ?? ""} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Assunto</FieldLabel>
            <Input name="subject" defaultValue={process?.subject ?? ""} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Status *</FieldLabel>
            <Select
              name="status"
              defaultValue={process?.status ?? "em_andamento"}
              required
            >
              {(Object.keys(LEGAL_STATUS_LABELS) as LegalStatus[]).map((s) => (
                <option key={s} value={s}>
                  {LEGAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Próximo prazo</FieldLabel>
            <Input
              type="date"
              name="next_deadline"
              defaultValue={toDateInput(process?.next_deadline)}
            />
          </div>
        </div>

        <Feedback state={state} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Submit label={isEdit ? "Salvar" : "Criar processo"} />
        </div>
      </form>
    </Dialog>
  );
}

