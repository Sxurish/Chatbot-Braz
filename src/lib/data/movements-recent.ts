import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { mockMovements } from "@/lib/mock-data-crm";
import type { ProcessMovement } from "@/lib/types";

/**
 * Andamentos recentes de vários processos (usado pelo assistente para
 * responder "o que mudou"). Consulta com o login de quem pergunta (RLS).
 *
 * Entra o andamento que aconteceu desde `since` ou que chegou ao CRM desde
 * `since` (o DataJud atrasa dias). Do que só chegou agora, fica de fora o
 * que aconteceu antes de `backlogCutoff`: é o histórico antigo trazido na
 * primeira busca de um processo, não uma novidade.
 */
export async function listRecentMovements(opts: {
  since: string;
  backlogCutoff: string;
  processIds?: string[];
  limit?: number;
}): Promise<ProcessMovement[]> {
  const limit = opts.limit ?? 300;
  if (opts.processIds && opts.processIds.length === 0) return [];
  const isRecent = (m: ProcessMovement) =>
    m.occurred_at >= opts.since || (m.created_at >= opts.since && m.occurred_at >= opts.backlogCutoff);

  if (!isSupabaseConfigured()) {
    return mockMovements
      .filter((m) => !m.hidden && (!opts.processIds || opts.processIds.includes(m.process_id)))
      .filter(isRecent)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, limit);
  }

  const supabase = await createClient();
  let query = supabase
    .from("process_movements")
    .select("*")
    .eq("hidden", false)
    .or(
      `occurred_at.gte."${opts.since}",and(created_at.gte."${opts.since}",occurred_at.gte."${opts.backlogCutoff}")`
    )
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (opts.processIds) query = query.in("process_id", opts.processIds.slice(0, 200));
  const { data, error } = await query;
  if (error || !data) return [];
  return data as ProcessMovement[];
}
