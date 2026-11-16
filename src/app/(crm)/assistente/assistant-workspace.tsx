"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { useAssistant } from "@/components/assistant/use-assistant";

interface ConversationItem {
  id: string;
  title: string | null;
  updated_at: string;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }),
  }).format(d);
}

export function AssistantWorkspace() {
  const api = useAssistant("/assistente");
  const { refreshStatus, conversationId, busy, selectConversation } = api;
  const [conversations, setConversations] = useState<ConversationItem[]>([]);

  const loadList = useCallback(() => {
    return fetch("/api/assistente/conversas", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setConversations((data.conversations ?? []) as ConversationItem[]))
      .catch(() => {
        // mantém a lista atual
      });
  }, []);

  useEffect(() => {
    void refreshStatus();
    void loadList();
  }, [refreshStatus, loadList]);

  // Atualiza o histórico quando uma resposta termina (título e ordem).
  useEffect(() => {
    if (!busy) void loadList();
  }, [busy, conversationId, loadList]);

  const remove = async (id: string) => {
    await fetch(`/api/assistente/conversas/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (id === conversationId) selectConversation(null);
    void loadList();
  };

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100%+3rem)] min-h-[560px] lg:-mx-8">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-white md:flex">
        <div className="p-3">
          <button
            type="button"
            onClick={() => selectConversation(null)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-primary px-3 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nova conversa
          </button>
        </div>
        <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Conversas anteriores
        </p>
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-400">Nenhuma conversa ainda.</p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => selectConversation(c.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 pr-8 text-left text-sm transition-colors",
                      c.id === conversationId ? "bg-brand-primary/10 text-brand-navy" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.title ?? "Conversa"}</span>
                      <span className="text-[11px] text-slate-400">{formatWhen(c.updated_at)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(c.id)}
                    className="absolute right-1 top-2 hidden rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:block"
                    aria-label="Apagar conversa"
                    title="Apagar conversa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <p className="border-t px-4 py-3 text-[11px] leading-snug text-slate-400">
          As conversas ficam guardadas por 90 dias. Atalho: Ctrl+K abre o assistente em qualquer tela.
        </p>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-slate-50">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 sm:px-8">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Assistente virtual</h2>
            <p className="text-xs text-slate-500">Consultas ao CRM e cadastros a partir de texto, PDF ou print, sempre com a sua confirmação.</p>
          </div>
          <button
            type="button"
            onClick={() => selectConversation(null)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 md:hidden"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <AssistantChat api={api} pagePath={null} variant="page" />
        </div>
      </section>
    </div>
  );
}
