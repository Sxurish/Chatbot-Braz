"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, Info, Loader2, Sparkles, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/assistant/markdown";
import type { useAssistant } from "@/components/assistant/use-assistant";

type AssistantApi = ReturnType<typeof useAssistant>;

const BASE_SUGGESTIONS = [
  "Quais leads urgentes chegaram esta semana?",
  "O que vence nos próximos 7 dias?",
  "Quais são as minhas tarefas atrasadas?",
  "Como está a agenda de amanhã?",
];

function suggestionsFor(pagePath: string | null, isAdmin: boolean): string[] {
  const list = [...BASE_SUGGESTIONS];
  if (pagePath && /^\/leads\/[^/]+$/.test(pagePath)) list.unshift("Resuma este lead");
  if (isAdmin) list.push("Quanto temos a receber este mês?");
  return list.slice(0, 5);
}

export function AssistantChat({
  api,
  pagePath,
  variant,
}: {
  api: AssistantApi;
  pagePath: string | null;
  variant: "panel" | "page";
}) {
  const { turns, busy, toolLabel, status, statusError, budgetNotice, send, stop } = api;
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, toolLabel]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const notConfigured = status && !status.configured;
  const disabled = Boolean(statusError || notConfigured || status?.enabled === false || status?.budget.level === "blocked");

  const submit = () => {
    if (!draft.trim() || busy || disabled) return;
    void send(draft);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className={cn("flex-1 overflow-y-auto", variant === "page" ? "px-4 py-6 sm:px-8" : "px-4 py-4")}>
        {turns.length === 0 ? (
          <div className={cn("mx-auto flex max-w-xl flex-col", variant === "page" ? "pt-10" : "pt-4")}>
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/15">
              <Sparkles className="h-5 w-5 text-brand-gold" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">Como posso ajudar?</h3>
            <p className="mt-1 text-sm text-slate-500">
              Pergunte sobre leads, clientes, casos, processos, prazos, tarefas e agenda. Eu consulto o CRM
              e respondo com o link do registro.
            </p>
            {!disabled && (
              <div className="mt-5 flex flex-col gap-2">
                {suggestionsFor(pagePath, Boolean(status?.isAdmin)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    disabled={busy}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {turns.map((t) =>
              t.role === "user" ? (
                <div key={t.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-primary px-4 py-2 text-sm text-white">
                  {t.content}
                </div>
              ) : (
                <div key={t.id} className="flex max-w-[95%] gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-navy">
                    <Sparkles className="h-3.5 w-3.5 text-brand-gold" />
                  </div>
                  <div
                    className={cn(
                      "min-w-0 flex-1 rounded-2xl rounded-tl-sm border px-4 py-2.5",
                      t.error ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
                    )}
                  >
                    {t.content ? (
                      <Markdown text={t.content} />
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {toolLabel ? `${toolLabel}…` : "Pensando…"}
                      </p>
                    )}
                    {t.pending && t.content && toolLabel && (
                      <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {toolLabel}…
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div className={cn("border-t bg-white", variant === "page" ? "px-4 pb-4 pt-3 sm:px-8" : "px-3 pb-3 pt-2")}>
        <div className="mx-auto max-w-3xl">
          {(statusError || notConfigured || status?.enabled === false) && (
            <p className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {statusError ??
                (notConfigured
                  ? "O assistente ainda não foi ligado: falta configurar a chave da IA (ANTHROPIC_API_KEY) na Vercel."
                  : "O assistente está desligado em Configurações.")}
            </p>
          )}
          {!statusError && budgetNotice && (
            <p
              className={cn(
                "mb-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                status?.budget.level === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-red-200 bg-red-50 text-red-800"
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {budgetNotice}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-brand-primary/50 focus-within:ring-2 focus-within:ring-brand-primary/10"
          >
            <label htmlFor={`assistente-${variant}`} className="sr-only">
              Pergunta para o assistente
            </label>
            <textarea
              id={`assistente-${variant}`}
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={4000}
              disabled={disabled}
              placeholder={disabled ? "Assistente indisponível" : "Pergunte sobre leads, processos, prazos…"}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Parar resposta"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white hover:bg-slate-700"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Enviar pergunta"
                disabled={!draft.trim() || disabled}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </form>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Info className="h-3 w-3 shrink-0" />
            O assistente só consulta o CRM. Confira prazos na intimação e no sistema do tribunal.
          </p>
        </div>
      </div>
    </div>
  );
}
