import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gasto do mês com minutas (chamadas diretas ao Sonnet). O custo de cada
 * minuta fica em assistant_minutas.cost_usd e entra no MESMO limite mensal do
 * assistente: store.ts (painel e WhatsApp) e intimacoes/ai-cost.ts somam este
 * valor ao das conversas.
 *
 * - Com o login de quem usa (RLS só mostra as próprias minutas): função do
 *   banco assistant_minutas_month_cost(), que soma as de toda a equipe.
 * - Com o cliente de serviço: soma direto na tabela.
 * Sem o supabase/assistente-documentos.sql rodado, devolve zero (não há minutas ainda).
 */

type AnyClient = Pick<SupabaseClient, "from"> & Partial<Pick<SupabaseClient, "rpc">>;

function monthStartIso(date: Date): string {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(date);
  return new Date(`${key}-01T00:00:00-03:00`).toISOString();
}

const PAGE = 1000;

async function sumDirect(db: AnyClient, since: string): Promise<number> {
  let total = 0;
  for (let page = 0; page < 200; page++) {
    const { data, error } = await db
      .from("assistant_minutas")
      .select("cost_usd")
      .gte("created_at", since)
      .gt("cost_usd", 0)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { cost_usd: number | string | null }[];
    for (const r of rows) total += Number(r.cost_usd ?? 0);
    if (rows.length < PAGE) break;
  }
  return total;
}

export async function getMinutasMonthCostUsd(
  db: AnyClient,
  opts: { serviceRole?: boolean; now?: Date } = {}
): Promise<number> {
  try {
    if (!opts.serviceRole && db.rpc) {
      const { data, error } = await db.rpc("assistant_minutas_month_cost");
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    }
    return await sumDirect(db, monthStartIso(opts.now ?? new Date()));
  } catch {
    return 0;
  }
}
