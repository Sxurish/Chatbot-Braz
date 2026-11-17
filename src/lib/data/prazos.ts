import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTeamNames } from "@/lib/data/team-names";
import { mockCalculations, mockCalendarDays } from "@/lib/prazos/mock";
import type { CalendarDay, DeadlineCalculation } from "@/lib/prazos/types";

/**
 * Leitura do calendário forense e do histórico de cálculos de prazo
 * (fase 5). Com o Supabase ligado, usa o login de quem está usando (RLS) e
 * nunca mostra dados fictícios.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Dias do calendário de um ano (inclusive os removidos, para a tela). */
export async function listCalendarDays(year: number): Promise<CalendarDay[]> {
  if (!isSupabaseConfigured()) {
    return mockCalendarDays.filter((d) => d.day.startsWith(`${year}-`)).sort((a, b) => a.day.localeCompare(b.day));
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forensic_calendar_days")
    .select("*")
    .eq("court", "TJSP")
    .gte("day", `${year}-01-01`)
    .lte("day", `${year}-12-31`)
    .order("day", { ascending: true });
  if (error || !data) return [];
  return data as CalendarDay[];
}

/** Dias que valem na conta (sem os removidos). A tabela é pequena: lê tudo. */
export async function listActiveCalendarDays(): Promise<CalendarDay[]> {
  if (!isSupabaseConfigured()) return mockCalendarDays.filter((d) => !d.removed_at);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forensic_calendar_days")
    .select("*")
    .eq("court", "TJSP")
    .is("removed_at", null)
    .order("day", { ascending: true })
    .limit(5000);
  if (error || !data) return [];
  return data as CalendarDay[];
}

/** Histórico de cálculos, do mais recente para o mais antigo. */
export async function listCalculations(opts: { processId?: string; limit?: number } = {}): Promise<DeadlineCalculation[]> {
  const limit = opts.limit ?? 20;
  if (!isSupabaseConfigured()) {
    return mockCalculations
      .filter((c) => !opts.processId || c.process_id === opts.processId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  if (opts.processId && !UUID_RE.test(opts.processId)) return [];

  const supabase = await createClient();
  let query = supabase
    .from("deadline_calculations")
    .select("*, process:processes(process_number)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.processId) query = query.eq("process_id", opts.processId);
  const [{ data, error }, names] = await Promise.all([query, getTeamNames()]);
  if (error || !data) return [];
  return (data as (DeadlineCalculation & { process: { process_number: string | null } | null })[]).map(
    ({ process, ...c }) => ({
      ...c,
      created_by_name: c.created_by ? names[c.created_by] ?? null : null,
      process_number: process?.process_number ?? null,
    })
  );
}

/** Um registro do histórico (para confirmar, ajustar ou descartar). */
export async function getCalculation(id: string): Promise<DeadlineCalculation | null> {
  if (!isSupabaseConfigured()) return mockCalculations.find((c) => c.id === id) ?? null;
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("deadline_calculations").select("*").eq("id", id).maybeSingle();
  return (data as DeadlineCalculation | null) ?? null;
}

/** Conta já fechada (confirmada ou descartada)? */
export async function isCalculationClosed(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return mockCalculations.some((c) => c.previous_id === id && c.action !== "ajuste");
  const supabase = await createClient();
  const { data } = await supabase
    .from("deadline_calculations")
    .select("id")
    .eq("previous_id", id)
    .in("action", ["confirmacao", "descarte"])
    .limit(1);
  return Boolean(data?.length);
}
