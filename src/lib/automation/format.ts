/**
 * Textos da página /automacoes (sem dependências de servidor). Horários no
 * fuso de Brasília.
 */

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatBrasilia(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateTimeFmt.format(d);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0).replace(".", ",")} s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

export interface RunLike {
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  summary: Record<string, unknown> | null;
}

export function runDurationMs(run: RunLike): number | null {
  const ms = run.summary?.ms;
  if (typeof ms === "number") return ms;
  if (!run.finished_at) return null;
  return Date.parse(run.finished_at) - Date.parse(run.started_at);
}

/** Sem fim depois de 15 min: a função foi interrompida (tempo esgotado ou queda). */
export const STALE_AFTER_MS = 15 * 60_000;

export type RunState = "ok" | "falhou" | "rodando" | "interrompida";

export function runState(run: RunLike, nowMs: number): RunState {
  if (run.ok === true) return "ok";
  if (run.ok === false) return "falhou";
  return nowMs - Date.parse(run.started_at) > STALE_AFTER_MS ? "interrompida" : "rodando";
}

export const RUN_STATE_LABEL: Record<RunState, string> = {
  ok: "Funcionou",
  falhou: "Falhou",
  rodando: "Rodando",
  interrompida: "Interrompida",
};

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Resumo em uma linha do que a execução fez. */
export function summaryText(job: string, summary: Record<string, unknown> | null): string {
  if (!summary) return "—";
  if (job === "andamentos") {
    const parts = [
      plural(n(summary.checked), "processo consultado", "processos consultados"),
      plural(n(summary.inserted), "andamento novo", "andamentos novos"),
    ];
    if (n(summary.failed)) parts.push(plural(n(summary.failed), "falha", "falhas"));
    if (n(summary.skipped)) parts.push(`${n(summary.skipped)} sem número CNJ`);
    return parts.join(", ");
  }
  if (job === "resumo") {
    if (typeof summary.skipped === "string" && summary.skipped) return summary.skipped;
    const parts = [
      plural(n(summary.pessoas), "pessoa", "pessoas"),
      plural(n(summary.enviados), "enviado", "enviados"),
    ];
    if (n(summary.ja_enviados)) parts.push(`${n(summary.ja_enviados)} já enviado(s)`);
    if (n(summary.sem_whatsapp)) parts.push(`${n(summary.sem_whatsapp)} sem WhatsApp`);
    if (n(summary.falhas)) parts.push(plural(n(summary.falhas), "falha", "falhas"));
    return parts.join(", ");
  }
  const parts = Object.entries(summary)
    .filter(([k, v]) => k !== "ms" && k !== "alerta" && (typeof v === "number" || typeof v === "string"))
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(", ") : "—";
}
