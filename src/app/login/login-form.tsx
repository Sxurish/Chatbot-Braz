"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { signInAction, type AuthState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogIn className="h-4 w-4" />
      )}
      Entrar
    </Button>
  );
}

export function LoginForm({
  redirectTo,
  demoMode,
}: {
  redirectTo: string;
  demoMode: boolean;
}) {
  const [state, formAction] = useFormState(signInAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          E-mail
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="seu@escritoriobraz.adv.br"
          required
          defaultValue={demoMode ? "jean@escritoriobraz.adv.br" : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Senha
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          defaultValue={demoMode ? "demo123" : undefined}
        />
      </div>

      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
