"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
}

export interface AssistantStatus {
  configured: boolean;
  enabled: boolean;
  isAdmin: boolean;
  budget: { level: "ok" | "warning" | "over" | "blocked"; message: string | null; spentUsd?: number; limitUsd?: number };
}

/** Conversa atual compartilhada entre o painel flutuante e a página /assistente. */
export const CURRENT_CONVERSATION_KEY = "assistente:conversa-atual";
const CHANGE_EVENT = "assistente:conversa-mudou";

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_CONVERSATION_KEY);
  } catch {
    return null;
  }
}

function storeId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(CURRENT_CONVERSATION_KEY, id);
    else window.localStorage.removeItem(CURRENT_CONVERSATION_KEY);
  } catch {
    // navegação privada: segue sem lembrar
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
}

let seq = 0;
const uid = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

type LoadedMessages = { id: string; role: "user" | "assistant"; content: string }[];

/** Busca as mensagens de uma conversa; null se não existe ou não é desta pessoa. */
async function fetchMessages(id: string): Promise<LoadedMessages | null> {
  try {
    const res = await fetch(`/api/assistente/conversas/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return res.status === 404 ? null : [];
    const data = (await res.json()) as { messages: LoadedMessages };
    return data.messages;
  } catch {
    return [];
  }
}

export function useAssistant(pagePath: string | null) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readStoredId()
  );
  const [busy, setBusy] = useState(false);
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [budgetNotice, setBudgetNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Conversa criada agora pela resposta em andamento: não recarregar do servidor. */
  const createdHereRef = useRef<string | null>(null);

  const refreshStatus = useCallback(() => {
    return fetch("/api/assistente", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatusError(data.error ?? "Assistente indisponível.");
          return;
        }
        setStatusError(null);
        setStatus(data as AssistantStatus);
        setBudgetNotice((data as AssistantStatus).budget.message);
      })
      .catch(() => setStatusError("Não foi possível falar com o assistente."));
  }, []);

  // Carrega as mensagens quando a conversa atual muda.
  useEffect(() => {
    if (!conversationId || createdHereRef.current === conversationId) return;
    let cancelled = false;
    fetchMessages(conversationId).then((messages) => {
      if (cancelled) return;
      if (messages === null) {
        setConversationId(null);
        setTurns([]);
        storeId(null);
        return;
      }
      setTurns(messages.map((m) => ({ id: m.id, role: m.role, content: m.content })));
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const idRef = useRef(conversationId);
  useEffect(() => {
    idRef.current = conversationId;
  }, [conversationId]);

  // Acompanha a conversa escolhida na outra tela (painel ↔ página).
  useEffect(() => {
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail ?? null;
      if (id === idRef.current) return;
      idRef.current = id;
      setTurns([]);
      setConversationId(id);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const selectConversation = useCallback((id: string | null) => {
    if (id !== null && id === idRef.current) return;
    abortRef.current?.abort();
    createdHereRef.current = null;
    idRef.current = id;
    setTurns([]);
    setConversationId(id);
    storeId(id);
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(
    async (question: string) => {
      const message = question.trim();
      if (!message || busy) return;
      const answerId = uid();
      setTurns((prev) => [
        ...prev,
        { id: uid(), role: "user", content: message },
        { id: answerId, role: "assistant", content: "", pending: true },
      ]);
      setBusy(true);
      setToolLabel(null);
      const controller = new AbortController();
      abortRef.current = controller;

      const patch = (fn: (t: ChatTurn) => ChatTurn) =>
        setTurns((prev) => prev.map((t) => (t.id === answerId ? fn(t) : t)));

      try {
        const res = await fetch("/api/assistente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, conversationId, page: pagePath }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          patch((t) => ({ ...t, pending: false, error: true, content: data.error ?? "Não consegui responder agora." }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            switch (event.type) {
              case "meta": {
                const id = event.conversationId as string;
                if (id && id !== idRef.current) {
                  createdHereRef.current = id;
                  idRef.current = id;
                  setConversationId(id);
                  storeId(id);
                }
                const budget = event.budget as { message: string | null } | undefined;
                setBudgetNotice(budget?.message ?? null);
                break;
              }
              case "text":
                setToolLabel(null);
                patch((t) => ({ ...t, content: t.content + String(event.delta ?? "") }));
                break;
              case "tool":
                setToolLabel(String(event.label ?? "Consultando o CRM"));
                break;
              case "error":
                patch((t) => ({
                  ...t,
                  error: true,
                  content: t.content ? `${t.content}\n\n${event.message}` : String(event.message),
                }));
                break;
            }
          }
        }
        patch((t) => ({ ...t, pending: false }));
      } catch (err) {
        const aborted = (err as Error)?.name === "AbortError";
        patch((t) => ({
          ...t,
          pending: false,
          error: !aborted,
          content: aborted ? `${t.content}${t.content ? "\n\n" : ""}_(Resposta interrompida.)_` : "Falha de conexão. Tente de novo.",
        }));
      } finally {
        setBusy(false);
        setToolLabel(null);
        abortRef.current = null;
      }
    },
    [busy, conversationId, pagePath]
  );

  return {
    turns,
    conversationId,
    busy,
    toolLabel,
    status,
    statusError,
    budgetNotice,
    send,
    stop,
    refreshStatus,
    selectConversation,
    newConversation: () => selectConversation(null),
  };
}
