"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  requestCodeAction,
  verifyCodeAction,
  type CodeState,
} from "@/lib/auth/first-access-actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      {children}
    </Button>
  );
}

function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export function AccessCodeForm() {
  const [requestState, requestAction] = useActionState(requestCodeAction, { step: "email" } as CodeState);
  const [verifyState, verifyAction] = useActionState(verifyCodeAction, { step: "code" } as CodeState);
  const [editing, setEditing] = useState(false);

  const onCodeStep = requestState.step === "code" && !editing;
  const email = requestState.email ?? "";

  if (!onCodeStep) {
    return (
      <form
        action={(fd) => {
          setEditing(false);
          requestAction(fd);
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm leading-6 font-medium text-slate-700">
            E-mail
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="seu@escritoriobraz.adv.br"
            defaultValue={email}
            required
            autoFocus
          />
        </div>
        <ErrorBox message={requestState.error} />
        <Submit>Enviar código</Submit>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{requestState.message}</span>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="code" className="block text-sm leading-6 font-medium text-slate-700">
          Código de 6 dígitos
        </label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000000"
          className="text-center font-mono text-2xl tracking-[0.5em]"
          required
          autoFocus
        />
        <p className="text-xs text-slate-500">
          Enviado para <strong className="text-slate-700">{email}</strong>. O código vale por alguns minutos.
        </p>
      </div>
      <ErrorBox message={verifyState.error} />
      <Submit>Confirmar código</Submit>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full text-center text-xs text-slate-500 hover:text-brand-primary"
      >
        Usar outro e-mail ou pedir um novo código
      </button>
    </form>
  );
}
