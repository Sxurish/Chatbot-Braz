"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Info, KeyRound, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateAssistantAction, type ActionState } from "@/lib/data/settings-actions";
import type { Settings } from "@/lib/data/settings";
import { cn } from "@/lib/utils";

const initial: ActionState = {};

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar alterações
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
        <CheckCircle2 className="h-4 w-4" /> Alterações salvas.
      </p>
    );
  return null;
}

export function AssistantForm({
  settings,
  apiKeyConfigured,
  monthSpendUsd,
  monthSpendByModel = null,
  setupMissing,
  readOnly,
}: {
  settings: Settings;
  apiKeyConfigured: boolean;
  /** Gasto do mês (só enviado para Admin). */
  monthSpendUsd: number | null;
  /** Gasto do mês por modelo; null quando o SQL ainda não foi rodado. */
  monthSpendByModel?: { haiku: number; sonnet: number } | null;
  setupMissing: boolean;
  readOnly: boolean;
}) {
  const [state, action] = useActionState(updateAssistantAction, initial);
  const limit = settings.assistant.monthly_limit_usd;
  const pct = monthSpendUsd !== null && limit > 0 ? Math.min(100, (monthSpendUsd / limit) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-gold" /> Assistente virtual da equipe
        </CardTitle>
        <CardDescription>
          Consultas rápidas ao CRM com Claude Haiku. Avisa em 80% do limite; em 100% pausa a leitura de documentos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {!apiKeyConfigured && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Falta a variável <code className="font-mono">ANTHROPIC_API_KEY</code> na Vercel. Sem ela o botão do
                assistente aparece, mas não responde.
              </p>
            </div>
          )}
          {setupMissing && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                O banco ainda não tem as tabelas do assistente. Rode{" "}
                <code className="font-mono">supabase/assistente-fase1.sql</code> no SQL Editor do Supabase.
              </p>
            </div>
          )}

          {monthSpendUsd !== null && (
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-700">Gasto deste mês</span>
                <span className="text-slate-600">
                  US$ {monthSpendUsd.toFixed(2)} de US$ {limit.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full",
                    pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-primary"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {monthSpendByModel && (
                <p className="mt-1.5 text-xs text-slate-500">
                  Haiku (consultas): US$ {monthSpendByModel.haiku.toFixed(2)} · Sonnet (documentos e
                  análises detalhadas): US$ {monthSpendByModel.sonnet.toFixed(2)}
                </p>
              )}
            </div>
          )}

          <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="monthly_limit_usd" className="block text-sm leading-6 font-medium text-slate-700">
                Limite mensal (US$)
              </label>
              <Input
                id="monthly_limit_usd"
                name="monthly_limit_usd"
                type="number"
                min={1}
                max={1000}
                step="1"
                defaultValue={limit}
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={settings.assistant.enabled}
                className="h-4 w-4 rounded border-slate-300 accent-brand-primary"
              />
              Assistente ligado para a equipe
            </label>
          </fieldset>

          <div className="flex items-center justify-between pt-2">
            <Feedback state={state} />
            <Submit disabled={readOnly} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
