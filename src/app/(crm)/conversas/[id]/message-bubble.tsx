import { Bot, FileText, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageRow } from "@/lib/data/conversations-types";

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

interface SummaryShape {
  summary?: {
    area?: string;
    urgencia?: string;
    resumo_caso?: string;
    proxima_acao?: string;
    [key: string]: unknown;
  };
}

export function MessageBubble({ msg }: { msg: MessageRow }) {
  const when = timeFmt.format(new Date(msg.created_at));
  const handoff =
    msg.sender_type === "bot" &&
    (msg.metadata as { handoff?: boolean } | null)?.handoff === true;

  if (msg.sender_type === "system") {
    const summary = (msg.metadata as SummaryShape | null)?.summary;
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <FileText className="h-3.5 w-3.5" />
            Resumo interno · {when}
          </div>
          {summary ? (
            <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
              {summary.area && (
                <SummaryItem label="Área" value={String(summary.area)} />
              )}
              {summary.urgencia && (
                <SummaryItem label="Urgência" value={String(summary.urgencia)} />
              )}
              {summary.resumo_caso && (
                <div className="sm:col-span-2">
                  <SummaryItem
                    label="Resumo do caso"
                    value={String(summary.resumo_caso)}
                  />
                </div>
              )}
              {summary.proxima_acao && (
                <div className="sm:col-span-2">
                  <SummaryItem
                    label="Próxima ação"
                    value={String(summary.proxima_acao)}
                  />
                </div>
              )}
            </dl>
          ) : (
            <p className="whitespace-pre-line">{msg.content}</p>
          )}
        </div>
      </div>
    );
  }

  const isUser = msg.sender_type === "user";
  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={cn("flex max-w-[78%] flex-col", isUser && "items-end")}>
        <div
          className={cn(
            "whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm",
            isUser
              ? "rounded-br-md bg-brand-primary text-white"
              : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
          )}
        >
          {msg.content}
        </div>
        <div className="mt-1 flex items-center gap-2 px-1 text-xs text-slate-400">
          <span>{when}</span>
          {handoff && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
              Handoff
            </span>
          )}
        </div>
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
        {label}
      </dt>
      <dd className="text-amber-900">{value}</dd>
    </div>
  );
}
