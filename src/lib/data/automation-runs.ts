import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AUTOMATION_JOBS, type AutomationJobId } from "@/lib/automation/jobs";

/**
 * Leitura das execuções das rotinas (automation_runs) para a página
 * /automacoes. Usa o login de quem está vendo: o RLS só deixa o Admin ler.
 * Sem Supabase (modo demonstração) não há execuções.
 */

export interface AutomationRun {
  id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  trigger: "cron" | "manual";
}

export interface JobHealth {
  job: AutomationJobId;
  last: AutomationRun | null;
  /** Falhas seguidas até a última execução terminada. */
  consecutiveFailures: number;
  recentErrors: AutomationRun[];
}

export interface AutomationOverview {
  mode: "demo" | "live" | "missing_table" | "error";
  jobs: JobHealth[];
  recent: AutomationRun[];
}

const COLS = "id, job, started_at, finished_at, ok, summary, error, trigger";

function emptyJobs(): JobHealth[] {
  return AUTOMATION_JOBS.map((j) => ({ job: j.id, last: null, consecutiveFailures: 0, recentErrors: [] }));
}

export async function getAutomationOverview(): Promise<AutomationOverview> {
  if (!isSupabaseConfigured()) return { mode: "demo", jobs: emptyJobs(), recent: [] };
  const supabase = await createClient();

  const recentRes = await supabase.from("automation_runs").select(COLS).order("started_at", { ascending: false }).limit(20);
  if (recentRes.error) {
    const missing =
      recentRes.error.code === "42P01" ||
      recentRes.error.code === "PGRST205" ||
      /does not exist|could not find the table/i.test(recentRes.error.message);
    return { mode: missing ? "missing_table" : "error", jobs: emptyJobs(), recent: [] };
  }

  const jobs = await Promise.all(
    AUTOMATION_JOBS.map(async (j): Promise<JobHealth> => {
      const { data } = await supabase
        .from("automation_runs")
        .select(COLS)
        .eq("job", j.id)
        .order("started_at", { ascending: false })
        .limit(30);
      const runs = (data as AutomationRun[] | null) ?? [];
      let consecutiveFailures = 0;
      for (const r of runs) {
        if (r.ok === null) continue;
        if (r.ok) break;
        consecutiveFailures++;
      }
      return {
        job: j.id,
        last: runs[0] ?? null,
        consecutiveFailures,
        recentErrors: runs.filter((r) => r.ok === false).slice(0, 3),
      };
    })
  );

  return { mode: "live", jobs, recent: (recentRes.data as AutomationRun[] | null) ?? [] };
}
