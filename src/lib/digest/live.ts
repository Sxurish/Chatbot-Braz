import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { mockAppointments, mockLeads, mockTasks } from "@/lib/mock-data";
import { mockClients, mockMovements, mockPayments, mockProcesses } from "@/lib/mock-data-crm";
import type { TeamUser } from "@/lib/types";
import { buildDailyDigest, computeDailyDigest, type DailyDigest } from "./build";
import { isoDateInSaoPaulo } from "./dates";

export interface LiveDigest {
  digest: DailyDigest | null;
  /** O resumo automático de hoje desta pessoa, se já saiu. */
  todaySend: { sentAt: string | null; error: string | null } | null;
  error: string | null;
}

/**
 * Resumo do dia calculado agora para quem está logado, com o login dela
 * (RLS). Financeiro só para Admin. No modo demonstração usa os dados fictícios.
 */
export async function getLiveDigest(user: TeamUser, now = new Date()): Promise<LiveDigest> {
  const includeFinance = user.role === "admin";
  if (!isSupabaseConfigured()) {
    const digest = computeDailyDigest(
      {
        processes: mockProcesses,
        tasks: mockTasks,
        appointments: mockAppointments,
        leads: mockLeads,
        movements: mockMovements,
        payments: mockPayments,
        clients: mockClients,
      },
      { now, includeFinance }
    );
    return { digest, todaySend: null, error: null };
  }

  const supabase = await createClient();
  try {
    const digest = await buildDailyDigest(supabase, { now, includeFinance });
    let todaySend: LiveDigest["todaySend"] = null;
    // A tabela só existe depois de rodar supabase/assistente-fase4.sql: sem ela, só não mostra o envio.
    const { data } = await supabase
      .from("daily_digests")
      .select("whatsapp_sent_at, whatsapp_error")
      .eq("digest_date", isoDateInSaoPaulo(now))
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const row = data as { whatsapp_sent_at: string | null; whatsapp_error: string | null };
      todaySend = { sentAt: row.whatsapp_sent_at, error: row.whatsapp_error };
    }
    return { digest, todaySend, error: null };
  } catch {
    return { digest: null, todaySend: null, error: "Não foi possível montar o resumo agora. Recarregue a página." };
  }
}
