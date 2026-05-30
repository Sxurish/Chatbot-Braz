"use client";

import { useEffect, useRef, useState } from "react";
import { Send, ShieldCheck, AlertTriangle, FileText, Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STANDARD_MESSAGES } from "@/lib/chatbot/system-prompt";
import type { AiResponse } from "@/lib/chatbot/schema";
import { cn } from "@/lib/utils";

type Phase = "consent" | "chatting" | "declined";

interface Bubble {
  id: number;
  role: "user" | "bot";
  content: string;
  meta?: {
    docs?: string[];
    urgency?: string;
    handoff?: boolean;
  };
}

let idSeq = 0;
const nextId = () => ++idSeq;

const POLICY_VERSION =
  process.env.NEXT_PUBLIC_PRIVACY_POLICY_VERSION ?? "1.0.0";

export function ChatWidget() {
  const [phase, setPhase] = useState<Phase>("consent");
  const [messages, setMessages] = useState<Bubble[]>([
    { id: nextId(), role: "bot", content: STANDARD_MESSAGES.greeting },
    { id: nextId(), role: "bot", content: STANDARD_MESSAGES.legalNotice },
    { id: nextId(), role: "bot", content: STANDARD_MESSAGES.lgpdConsent },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [leadCreated, setLeadCreated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function push(bubble: Omit<Bubble, "id">) {
    setMessages((prev) => [...prev, { id: nextId(), ...bubble }]);
  }

  function handleConsent(accepted: boolean) {
    if (!accepted) {
      push({ role: "user", content: "Não concordo" });
      push({ role: "bot", content: STANDARD_MESSAGES.consentDeclined });
      setPhase("declined");
      return;
    }
    push({ role: "user", content: "Sim, concordo" });
    // Carimbo do consentimento — enviado ao server para registro em consent_logs.
    setConsentAt(new Date().toISOString());
    push({
      role: "bot",
      content:
        "Obrigado. Consentimento registrado. Para começar, por favor descreva resumidamente a sua situação. Você também pode informar seu nome e a cidade onde reside.",
    });
    setPhase("chatting");
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    push({ role: "user", content: text });
    setInput("");
    setLoading(true);

    const history = messages
      .filter((m) => m.role === "user" || m.role === "bot")
      .map((m) => ({
        role: (m.role === "bot" ? "assistant" : "user") as "assistant" | "user",
        content: m.content,
      }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          consent: consentAt
            ? { given: true, at: consentAt, policyVersion: POLICY_VERSION }
            : undefined,
          // Persiste apenas a primeira mensagem de triagem como lead inicial.
          persist: !leadCreated,
        }),
      });
      if (!res.ok) throw new Error("request failed");
      const data: AiResponse & { _leadId?: string } = await res.json();
      if (data._leadId) setLeadCreated(true);
      push({
        role: "bot",
        content: data.resposta_cliente,
        meta: {
          docs: data.documentos_sugeridos,
          urgency: data.urgencia || undefined,
          handoff: data.precisa_humano,
        },
      });
    } catch {
      push({
        role: "bot",
        content:
          "Tivemos uma instabilidade momentânea ao processar sua mensagem. Por favor, tente novamente em instantes ou entre em contato diretamente com o escritório.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[640px] max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-brand-navy px-5 py-4 text-white">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold text-brand-navy">
          <Scale className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Assistente virtual — Dr. Jean Braz</p>
          <p className="flex items-center gap-1 text-[11px] text-brand-gold">
            <ShieldCheck className="h-3 w-3" /> Pré-atendimento • LGPD • OAB/SP
          </p>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} bubble={m} />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> O assistente está digitando...
          </div>
        )}

        {phase === "consent" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => handleConsent(true)}>
              Sim, concordo
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleConsent(false)}>
              Não concordo
            </Button>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 bg-white p-3">
        {phase === "declined" ? (
          <p className="px-2 py-2 text-center text-xs text-slate-400">
            Atendimento encerrado. Entre em contato pelos canais oficiais do escritório.
          </p>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={phase !== "chatting" || loading}
              placeholder={
                phase === "chatting"
                  ? "Descreva sua situação..."
                  : "Confirme o consentimento para continuar"
              }
            />
            <Button
              type="submit"
              size="icon"
              disabled={phase !== "chatting" || loading || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
        <p className="mt-2 px-1 text-center text-[10px] text-slate-400">
          Política de privacidade v{POLICY_VERSION}. Este canal não substitui consulta
          jurídica formal.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ bubble }: { bubble: Bubble }) {
  const isUser = bubble.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-brand-primary text-white"
            : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"
        )}
      >
        <p className="whitespace-pre-wrap">{bubble.content}</p>

        {bubble.meta?.handoff && (
          <div className="mt-2 flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
            <AlertTriangle className="h-3 w-3" /> Encaminhado como prioritário à equipe
            jurídica.
          </div>
        )}

        {bubble.meta?.docs && bubble.meta.docs.length > 0 && (
          <div className="mt-2 rounded-md bg-slate-50 px-2 py-2">
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
              <FileText className="h-3 w-3" /> Documentos que podem ajudar:
            </p>
            <ul className="space-y-0.5">
              {bubble.meta.docs.map((d) => (
                <li key={d} className="text-xs text-slate-500">
                  • {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
