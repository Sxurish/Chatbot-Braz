"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Loader2, AlertCircle, Info, CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateAiAction, type ActionState } from "@/lib/data/settings-actions";
import type { Settings } from "@/lib/data/settings";

const initial: ActionState = {};

const PROVIDERS = [
  { value: "mock", label: "Mock (heurístico — sem chave)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "google", label: "Google Gemini" },
] as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-slate-700">{children}</label>;
}

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

export function AiForm({
  settings,
  apiKeyConfigured,
  readOnly,
}: {
  settings: Settings;
  apiKeyConfigured: boolean;
  readOnly: boolean;
}) {
  const [state, action] = useFormState(updateAiAction, initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chatbot e IA</CardTitle>
        <CardDescription>
          Provedor, modelo e comportamento do atendimento automatizado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <fieldset disabled={readOnly} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Provedor de IA *</FieldLabel>
                <Select name="ai_provider" defaultValue={settings.ai_provider}>
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Modelo</FieldLabel>
                <Input
                  name="ai_model"
                  defaultValue={settings.ai_model ?? ""}
                  placeholder="gpt-4o-mini, claude-sonnet-4-6, gemini-2.5-flash..."
                />
              </div>
            </div>

            {!apiKeyConfigured && settings.ai_provider !== "mock" && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Chave de API ausente</p>
                  <p className="text-amber-700">
                    A variável de ambiente do provedor selecionado não está
                    configurada. O chatbot vai cair no fallback heurístico até a
                    chave ser adicionada no servidor (Vercel ou .env).
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <FieldLabel>Mensagem de saudação *</FieldLabel>
              <Textarea
                name="greeting"
                rows={2}
                defaultValue={settings.ai.greeting}
                required
              />
              <p className="text-xs text-slate-500">
                Primeira mensagem exibida ao usuário no chatbot.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Áreas jurídicas atendidas</FieldLabel>
                <Textarea
                  name="legal_areas"
                  rows={4}
                  defaultValue={(settings.ai.legal_areas ?? []).join("\n")}
                  placeholder="Uma por linha (ou separadas por vírgula)"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Palavras-chave de urgência (handoff)</FieldLabel>
                <Textarea
                  name="urgency_keywords"
                  rows={4}
                  defaultValue={(settings.ai.urgency_keywords ?? []).join("\n")}
                  placeholder="audiência hoje, preso, ameaça..."
                />
              </div>
            </div>
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
