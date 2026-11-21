"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Paperclip,
  Sparkles,
  Square,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/assistant/markdown";
import { DraftCard } from "@/components/assistant/draft-card";
import { MinutaCard } from "@/components/assistant/minuta-card";
import type { useAssistant } from "@/components/assistant/use-assistant";
import { ACCEPT_ATTRIBUTE, checkAttachment } from "@/lib/assistant/attachment-rules";

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
  const { turns, busy, toolLabel, status, statusError, budgetNotice, send, stop, updateDraft, updateMinuta } = api;
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, toolLabel]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const notConfigured = status && !status.configured;
  const disabled = Boolean(statusError || notConfigured || status?.enabled === false || status?.budget.level === "blocked");

  const canAttach = !disabled && status?.canWrite !== false && status?.documentsAllowed !== false;

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!canAttach) {
      setFileError(
        status?.documentsAllowed === false
          ? "Leitura de documentos pausada: o gasto do mês passou do limite."
          : "Anexos não estão disponíveis para o seu acesso."
      );
      return;
    }
    // Imagens grandes são reduzidas antes de enviar; só o PDF tem limite rígido aqui.
    const problem = checkAttachment({ name: f.name, type: f.type, size: f.type.startsWith("image/") ? 1 : f.size });
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError(null);
    setFile(f);
    inputRef.current?.focus();
  };

  const submit = () => {
    if ((!draft.trim() && !file) || busy || disabled) return;
    void send(draft, file);
    setDraft("");
    setFile(null);
    setFileError(null);
  };

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        if (!canAttach || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        if (!canAttach) return;
        e.preventDefault();
        setDragging(false);
        pickFile(e.dataTransfer.files?.[0]);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-primary/50 bg-white/90 text-sm font-medium text-brand-primary">
          <Upload className="h-6 w-6" />
          Solte o PDF ou o print aqui
        </div>
      )}
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
              {status?.canWrite !== false &&
                " Também preparo cadastros: escreva o que quer cadastrar ou anexe um PDF ou print (pode arrastar para cá) e confira antes de confirmar."}
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
                <div key={t.id} className="ml-auto flex max-w-[85%] flex-col items-end gap-1">
                  {t.attachments?.map((a) => (
                    <span
                      key={a.id + a.name}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                    >
                      {/\.pdf$/i.test(a.name) ? (
                        <FileText className="h-3.5 w-3.5 shrink-0 text-red-600" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
                      )}
                      <span className="truncate">{a.name}</span>
                      {a.id === "enviando" && <Loader2 className="h-3 w-3 animate-spin" />}
                    </span>
                  ))}
                  {t.content && (
                    <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-primary px-4 py-2 text-sm text-white">
                      {t.content}
                    </div>
                  )}
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
                    {t.detailed && (
                      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-400">
                        <Sparkles className="h-3 w-3 text-brand-gold" />
                        Resposta detalhada (Sonnet)
                      </p>
                    )}
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
                    {t.drafts?.map((d) => (
                      <DraftCard
                        key={d.id}
                        draft={d}
                        readOnly={status?.canWrite === false}
                        onChange={(change) => updateDraft(d.id, change)}
                      />
                    ))}
                    {t.minutas?.map((m) => (
                      <MinutaCard key={m.id} minuta={m} onChange={(change) => updateMinuta(m.id, change)} />
                    ))}
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
          {fileError && (
            <p role="alert" className="mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {fileError}
            </p>
          )}
          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {file.type === "application/pdf" ? (
                <FileText className="h-4 w-4 shrink-0 text-red-600" />
              ) : (
                <ImageIcon className="h-4 w-4 shrink-0 text-brand-primary" />
              )}
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="shrink-0 text-slate-400 hover:text-slate-700"
                aria-label="Tirar arquivo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-brand-primary/50 focus-within:ring-2 focus-within:ring-brand-primary/10"
          >
            {status?.canWrite !== false && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  className="hidden"
                  onChange={(e) => {
                    pickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!canAttach || busy}
                  aria-label="Anexar PDF ou print"
                  title="Anexar PDF ou print"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </>
            )}
            <label htmlFor={`assistente-${variant}`} className="sr-only">
              Pergunta para o assistente
            </label>
            <textarea
              id={`assistente-${variant}`}
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
                if (pasted) {
                  e.preventDefault();
                  pickFile(new File([pasted], pasted.name || "print-colado.png", { type: pasted.type }));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={4000}
              disabled={disabled}
              placeholder={
                disabled
                  ? "Assistente indisponível"
                  : file
                    ? "O que fazer com o arquivo? (opcional)"
                    : "Pergunte ou peça um cadastro…"
              }
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
                disabled={(!draft.trim() && !file) || disabled}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </form>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Info className="h-3 w-3 shrink-0" />
            Nada é gravado sem você confirmar. Confira prazos na intimação e no sistema do tribunal.
          </p>
        </div>
      </div>
    </div>
  );
}
