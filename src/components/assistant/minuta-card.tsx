"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  FileSignature,
  Loader2,
  Maximize2,
  Minimize2,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MINUTA_TIPO_LABELS,
  MINUTA_WARNING,
  type MinutaView,
} from "@/lib/minutas/types";

/**
 * Cartão "Minuta": o texto que a IA redigiu, num editor. A pessoa revisa,
 * edita, baixa em .docx ou salva em Documentos (revisão pendente). Nada é
 * protocolado nem enviado daqui.
 */
export function MinutaCard({
  minuta,
  onChange,
}: {
  minuta: MinutaView;
  onChange: (change: Partial<MinutaView>) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(minuta.title);
  const [body, setBody] = useState(minuta.body);
  const [saved, setSaved] = useState({ title: minuta.title, body: minuta.body });
  const [busy, setBusy] = useState<"docx" | "salvar" | "editar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; link?: string } | null>(null);
  const [full, setFull] = useState(false);

  const isSaved = minuta.status === "salva";
  const dirty = title !== saved.title || body !== saved.body;
  const url = `/api/assistente/minutas/${encodeURIComponent(minuta.id)}`;

  // Tela cheia: Esc fecha e a página de trás não rola.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  async function post(path: string, method = "POST") {
    return fetch(`${url}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
  }

  /** Guarda a edição quando a pessoa sai do campo. */
  async function persistEdit() {
    if (!dirty || busy) return;
    setBusy("editar");
    try {
      const res = await post("", "PATCH");
      if (res.ok) {
        setSaved({ title, body });
        onChange({ title, body });
      }
    } catch {
      // segue: a edição vai junto no .docx e no salvar
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy("docx");
    setError(null);
    try {
      const res = await post("/docx");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não consegui gerar o .docx. Tente de novo.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "minuta.docx";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setSaved({ title, body });
      onChange({ title, body });
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  async function saveToDocuments() {
    setBusy("salvar");
    setError(null);
    try {
      const res = await post("/documentos");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não consegui salvar em Documentos. Tente de novo.");
        if (res.status === 409) onChange({ status: "salva" });
        return;
      }
      setNotice({ text: data.message ?? "Minuta salva em Documentos.", link: data.link });
      setSaved({ title, body });
      onChange({ status: "salva", title, body, documentId: data.documentId ?? null });
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {full && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40"
          aria-hidden
          onClick={() => setFull(false)}
        />
      )}
      <section
        aria-label={`Minuta: ${title}`}
        className={cn(
          "@container overflow-hidden rounded-xl border bg-white",
          isSaved ? "border-emerald-200" : "border-brand-gold/60",
          full
            ? "fixed inset-2 z-50 flex flex-col shadow-2xl sm:inset-6"
            : "mt-3",
        )}
      >
        <header className="flex items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileSignature className="h-4 w-4 shrink-0 text-brand-primary" />
            <p className="truncate text-sm font-semibold text-slate-900">
              Minuta · {MINUTA_TIPO_LABELS[minuta.tipo]}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                isSaved
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800",
              )}
            >
              {isSaved ? "Salva em Documentos" : "Para revisar"}
            </span>
            <button
              type="button"
              onClick={() => setFull((v) => !v)}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              aria-label={full ? "Sair da tela cheia" : "Abrir em tela cheia"}
              title={full ? "Sair da tela cheia" : "Abrir em tela cheia"}
            >
              {full ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        <div
          className={cn(
            "space-y-3 px-3 py-3",
            full && "flex min-h-0 flex-1 flex-col",
          )}
        >
          <p className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {MINUTA_WARNING}. A IA pode errar: confira fatos, datas, nomes,
            fundamentos e todos os campos [PREENCHER] e [CONFERIR].
          </p>
          {minuta.refLabel && (
            <p className="text-xs text-slate-500">
              Ligada a: <span className="font-medium">{minuta.refLabel}</span>
            </p>
          )}

          <div>
            <label
              htmlFor={`${id}-titulo`}
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Título
            </label>
            <Input
              id={`${id}-titulo`}
              value={title}
              maxLength={200}
              disabled={Boolean(busy && busy !== "editar")}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={persistEdit}
            />
          </div>

          <div className={cn(full && "flex min-h-0 flex-1 flex-col")}>
            <label
              htmlFor={`${id}-texto`}
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Texto da minuta
            </label>
            <Textarea
              id={`${id}-texto`}
              value={body}
              rows={full ? undefined : 16}
              disabled={Boolean(busy && busy !== "editar")}
              onChange={(e) => setBody(e.target.value)}
              onBlur={persistEdit}
              className={cn(
                "font-serif leading-relaxed",
                full && "min-h-0 flex-1 resize-none",
              )}
            />
          </div>

          {minuta.checks.length > 0 && !full && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">Pontos a conferir:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {minuta.checks.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
          {notice && (
            <p className="flex items-center gap-1.5 text-xs text-slate-600">
              <Check className="h-3.5 w-3.5 text-emerald-600" /> {notice.text}
              {notice.link && (
                <Link
                  href={notice.link}
                  className="inline-flex items-center gap-1 font-medium text-brand-primary hover:underline"
                >
                  Abrir <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2">
          {busy === "editar" && (
            <span className="mr-auto flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Guardando a edição
            </span>
          )}
          <button
            type="button"
            onClick={download}
            disabled={Boolean(busy && busy !== "editar")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {busy === "docx" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Baixar .docx
          </button>
          {!isSaved && (
            <button
              type="button"
              onClick={saveToDocuments}
              disabled={Boolean(busy && busy !== "editar")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {busy === "salvar" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar em Documentos
            </button>
          )}
        </footer>
      </section>
    </>
  );
}
