"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import {
  createKnowledgeAction,
  updateKnowledgeAction,
  type ActionState,
} from "@/lib/data/knowledge-actions";
import {
  KNOWLEDGE_CATEGORIES,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from "@/lib/data/knowledge-types";

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
  return null;
}

interface KnowledgeDialogProps {
  open: boolean;
  onClose: () => void;
  entry?: KnowledgeEntry | null;
  defaultCategory?: KnowledgeCategory;
}

export function KnowledgeDialog({
  open,
  onClose,
  entry,
  defaultCategory,
}: KnowledgeDialogProps) {
  const isEdit = Boolean(entry);
  const action = isEdit ? updateKnowledgeAction : createKnowledgeAction;
  const [state, formAction] = useFormState(action, initial);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => onClose(), 600);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose]);

  const helpText: Record<KnowledgeCategory, string> = {
    mensagem_padrao: "Texto do modelo de resposta.",
    documento_area:
      "Use o título como nome da área (ex.: Trabalhista) e o conteúdo como lista de documentos, um por linha.",
    glossario: "Conteúdo: explicação simples e objetiva do termo.",
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar entrada" : "Nova entrada"}
      className="max-w-lg"
    >
      <form action={formAction} className="space-y-3">
        {isEdit && entry && <input type="hidden" name="id" value={entry.id} />}

        <div className="space-y-1.5">
          <FieldLabel>Categoria *</FieldLabel>
          <Select
            name="category"
            defaultValue={entry?.category ?? defaultCategory ?? "mensagem_padrao"}
            required
          >
            {(Object.keys(KNOWLEDGE_CATEGORIES) as KnowledgeCategory[]).map((c) => (
              <option key={c} value={c}>
                {KNOWLEDGE_CATEGORIES[c].label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Título *</FieldLabel>
          <Input
            name="title"
            defaultValue={entry?.title ?? ""}
            required
            maxLength={200}
            placeholder="Ex.: Saudação inicial, Trabalhista, Liminar..."
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Conteúdo</FieldLabel>
          <Textarea
            name="content"
            rows={6}
            defaultValue={entry?.content ?? ""}
            maxLength={5000}
            placeholder={
              helpText[
                (entry?.category ?? defaultCategory ?? "mensagem_padrao") as KnowledgeCategory
              ]
            }
          />
          <p className="text-xs text-slate-500">
            Máx. 5000 caracteres. O chatbot consome apenas entradas ativas.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_active"
            value="true"
            defaultChecked={entry?.is_active ?? true}
            className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
          />
          Entrada ativa (visível para o chatbot)
        </label>

        <Feedback state={state} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Submit label={isEdit ? "Salvar alterações" : "Criar entrada"} />
        </div>
      </form>
    </Dialog>
  );
}
