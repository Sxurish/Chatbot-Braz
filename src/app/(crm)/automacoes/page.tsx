import { Activity, AlertTriangle, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { checkAdmin } from "@/lib/auth/require-admin";
import { AUTOMATION_JOBS, jobLabel } from "@/lib/automation/jobs";
import { checkEnv, type EnvStatus } from "@/lib/automation/diagnostics";
import {
  formatBrasilia,
  formatDuration,
  runDurationMs,
  runState,
  RUN_STATE_LABEL,
  summaryText,
  type RunState,
} from "@/lib/automation/format";
import { getAutomationOverview, type AutomationRun } from "@/lib/data/automation-runs";
import { TestConnections } from "./test-connections";

export const dynamic = "force-dynamic";

const STATE_TONE: Record<RunState, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  falhou: "border-red-200 bg-red-50 text-red-700",
  rodando: "border-blue-200 bg-blue-50 text-blue-700",
  interrompida: "border-amber-200 bg-amber-50 text-amber-700",
};

const ENV_TONE: Record<EnvStatus, { label: string; tone: string }> = {
  configurada: { label: "Configurada", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  faltando: { label: "Faltando", tone: "border-red-200 bg-red-50 text-red-700" },
  padrao: { label: "Usando o padrão", tone: "border-slate-200 bg-slate-50 text-slate-600" },
};

function nowMs(): number {
  return Date.now();
}

function StateBadge({ run, now }: { run: AutomationRun; now: number }) {
  const state = runState(run, now);
  return <Badge className={STATE_TONE[state]}>{RUN_STATE_LABEL[state]}</Badge>;
}

export default async function AutomacoesPage() {
  const admin = await checkAdmin();
  if (!admin.ok) {
    return (
      <>
        <PageHeader title="Saúde das automações" description="Rotinas automáticas do CRM e diagnóstico." />
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={ShieldAlert}
              title="Acesso restrito"
              description="Apenas administradores podem ver a saúde das automações."
            />
          </CardContent>
        </Card>
      </>
    );
  }

  const overview = await getAutomationOverview();
  const env = checkEnv();
  const now = nowMs();

  return (
    <>
      <PageHeader
        title="Saúde das automações"
        description="Se as rotinas automáticas estão rodando e se as conexões estão certas. Horários de Brasília."
      />

      {overview.mode === "demo" && (
        <Notice>Modo demonstração (sem Supabase): nenhuma execução é registrada.</Notice>
      )}
      {overview.mode === "missing_table" && (
        <Notice>
          Falta a tabela de execuções. Rode supabase/fase5-automacoes.sql no SQL Editor do Supabase.
        </Notice>
      )}
      {overview.mode === "error" && <Notice>Não deu para ler as execuções agora. Recarregue a página.</Notice>}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {overview.jobs.map((health) => {
          const job = AUTOMATION_JOBS.find((j) => j.id === health.job)!;
          const last = health.last;
          return (
            <Card key={job.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{job.label}</CardTitle>
                    <CardDescription>{job.schedule}</CardDescription>
                  </div>
                  {last ? (
                    <StateBadge run={last} now={now} />
                  ) : (
                    <Badge className="border-slate-200 bg-slate-50 text-slate-500">Ainda não ativada</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-slate-500">{job.description}</p>
                {last ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-slate-500">Última execução</dt>
                    <dd className="text-slate-900">{formatBrasilia(last.started_at)}</dd>
                    <dt className="text-slate-500">Duração</dt>
                    <dd className="text-slate-900">{formatDuration(runDurationMs(last))}</dd>
                    <dt className="text-slate-500">Resumo</dt>
                    <dd className="text-slate-900">{summaryText(job.id, last.summary)}</dd>
                  </dl>
                ) : (
                  <p className="text-slate-500">Nunca rodou (ou a rotina ainda não existe).</p>
                )}
                {health.consecutiveFailures >= 2 && (
                  <p className="flex items-center gap-1.5 text-red-600">
                    <AlertTriangle className="h-4 w-4" /> Falhou {health.consecutiveFailures} vezes seguidas.
                  </p>
                )}
                {health.recentErrors.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Últimos erros</p>
                    <ul className="mt-1 space-y-1">
                      {health.recentErrors.map((r) => (
                        <li key={r.id} className="text-xs text-slate-600">
                          <span className="text-slate-400">{formatBrasilia(r.started_at)}:</span>{" "}
                          {r.error ?? "sem descrição"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Últimas 20 execuções</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.recent.length === 0 ? (
            <EmptyState icon={Activity} title="Nenhuma execução registrada" description="As rotinas aparecem aqui depois que rodarem." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Início</th>
                    <th className="py-2 pr-3 font-medium">Rotina</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Duração</th>
                    <th className="py-2 font-medium">Resumo / erro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.recent.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-600">
                        {formatBrasilia(r.started_at)}
                        {r.trigger === "manual" && <span className="ml-1 text-xs text-slate-400">(manual)</span>}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-900">{jobLabel(r.job)}</td>
                      <td className="py-2 pr-3">
                        <StateBadge run={r} now={now} />
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{formatDuration(runDurationMs(r))}</td>
                      <td className="py-2 text-slate-600">
                        {r.ok === false && r.error ? (
                          <span className="text-red-600">{r.error}</span>
                        ) : (
                          summaryText(r.job, r.summary)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diagnóstico</CardTitle>
          <CardDescription>
            Variáveis de ambiente da Vercel. Mostramos só se estão configuradas, nunca o valor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="divide-y divide-slate-100">
            {env.map((v) => (
              <li key={v.name} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs text-slate-900">{v.name}</p>
                  <p className="text-sm text-slate-600">{v.purpose}</p>
                  {v.effect && <p className="text-xs text-slate-500">Se faltar: {v.effect}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {v.value && <span className="font-mono text-xs text-slate-500">{v.value}</span>}
                  <Badge className={ENV_TONE[v.status].tone}>{ENV_TONE[v.status].label}</Badge>
                </div>
              </li>
            ))}
          </ul>
          <TestConnections />
        </CardContent>
      </Card>
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
