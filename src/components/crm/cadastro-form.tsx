"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info, Loader2, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CadastroState } from "@/lib/data/cadastros-actions";

/**
 * Peças comuns dos formulários de cadastro manual (lead, cliente, caso).
 *
 * O envio é feito à mão (onSubmit + startTransition) para o formulário NÃO
 * ser limpo depois da resposta: se der erro ou aparecer um duplicado, o que
 * a pessoa digitou continua lá.
 */

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm leading-6 font-medium text-slate-700">
      {children}
    </label>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const initial: CadastroState = {};

/** useActionState + envio sem limpar o formulário + fecha após sucesso. */
export function useCadastroForm(
  action: (prev: CadastroState, formData: FormData) => Promise<CadastroState>,
  onSuccess: (state: CadastroState) => void
) {
  const [state, dispatch, pending] = useActionState(action, initial);
  // Cada resposta de sucesso é tratada uma vez só (mesmo se a tela redesenhar).
  const handled = useRef<CadastroState | null>(null);

  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      onSuccess(state);
    }
  }, [state, onSuccess]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  }

  return { state, pending, onSubmit };
}

export function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} {label}
    </Button>
  );
}

export function Feedback({ state, successText }: { state: CadastroState; successText: string }) {
  if (state.error)
    return (
      <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-amber-600">
        <Info className="h-4 w-4 shrink-0" /> {successText} {state.message}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {successText}
      </p>
    );
  return null;
}

/**
 * Aviso de duplicado: mostra quem já existe, com link para abrir, e o botão
 * "Cadastrar mesmo assim" (envia allow_duplicate=1).
 */
export function DuplicateNotice({
  state,
  pending,
  leadHint,
}: {
  state: CadastroState;
  pending: boolean;
  /** Texto extra quando o contato é de um lead (ex.: converter em cliente). */
  leadHint?: string;
}) {
  const dup = state.duplicate;
  if (!dup) return null;
  const what = dup.kind === "lead" ? "um lead" : "um cliente";
  const href = dup.kind === "lead" ? `/leads/${dup.id}` : "/clientes";
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
      <p className="flex items-start gap-1.5">
        <UserSearch className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Já existe {what} com o mesmo {dup.reason}: <strong>{dup.name}</strong>.
          {dup.kind === "lead" && leadHint ? ` ${leadHint}` : ""}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={href}
          className="inline-flex h-9 items-center rounded-md border border-amber-300 bg-white px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          {dup.kind === "lead" ? "Abrir o lead existente" : "Ver clientes"}
        </Link>
        <Button type="submit" name="allow_duplicate" value="1" variant="ghost" size="sm" disabled={pending}>
          Cadastrar mesmo assim
        </Button>
      </div>
    </div>
  );
}
