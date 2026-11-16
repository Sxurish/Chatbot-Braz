import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDatajudMovements } from "@/lib/datajud/client";
import { cnjOnlyDigits } from "@/lib/datajud/tribunals";

/**
 * Busca de andamentos no DataJud. A gravação passa sempre pela função
 * merge_datajud_movements do banco, que só ACRESCENTA andamentos: os
 * manuais e os editados pela equipe ficam travados no próprio banco.
 */

export const NOT_FOUND_MESSAGE =
  "Processo não encontrado no DataJud. Pode estar em segredo de justiça ou ainda não ter sido publicado pelo tribunal (o DataJud costuma ter alguns dias de atraso).";

/** Não busca de novo um processo atualizado há menos que isso (rotina diária). */
export const MIN_HOURS_BETWEEN_SYNCS = 18;
const CONCURRENCY = 3;

export interface SyncTarget {
  id: string;
  process_number: string | null;
}

export interface SyncOutcome {
  processId: string;
  ok: boolean;
  inserted: number;
  firstSync: boolean;
  found: boolean;
  message: string;
}

// O cliente pode ser o do usuário (botão "Buscar agora") ou o de serviço (rotina diária).
type AnyClient = SupabaseClient;

export async function syncProcess(supabase: AnyClient, target: SyncTarget): Promise<SyncOutcome> {
  const base = { processId: target.id, inserted: 0, firstSync: false, found: false };
  const result = await fetchDatajudMovements(target.process_number);

  if (!result.ok) {
    // Registra o erro sem mexer em andamento nenhum.
    await supabase.rpc("merge_datajud_movements", {
      p_process_id: target.id,
      p_rows: null,
      p_error: result.error,
    });
    return { ...base, ok: false, message: result.error };
  }

  const { data, error } = await supabase.rpc("merge_datajud_movements", {
    p_process_id: target.id,
    p_rows: result.rows,
    p_error: result.found ? null : NOT_FOUND_MESSAGE,
  });
  if (error) {
    return { ...base, ok: false, message: "Falha ao gravar os andamentos. Confira se o SQL da fase 3 foi rodado." };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { inserted?: number; first_sync?: boolean } | null;
  const inserted = row?.inserted ?? 0;
  const firstSync = Boolean(row?.first_sync);

  // Andamento novo vira notificação (menos na primeira carga, que traz o histórico todo).
  if (inserted > 0 && !firstSync) {
    await supabase.from("notifications").insert({
      user_id: null,
      type: "andamento_novo",
      title:
        inserted === 1
          ? `Andamento novo no processo ${target.process_number ?? ""}`.trim()
          : `${inserted} andamentos novos no processo ${target.process_number ?? ""}`.trim(),
      body: lastDescription(result.rows),
      entity_type: "process",
      entity_id: target.id,
      read: false,
    });
  }

  const message = !result.found
    ? NOT_FOUND_MESSAGE
    : inserted === 0
      ? `Nenhum andamento novo no ${result.tribunal}.`
      : firstSync
        ? `${inserted} andamento${inserted > 1 ? "s" : ""} importado${inserted > 1 ? "s" : ""} do ${result.tribunal}.`
        : `${inserted} andamento${inserted > 1 ? "s" : ""} novo${inserted > 1 ? "s" : ""} do ${result.tribunal}.`;
  return { processId: target.id, ok: true, inserted, firstSync, found: result.found, message };
}

function lastDescription(rows: { occurred_at: string; description: string }[]): string | null {
  const last = rows[rows.length - 1];
  return last ? last.description.slice(0, 280) : null;
}

/** Rotina diária: busca os processos com número CNJ, do mais desatualizado ao mais recente. */
export async function syncDueProcesses(
  supabase: AnyClient,
  opts: { limit?: number; deadlineMs?: number; now?: Date } = {}
): Promise<{ checked: number; inserted: number; failed: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - MIN_HOURS_BETWEEN_SYNCS * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("processes")
    .select("id, process_number, last_synced_at")
    .eq("sync_enabled", true)
    .neq("status", "encerrado")
    .not("process_number", "is", null)
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(opts.limit ?? 200);
  if (error) throw new Error(`Falha ao listar processos: ${error.message}`);

  const all = (data ?? []) as SyncTarget[];
  const targets = all.filter((p) => cnjOnlyDigits(p.process_number).length === 20);
  const totals = { checked: 0, inserted: 0, failed: 0, skipped: all.length - targets.length };
  const deadline = opts.deadlineMs ?? Number.POSITIVE_INFINITY;

  let next = 0;
  async function worker() {
    while (next < targets.length && Date.now() < deadline) {
      const target = targets[next++];
      const out = await syncProcess(supabase, target);
      totals.checked++;
      totals.inserted += out.inserted;
      if (!out.ok) totals.failed++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  return totals;
}
