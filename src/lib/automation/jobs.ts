/**
 * Rotinas automáticas do CRM (sem dependências de servidor: usadas também na
 * página /automacoes). Os horários seguem o vercel.json (em UTC); aqui ficam
 * no fuso de Brasília.
 */

export type AutomationJobId = "andamentos" | "resumo" | "intimacoes";

export interface AutomationJob {
  id: AutomationJobId;
  label: string;
  schedule: string;
  description: string;
  /** Rota chamada pela Vercel Cron. */
  path: string;
}

export const AUTOMATION_JOBS: AutomationJob[] = [
  {
    id: "andamentos",
    label: "Andamentos dos tribunais",
    schedule: "Todo dia às 6h",
    description: "Busca no DataJud os andamentos novos dos processos com número CNJ.",
    path: "/api/cron/andamentos",
  },
  {
    id: "resumo",
    label: "Resumo diário",
    schedule: "Dias úteis às 9h",
    description: "Monta o resumo do dia de cada pessoa e manda pelo WhatsApp.",
    path: "/api/cron/resumo",
  },
  {
    id: "intimacoes",
    label: "Intimações",
    schedule: "De hora em hora",
    description: "Lê as intimações publicadas e cria os prazos.",
    path: "/api/cron/intimacoes",
  },
];

export function jobLabel(job: string): string {
  return AUTOMATION_JOBS.find((j) => j.id === job)?.label ?? job;
}

/** Execuções guardadas por este tempo; as mais antigas são apagadas. */
export const RUNS_KEEP_DAYS = 90;
