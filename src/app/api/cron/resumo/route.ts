import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/config";
import { runDailyDigests } from "@/lib/digest/run";
import { recordRun } from "@/lib/automation/runs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Resumo diário (Vercel Cron, ver vercel.json: dias úteis às 12h UTC = 9h de
 * Brasília). Grava o resumo de quem está marcado na Equipe e manda pelo
 * WhatsApp. Só a Vercel chama, com o CRON_SECRET.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  if (!hasServiceRole()) {
    return Response.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY na Vercel." }, { status: 503 });
  }
  const started = Date.now();
  try {
    const supabase = createServiceClient();
    // Registra a execução em automation_runs (Saúde das automações). Não muda a rotina.
    const out = await recordRun("resumo", () => runDailyDigests(supabase, { now: new Date() }), {
      client: supabase,
      summarize: (o) => ({
        date: o.date,
        skipped: o.skipped ?? null,
        pessoas: o.results.length,
        enviados: o.results.filter((r) => r.status === "enviado").length,
        ja_enviados: o.results.filter((r) => r.status === "ja_enviado").length,
        sem_whatsapp: o.results.filter((r) => r.status === "salvo_sem_whatsapp").length,
        falhas: o.results.filter((r) => r.status === "falha_whatsapp" || r.status === "erro").length,
      }),
      // Falhou se ninguém recebeu nem teve o resumo salvo.
      outcome: (o) => {
        const bad = o.results.filter((r) => r.status === "falha_whatsapp" || r.status === "erro");
        return o.results.length > 0 && bad.length === o.results.length
          ? { ok: false, error: bad[0]?.error ?? "Nenhum resumo foi entregue." }
          : { ok: true };
      },
    });
    const count = (s: string) => out.results.filter((r) => r.status === s).length;
    return Response.json({
      ok: true,
      date: out.date,
      skipped: out.skipped ?? null,
      pessoas: out.results.length,
      enviados: count("enviado"),
      ja_enviados: count("ja_enviado"),
      sem_whatsapp: count("salvo_sem_whatsapp"),
      falhas: out.results.filter((r) => r.status === "falha_whatsapp" || r.status === "erro").map((r) => r.error),
      ms: Date.now() - started,
    });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
