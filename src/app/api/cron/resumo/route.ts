import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/config";
import { runDailyDigests } from "@/lib/digest/run";

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
    const out = await runDailyDigests(createServiceClient(), { now: new Date() });
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
