"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, MinusCircle, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConnectionTest, TestStatus } from "@/lib/automation/diagnostics";
import { formatBrasilia } from "@/lib/automation/format";
import { testConnectionsAction, type TestConnectionsState } from "./actions";

const initial: TestConnectionsState = {};

const STATUS: Record<TestStatus, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  ok: { label: "OK", icon: CheckCircle2, tone: "text-emerald-600" },
  erro: { label: "Erro", icon: AlertCircle, tone: "text-red-600" },
  aviso: { label: "Instável", icon: AlertTriangle, tone: "text-amber-600" },
  pulado: { label: "Não testado", icon: MinusCircle, tone: "text-slate-400" },
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
      {pending ? "Testando…" : "Testar conexões"}
    </Button>
  );
}

function Row({ test }: { test: ConnectionTest }) {
  const cfg = STATUS[test.status];
  const Icon = cfg.icon;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.tone}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">
          {test.label} <span className={`ml-1 text-xs font-normal ${cfg.tone}`}>{cfg.label}</span>
        </p>
        <p className="text-sm text-slate-600">{test.message}</p>
        {test.details && test.details.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">
            {test.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function TestConnections() {
  const [state, action] = useActionState(async () => testConnectionsAction(), initial);
  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <Submit />
        <span className="text-xs text-slate-500">
          Cada teste espera no máximo 8 segundos. Nenhuma chave é mostrada.
        </span>
      </form>
      {state.error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {state.error}
        </p>
      )}
      {state.results && (
        <>
          <ul className="mt-3 divide-y divide-slate-100">
            {state.results.map((t) => (
              <Row key={t.id} test={t} />
            ))}
          </ul>
          {state.at && <p className="mt-1 text-xs text-slate-400">Testado em {formatBrasilia(state.at)} (Brasília).</p>}
        </>
      )}
    </div>
  );
}
