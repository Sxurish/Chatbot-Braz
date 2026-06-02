"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import {
  uploadTemplateAction,
  type ActionState,
} from "@/lib/data/templates-actions";
import { TEMPLATE_CATEGORY_LABELS } from "@/lib/data/templates-types";

const initial: ActionState = {};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-slate-700">{children}</label>;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar template
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
        <CheckCircle2 className="h-4 w-4" /> Template adicionado.
      </p>
    );
  return null;
}

export function UploadTemplateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useFormState(uploadTemplateAction, initial);
  const [fileName, setFileName] = useState<string>("");

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => {
        setFileName("");
        onClose();
      }, 800);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Novo template"
      description="Faça upload de um arquivo .docx com placeholders no formato {{cliente.nome}}."
      className="max-w-lg"
    >
      <form action={action} className="space-y-3">
        <div className="space-y-1.5">
          <FieldLabel>Nome *</FieldLabel>
          <Input
            name="name"
            required
            maxLength={200}
            placeholder="Procuração ad judicia"
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Descrição</FieldLabel>
          <Textarea
            name="description"
            rows={2}
            placeholder="Quando usar este template..."
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Categoria *</FieldLabel>
          <Select name="category" defaultValue="outros" required>
            {Object.entries(TEMPLATE_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Arquivo .docx *</FieldLabel>
          <input
            type="file"
            name="file"
            required
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-primary file:px-3 file:py-1.5 file:text-sm file:text-white"
          />
          {fileName && (
            <p className="text-xs text-slate-500">{fileName}</p>
          )}
          <p className="text-xs text-slate-500">
            Máx. 5 MB. Os placeholders {`{{cliente.nome}}`}, {`{{lead.nome}}`}, etc. serão detectados automaticamente.
          </p>
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
