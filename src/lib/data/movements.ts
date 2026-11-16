import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { mockMovements, mockProcesses } from "@/lib/mock-data-crm";
import type { Process, ProcessMovement } from "@/lib/types";

/**
 * Leitura de processos e andamentos (fase 3). Com o Supabase ligado,
 * consulta com o login de quem está usando (RLS).
 */

export interface MovementWithNames extends ProcessMovement {
  created_by_name: string | null;
  edited_by_name: string | null;
}

export async function getProcess(id: string): Promise<Process | null> {
  if (!isSupabaseConfigured()) return mockProcesses.find((p) => p.id === id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("processes").select("*").eq("id", id).maybeSingle();
  return (data as Process | null) ?? null;
}

/** Andamentos de um processo, do mais recente para o mais antigo. */
export async function listMovements(
  processId: string,
  opts: { includeHidden?: boolean } = {}
): Promise<MovementWithNames[]> {
  if (!isSupabaseConfigured()) {
    return mockMovements
      .filter((m) => m.process_id === processId && (opts.includeHidden || !m.hidden))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .map((m) => ({
        ...m,
        created_by_name: m.created_by ? "Dr. Jean Braz" : null,
        edited_by_name: m.edited_by ? "Dr. Jean Braz" : null,
      }));
  }
  const supabase = await createClient();
  let query = supabase
    .from("process_movements")
    .select("*, creator:users!process_movements_created_by_fkey(name), editor:users!process_movements_edited_by_fkey(name)")
    .eq("process_id", processId)
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (!opts.includeHidden) query = query.eq("hidden", false);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as (ProcessMovement & { creator: { name: string } | null; editor: { name: string } | null })[]).map(
    ({ creator, editor, ...m }) => ({
      ...m,
      created_by_name: creator?.name ?? null,
      edited_by_name: editor?.name ?? null,
    })
  );
}
