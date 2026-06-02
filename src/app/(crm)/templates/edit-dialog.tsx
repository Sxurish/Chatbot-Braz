"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import {
  updateTemplateAction,
  type ActionState,
} from "@/lib/data/templates-actions";
import {
  TEMPLATE_CATEGORY_LABELS,
  type DocumentTemplate,
} from "@/lib/data/templates-types";

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

export function EditTemplateDialog({
  open,
  template,
  onClose,
}: {
  open: boolean;
  template: DocumentTemplate | null;
  onClose: () => void;
}) {
  const [state, action] = useFormState(updateTemplateAction, initial);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => onClose(), 600);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose]);

  if (!template) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Editar template"
      className="max-w-lg"
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={template.id} />

        <div className="space-y-1.5">
          <FieldLabel>Nome *</FieldLabel>
          <Input name="name" required defaultValue={template.name} />
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Descrição</FieldLabel>
          <Textarea
            name="description"
            rows={2}
            defaultValue={template.description ?? ""}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Categoria *</FieldLabel>
          <Select name="category" defaultValue={template.category} required>
            {Object.entries(TEMPLATE_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={template.active}
            className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
          />
          Template ativo (disponível para geração)
        </label>

        {template.placeholders.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
            <p className="mb-1 font-medium text-slate-700">
              Placeholders detectados ({template.placeholders.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {template.placeholders.map((p) => (
                <code
                  key={p}
                  className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700"
                >
                  {`{{${p}}}`}
                </code>
              ))}
            </div>
          </div>
        )}

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
