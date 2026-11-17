import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/config";
import { recordRun } from "@/lib/automation/runs";
import { captureError, runIntimacoesPipeline, summarizeRun } from "@/lib/intimacoes/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Intimações do DJEN: captura, leitura pela IA e aviso pelo WhatsApp.
 * Chamada de hora em hora pelo pg_cron do Supabase
 * (supabase/fase5-intimacoes-agendamento.sql) e uma vez por dia pela Vercel
 * Cron, como reserva. Só quem tem o CRON_SECRET chama.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  if (!hasServiceRole()) {
    return Response.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY na Vercel." }, { status: 503 });
  }
  const started = Date.now();
  try {
    const supabase = createServiceClient();
    // Registra a execução em automation_runs (Saúde das automações).
    const run = await recordRun("intimacoes", () => runIntimacoesPipeline(supabase), {
      client: supabase,
      summarize: summarizeRun,
      // Falhou quando a captura no DJEN falhou. IA e WhatsApp aparecem no resumo.
      outcome: (r) => {
        const error = captureError(r);
        return error ? { ok: false, error } : { ok: true };
      },
    });
    const error = captureError(run);
    return Response.json({ ok: !error, error, ...summarizeRun(run), ms: Date.now() - started });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
