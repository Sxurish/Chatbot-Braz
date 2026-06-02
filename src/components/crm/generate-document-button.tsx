"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Loader2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  generateDocumentAction,
  type ActionState,
} from "@/lib/data/templates-actions";
import {
  isAutoFilled,
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
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Gerar documento
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
  if (state.ok && state.url)
    return (
      <a
        href={state.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
      >
        <CheckCircle2 className="h-4 w-4" />
        Documento gerado — clique para baixar
        <Download className="h-3.5 w-3.5" />
      </a>
    );
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4" /> Documento gerado.
      </p>
    );
  return null;
}

export function GenerateDocumentButton({
  leadId,
  templates,
}: {
  leadId: string;
  templates: DocumentTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [state, action] = useFormState(generateDocumentAction, initial);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  // Quando abrir, seleciona o primeiro template ativo por padrão.
  useEffect(() => {
    if (open && !selectedId && templates.length > 0) {
      setSelectedId(templates[0].id);
    }
  }, [open, selectedId, templates]);

  // Placeholders que o usuário precisa preencher manualmente.
  const manualPlaceholders = useMemo(
    () =>
      (selected?.placeholders ?? []).filter((p) => !isAutoFilled(p)).sort(),
    [selected]
  );

  if (templates.length === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4" /> Gerar documento
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Gerar documento"
        description="Escolha um template e preencha os campos que não puderam ser resolvidos automaticamente."
        className="max-w-lg"
      >
        <form action={action} className="space-y-3">
          <input type="hidden" name="lead_id" value={leadId} />

          <div className="space-y-1.5">
            <FieldLabel>Template *</FieldLabel>
            <Select
              name="template_id"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              required
            >
              <option value="">Selecione um template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>

          {selected && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {selected.placeholders.length} placeholder
              {selected.placeholders.length === 1 ? "" : "s"} no template ·{" "}
              {selected.placeholders.length - manualPlaceholders.length}{" "}
              automático
              {selected.placeholders.length - manualPlaceholders.length === 1
                ? ""
                : "s"}
              {manualPlaceholders.length > 0 && (
                <> · {manualPlaceholders.length} manual{manualPlaceholders.length === 1 ? "" : "is"}</>
              )}
            </div>
          )}

          {manualPlaceholders.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Campos manuais
              </p>
              {manualPlaceholders.map((p) => (
                <div key={p} className="space-y-1">
                  <FieldLabel>
                    <code className="font-mono text-xs">{p}</code>
                  </FieldLabel>
                  <Input name={`override_${p}`} />
                </div>
              ))}
            </div>
          )}

          <Feedback state={state} />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Fechar
            </Button>
            <Submit />
          </div>
        </form>
      </Dialog>
    </>
  );
}
