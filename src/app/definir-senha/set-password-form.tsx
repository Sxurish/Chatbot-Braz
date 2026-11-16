"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setPasswordAction, type PasswordState } from "@/lib/auth/first-access-actions";
import { cn } from "@/lib/utils";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
      Salvar senha e entrar
    </Button>
  );
}

const RULES = [
  { label: "8 caracteres ou mais", test: (v: string) => v.length >= 8 },
  { label: "Pelo menos uma letra", test: (v: string) => /[A-Za-zÀ-ÿ]/.test(v) },
  { label: "Pelo menos um número", test: (v: string) => /\d/.test(v) },
];

export function SetPasswordForm() {
  const [state, action] = useActionState(setPasswordAction, {} as PasswordState);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm leading-6 font-medium text-slate-700">
          Nova senha
        </label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-10"
            required
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
            aria-label={show ? "Esconder senha" : "Mostrar senha"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <ul className="space-y-0.5 pt-1">
          {RULES.map((r) => {
            const ok = r.test(password);
            return (
              <li key={r.label} className={cn("flex items-center gap-1.5 text-xs", ok ? "text-emerald-600" : "text-slate-400")}>
                <Check className="h-3 w-3" />
                {r.label}
              </li>
            );
          })}
        </ul>
        {state.fieldErrors?.password && <p className="text-xs text-red-600">{state.fieldErrors.password}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-sm leading-6 font-medium text-slate-700">
          Repita a senha
        </label>
        <Input
          id="confirm"
          name="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
        />
        {state.fieldErrors?.confirm && <p className="text-xs text-red-600">{state.fieldErrors.confirm}</p>}
      </div>

      {state.error && (
        <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <Submit />
    </form>
  );
}
