"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Maximize2, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { useAssistant } from "@/components/assistant/use-assistant";

/**
 * Botão flutuante do assistente em todas as telas do painel.
 * Abre um painel lateral; Ctrl+K (ou ⌘K) abre e fecha, Esc fecha.
 * Na página /assistente o botão some (lá a conversa já está em tela cheia).
 */
export function AssistantLauncher() {
  const pathname = usePathname();
  const onAssistantPage = pathname === "/assistente";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!onAssistantPage) setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAssistantPage]);

  if (onAssistantPage) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand-navy py-3 pl-3 pr-4 text-sm font-medium text-white shadow-lg shadow-brand-navy/20 transition-transform hover:-translate-y-0.5"
          aria-label="Abrir assistente (Ctrl+K)"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold">
            <Sparkles className="h-4 w-4 text-brand-navy" />
          </span>
          Assistente
          <kbd className="ml-1 hidden rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-normal text-slate-300 sm:inline">
            Ctrl K
          </kbd>
        </button>
      )}
      {open && <AssistantPanel pathname={pathname} onClose={() => setOpen(false)} />}
    </>
  );
}

function AssistantPanel({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const api = useAssistant(pathname);
  const { refreshStatus } = api;

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/20 lg:hidden" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Assistente virtual"
        onClickCapture={(e) => {
          // No celular o painel cobre a tela: ao abrir um link, fecha para mostrar a página.
          if ((e.target as HTMLElement).closest("a[href]") && window.innerWidth < 1024) onClose();
        }}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-slate-50 shadow-2xl sm:w-[420px]",
          "animate-in slide-in-from-right duration-200"
        )}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-brand-navy px-4 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold">
              <Sparkles className="h-4 w-4 text-brand-navy" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Assistente</p>
              <p className="text-[11px] text-brand-gold">Consultas e cadastros no CRM</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={api.newConversation}
              className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="Nova conversa"
              title="Nova conversa"
            >
              <Plus className="h-4 w-4" />
            </button>
            <Link
              href="/assistente"
              onClick={onClose}
              className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="Abrir em tela cheia"
              title="Abrir em tela cheia"
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="Fechar assistente"
              title="Fechar (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <AssistantChat api={api} pagePath={pathname} variant="panel" />
        </div>
      </aside>
    </>
  );
}
