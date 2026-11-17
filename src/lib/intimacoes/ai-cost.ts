import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gasto do mês com a leitura das intimações pela IA (fase 5, parte B).
 *
 * O custo de cada leitura fica em court_publications.ai_cost_usd (com
 * ai_read_at). Ele entra no MESMO limite mensal do assistente: o painel do
 * assistente soma este valor ao das conversas (src/lib/assistant/store.ts) e a
 * leitura das intimações soma o das conversas (src/lib/intimacoes/ai-read.ts).
 *
 * Sem banco da fase 5 (tabela ou coluna faltando), devolve zero.
 */

type AnyClient = Pick<SupabaseClient, "from">;

function monthKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

/** Início do mês corrente em São Paulo (sempre -03:00), em ISO. */
export function saoPauloMonthStartIso(date = new Date()): string {
  return new Date(`${monthKey(date)}-01T00:00:00-03:00`).toISOString();
}

const PAGE = 1000;

/** Soma uma coluna de custo desde `since`, em páginas. Lança erro se a consulta falhar. */
async function sumCost(
  db: AnyClient,
  table: string,
  costColumn: string,
  dateColumn: string,
  since: string
): Promise<number> {
  let total = 0;
  for (let page = 0; page < 200; page++) {
    const { data, error } = await db
      .from(table)
      .select(costColumn)
      .gte(dateColumn, since)
      .gt(costColumn, 0)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, number | string | null>[];
    for (const r of rows) total += Number(r[costColumn] ?? 0);
    if (rows.length < PAGE) break;
  }
  return total;
}

/** Custo das leituras de intimações neste mês. Zero se a fase 5 não estiver instalada. */
export async function getIntimacoesMonthCostUsd(db: AnyClient, now = new Date()): Promise<number> {
  try {
    return await sumCost(db, "court_publications", "ai_cost_usd", "ai_read_at", saoPauloMonthStartIso(now));
  } catch {
    return 0;
  }
}

/**
 * Gasto total do mês com IA (conversas do assistente + leitura de
 * intimações), lido com o cliente de serviço. Lança erro se não conseguir
 * ler as conversas: sem saber o gasto, quem chama não usa a IA.
 */
export async function getAiMonthSpendUsd(db: AnyClient, now = new Date()): Promise<number> {
  const since = saoPauloMonthStartIso(now);
  const [assistant, intimacoes] = await Promise.all([
    sumCost(db, "assistant_messages", "cost_usd", "created_at", since),
    getIntimacoesMonthCostUsd(db, now),
  ]);
  return assistant + intimacoes;
}
