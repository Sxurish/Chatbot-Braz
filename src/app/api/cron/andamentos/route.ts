import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/config";
import { syncDueProcesses } from "@/lib/datajud/sync";

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
 * Rotina diária (Vercel Cron, ver vercel.json): busca no DataJud os andamentos
 * dos processos com número CNJ. Só a Vercel chama, com o CRON_SECRET.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  if (!hasServiceRole()) {
    return Response.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY na Vercel." }, { status: 503 });
  }
  const started = Date.now();
  try {
    const totals = await syncDueProcesses(createServiceClient(), {
      // Para antes do limite da função, deixando folga para terminar o que começou.
      deadlineMs: started + (maxDuration - 60) * 1000,
    });
    return Response.json({ ok: true, ...totals, ms: Date.now() - started });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
