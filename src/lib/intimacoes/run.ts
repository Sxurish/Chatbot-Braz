import "server-only";
import type { ServiceClient } from "@/lib/supabase/request-context";
import { captureDjenPublications, type CaptureOptions, type CaptureResult } from "@/lib/intimacoes/capture";
import { readPendingPublications } from "@/lib/intimacoes/ai-read";
import { notifyNewPublications } from "@/lib/intimacoes/notify";

/**
 * Rotina das intimações: captura no DJEN → leitura pela IA → aviso pelo
 * WhatsApp. Cada etapa roda separada: se a IA ou o aviso falharem, a
 * captura continua valendo (e vice-versa: a IA lê as pendentes de antes
 * mesmo quando o DJEN está fora do ar).
 */

type AiResult = Awaited<ReturnType<typeof readPendingPublications>>;
type NotifyResult = Awaited<ReturnType<typeof notifyNewPublications>>;

export type StepOutcome<T> = { ok: true; result: T } | { ok: false; error: string };

export interface IntimacoesRunResult {
  capture: StepOutcome<CaptureResult>;
  ai: StepOutcome<AiResult>;
  notify: StepOutcome<NotifyResult>;
}

export interface IntimacoesRunOptions {
  capture?: CaptureOptions;
  /** Quantas intimações a IA lê por execução. */
  aiLimit?: number;
}

function message(err: unknown): string {
  return (err as Error)?.message || String(err) || "Erro desconhecido.";
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<StepOutcome<T>> {
  try {
    return { ok: true, result: await fn() };
  } catch (err) {
    console.warn(`[intimacoes] ${name} falhou:`, message(err));
    return { ok: false, error: message(err) };
  }
}

export async function runIntimacoesPipeline(db: ServiceClient, opts: IntimacoesRunOptions = {}): Promise<IntimacoesRunResult> {
  const capture = await step("captura", () => captureDjenPublications(db, opts.capture));
  const ai = await step("leitura pela IA", () => readPendingPublications(db, opts.aiLimit ? { limit: opts.aiLimit } : undefined));
  const notify = await step("aviso pelo WhatsApp", () => notifyNewPublications(db));
  return { capture, ai, notify };
}

/** Erro da captura (que faz a execução contar como falha), ou null. */
export function captureError(run: IntimacoesRunResult): string | null {
  if (!run.capture.ok) return run.capture.error;
  return run.capture.result.ok ? null : run.capture.result.error || "A captura no DJEN falhou.";
}

/**
 * Resumo da execução para automation_runs.summary. Plano (só números e
 * textos), para a página /automacoes conseguir mostrar.
 */
export function summarizeRun(run: IntimacoesRunResult): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  if (run.capture.ok) {
    const c = run.capture.result;
    if (c.window) s.janela = `${c.window.from} a ${c.window.to}`;
    s.buscadas = c.fetched;
    s.novas = c.inserted;
    s.repetidas = c.duplicates;
    s.vinculadas = c.linked + c.linkedLater;
    s.canceladas = c.cancelledUpdated;
    s.outra_oab = c.otherOab;
    s.rejeitadas = c.rejected;
    if (c.ambiguous) s.vinculo_ambiguo = c.ambiguous;
    s.truncada = c.truncated ? "sim" : "não";
    s.data_avancou = c.advanced ? "sim" : "não";
    if (c.lastSuccessDate) s.buscado_ate = c.lastSuccessDate;
    if (c.geoblocked) s.geobloqueio = "sim";
    if (c.error) s.captura_erro = c.error;
    if (c.warnings.length) s.avisos = c.warnings.join(" | ");
  } else {
    s.captura_erro = run.capture.error;
  }

  if (run.ai.ok) {
    const a = run.ai.result;
    s.ia_lidas = a.read;
    s.ia_falhas = a.failed;
    s.ia_puladas = a.skipped;
    s.ia_desligada = a.disabled ? "sim" : "não";
    s.ia_custo_usd = Math.round(a.costUsd * 10000) / 10000;
  } else {
    s.ia_erro = run.ai.error;
  }

  if (run.notify.ok) {
    const n = run.notify.result;
    s.whatsapp_enviados = n.sent;
    s.whatsapp_pulados = n.skipped;
    s.whatsapp_erros = n.errors;
  } else {
    s.whatsapp_erro = run.notify.error;
  }
  return s;
}
