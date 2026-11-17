import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maybeAlertOnFailure, type AlertOutcome } from "./alert";
import { RUNS_KEEP_DAYS } from "./jobs";

/**
 * Registro das execuções das rotinas automáticas em automation_runs
 * (supabase/fase5-automacoes.sql). Usa o cliente de serviço da rotina.
 *
 * Regra de ouro: o registro NUNCA derruba a rotina. Se a tabela não existe ou a
 * gravação falha, a rotina segue igual e devolve o mesmo resultado (ou o mesmo
 * erro) de antes.
 */

type AnyClient = Pick<SupabaseClient, "from">;

export type RunTrigger = "cron" | "manual";

export interface RecordRunOptions<T> {
  /** Cliente de serviço. Sem cliente, só roda a rotina. */
  client?: AnyClient | null;
  trigger?: RunTrigger;
  /** Números para guardar (vão para a coluna summary). */
  summarize?: (result: T) => Record<string, unknown> | null;
  /** A rotina terminou sem lançar erro, mas falhou por dentro? Padrão: ok. */
  outcome?: (result: T) => { ok: boolean; error?: string | null };
  /** Troca o alerta (testes). */
  alert?: (client: AnyClient, input: { job: string; error: string }) => Promise<AlertOutcome>;
  now?: () => Date;
}

function warn(job: string, what: string, err: unknown) {
  console.warn(`[automation_runs] ${job}: ${what}`, (err as { message?: string } | null)?.message ?? err);
}

async function safely<R>(job: string, what: string, fn: () => PromiseLike<R>): Promise<R | null> {
  try {
    return await fn();
  } catch (err) {
    warn(job, what, err);
    return null;
  }
}

export async function recordRun<T>(job: string, fn: () => Promise<T>, opts: RecordRunOptions<T> = {}): Promise<T> {
  const client = opts.client ?? null;
  const now = opts.now ?? (() => new Date());
  const startedAt = now();

  let runId: string | null = null;
  if (client) {
    const res = await safely(job, "não gravou o início", () =>
      client
        .from("automation_runs")
        .insert({ job, started_at: startedAt.toISOString(), trigger: opts.trigger ?? "cron" })
        .select("id")
        .single()
    );
    if (res?.error) warn(job, "não gravou o início", res.error);
    runId = (res?.data as { id?: string } | null)?.id ?? null;
  }

  const finish = async (runOk: boolean, runSummary: Record<string, unknown> | null, runError: string | null) => {
    if (!client || !runId) return;
    const id = runId;
    const finishedAt = now();
    const summaryWithMs = { ...(runSummary ?? {}), ms: finishedAt.getTime() - startedAt.getTime() };
    const upd = await safely(job, "não gravou o fim", () =>
      client
        .from("automation_runs")
        .update({ finished_at: finishedAt.toISOString(), ok: runOk, summary: summaryWithMs, error: runError })
        .eq("id", id)
    );
    if (!upd || upd.error) {
      if (upd?.error) warn(job, "não gravou o fim", upd.error);
      return;
    }

    if (!runOk) {
      const alert = opts.alert ?? maybeAlertOnFailure;
      const outcome = await safely(job, "não conseguiu avisar", () => alert(client, { job, error: runError ?? "" }));
      if (outcome?.alerted) {
        await safely(job, "não gravou o alerta", () =>
          client
            .from("automation_runs")
            .update({
              summary: {
                ...summaryWithMs,
                alerta: {
                  notificacoes: outcome.notificacoes,
                  whatsapp_enviados: outcome.whatsapp_enviados,
                  whatsapp_erros: outcome.whatsapp_erros,
                },
              },
            })
            .eq("id", id)
        );
      }
    }

    // Limpeza: mantém só os últimos 90 dias.
    const cutoff = new Date(finishedAt.getTime() - RUNS_KEEP_DAYS * 86_400_000).toISOString();
    await safely(job, "não limpou as execuções antigas", () =>
      client.from("automation_runs").delete().lt("started_at", cutoff)
    );
  };

  let result: T;
  try {
    result = await fn();
  } catch (err) {
    await finish(false, null, (err as Error)?.message || String(err));
    throw err;
  }

  let ok = true;
  let error: string | null = null;
  try {
    const o = opts.outcome?.(result);
    if (o) {
      ok = o.ok;
      error = o.ok ? null : o.error || "A rotina terminou com falhas.";
    }
  } catch (err) {
    warn(job, "não avaliou o resultado", err);
  }
  let summary: Record<string, unknown> | null = null;
  try {
    summary = opts.summarize?.(result) ?? null;
  } catch (err) {
    warn(job, "não montou o resumo", err);
  }
  await finish(ok, summary, error);
  return result;
}
