"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteOperationAction,
  setStatusAction,
  type EditState,
} from "@/lib/data/edicao-actions";
import type { QuickKind } from "@/lib/data/edicao-rules";

/**
 * Botões pequenos das listas: troca rápida de status ("Concluir",
 * "Reabrir", "Inativar") e remover com confirmação em dois cliques.
 */

const initial: EditState = {};

function Hidden({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

function InlineError({ state }: { state: EditState }) {
  if (state.error) return <span role="alert" className="text-xs text-red-600">{state.error}</span>;
  if (state.message) return <span role="status" className="text-xs text-amber-600">{state.message}</span>;
  return null;
}

function StatusSubmit({ label, icon, tone }: { label: string; icon?: React.ReactNode; tone: "primary" | "muted" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium disabled:opacity-50",
        tone === "primary"
          ? "text-emerald-700 hover:bg-emerald-50"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      )}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

/** Um clique muda o status (fica registrado na Auditoria). */
export function StatusButton({
  kind,
  id,
  status,
  label,
  icon,
  tone = "muted",
}: {
  kind: QuickKind;
  id: string;
  status: string;
  label: string;
  icon?: React.ReactNode;
  tone?: "primary" | "muted";
}) {
  const [state, action] = useActionState(setStatusAction, initial);
  return (
    <form action={action} className="inline-flex items-center gap-1">
      <Hidden fields={{ kind, id, status }} />
      <StatusSubmit label={label} icon={icon} tone={tone} />
      <InlineError state={state} />
    </form>
  );
}

function ConfirmSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirmar"}
    </button>
  );
}

/**
 * Lixeira com confirmação. `action` é a ação de remover (padrão: tarefa,
 * follow-up ou compromisso, com `kind` nos campos).
 */
export function ConfirmDeleteButton({
  fields,
  action = deleteOperationAction,
  label,
  question = "Remover?",
}: {
  fields: Record<string, string>;
  action?: (prev: EditState, formData: FormData) => Promise<EditState>;
  /** Texto ao lado da lixeira (ex.: "Remover lead"). Sem texto: só o ícone. */
  label?: string;
  question?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [state, formAction] = useActionState(action, initial);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title="Remover"
        aria-label={label ?? "Remover"}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600",
          label ? "px-2 text-xs font-medium" : "w-8"
        )}
      >
        <Trash2 className="h-4 w-4" />
        {label}
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <Hidden fields={fields} />
      <span className="text-xs text-slate-600">{question}</span>
      <ConfirmSubmit />
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
      >
        Cancelar
      </button>
      <InlineError state={state} />
    </form>
  );
}
