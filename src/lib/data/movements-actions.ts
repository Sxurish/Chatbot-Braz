"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { syncProcess } from "@/lib/datajud/sync";

export interface MovementActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DEMO_NOTICE = "Modo demonstração: configure o Supabase para gravar os andamentos.";
// Com o Supabase, ids são UUID; no modo demonstração os registros de exemplo
// usam ids curtos (proc-001, mov-001).
const UUID_RE = /^[0-9a-f-]{36}$/i;
const DEMO_ID_RE = /^[a-z]+-\d{3}$/;
const uuid = z
  .string()
  .refine((v) => UUID_RE.test(v) || (!isSupabaseConfigured() && DEMO_ID_RE.test(v)), "Registro inválido.");

const movementSchema = z.object({
  process_id: uuid,
  occurred_at: z
    .string()
    .min(1, "Informe a data do andamento.")
    .refine((v) => !Number.isNaN(Date.parse(toIso(v))), "Data inválida."),
  description: z.string().trim().min(3, "Descreva o andamento.").max(2000, "Texto longo demais (máx. 2.000)."),
});

/** "2026-11-16" ou "2026-11-16T14:30" no horário de Brasília. */
function toIso(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00-03:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return `${value}-03:00`;
  return value;
}

async function guard(): Promise<{ error: string } | { userId: string }> {
  const user = await getCurrentUser();
  if (!user.active) return { error: "Perfil inativo." };
  if (user.role === "visualizador") return { error: "Seu perfil só pode consultar." };
  return { userId: user.id };
}

async function audit(action: string, entityId: string, userId: string, metadata: Record<string, unknown> = {}) {
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      user_id: userId.startsWith("demo") ? null : userId,
      action,
      entity_type: "process_movement",
      entity_id: entityId,
      metadata,
    });
  } catch {
    // auditoria não bloqueia
  }
}

function done(processId: string, message?: string): MovementActionState {
  revalidatePath(`/processos/${processId}`);
  return { ok: true, message };
}

/** Lança um andamento manual (nasce travado: a busca automática nunca o altera). */
export async function createMovementAction(_prev: MovementActionState, formData: FormData): Promise<MovementActionState> {
  const parsed = movementSchema.safeParse({
    process_id: formData.get("process_id"),
    occurred_at: formData.get("occurred_at"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const g = await guard();
  if ("error" in g) return g;
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("process_movements")
    .insert({
      process_id: parsed.data.process_id,
      occurred_at: new Date(toIso(parsed.data.occurred_at)).toISOString(),
      description: parsed.data.description,
      source: "manual",
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Falha ao lançar o andamento." };
  await audit("create_movement", data.id, g.userId, { process_id: parsed.data.process_id });
  return done(parsed.data.process_id, "Andamento lançado.");
}

/** Corrige um andamento. Depois de editado ele fica travado (regra do banco). */
export async function updateMovementAction(_prev: MovementActionState, formData: FormData): Promise<MovementActionState> {
  const id = uuid.safeParse(formData.get("id"));
  const parsed = movementSchema.safeParse({
    process_id: formData.get("process_id"),
    occurred_at: formData.get("occurred_at"),
    description: formData.get("description"),
  });
  if (!id.success) return { error: "Andamento inválido." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const g = await guard();
  if ("error" in g) return g;
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("process_movements")
    .update({
      occurred_at: new Date(toIso(parsed.data.occurred_at)).toISOString(),
      description: parsed.data.description,
    })
    .eq("id", id.data)
    .eq("process_id", parsed.data.process_id)
    .select("id");
  if (error || !data?.length) return { error: "Falha ao salvar o andamento." };
  await audit("update_movement", id.data, g.userId, { process_id: parsed.data.process_id });
  return done(parsed.data.process_id, "Andamento corrigido e travado.");
}

/**
 * Remove um andamento. Manual: apaga. Do tribunal: só oculta (se apagasse,
 * a próxima busca traria de volta).
 */
export async function removeMovementAction(_prev: MovementActionState, formData: FormData): Promise<MovementActionState> {
  const id = uuid.safeParse(formData.get("id"));
  const processId = uuid.safeParse(formData.get("process_id"));
  if (!id.success || !processId.success) return { error: "Andamento inválido." };
  const g = await guard();
  if ("error" in g) return g;
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("process_movements")
    .select("id, source")
    .eq("id", id.data)
    .eq("process_id", processId.data)
    .maybeSingle();
  if (!row) return { error: "Andamento não encontrado." };

  if (row.source === "manual") {
    const { error } = await supabase.from("process_movements").delete().eq("id", id.data);
    if (error) return { error: "Falha ao apagar o andamento." };
    await audit("delete_movement", id.data, g.userId, { process_id: processId.data });
    return done(processId.data, "Andamento apagado.");
  }
  const { error } = await supabase.from("process_movements").update({ hidden: true }).eq("id", id.data);
  if (error) return { error: "Falha ao ocultar o andamento." };
  await audit("hide_movement", id.data, g.userId, { process_id: processId.data });
  return done(processId.data, "Andamento ocultado. A busca automática não o traz de volta.");
}

/** Liga ou desliga a busca automática de um processo (ex.: segredo de justiça). */
export async function setProcessSyncAction(_prev: MovementActionState, formData: FormData): Promise<MovementActionState> {
  const processId = uuid.safeParse(formData.get("process_id"));
  if (!processId.success) return { error: "Processo inválido." };
  const enabled = formData.get("enabled") === "true";
  const g = await guard();
  if ("error" in g) return g;
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { error } = await supabase.from("processes").update({ sync_enabled: enabled }).eq("id", processId.data);
  if (error) return { error: "Falha ao alterar a busca automática." };
  try {
    await supabase.from("audit_logs").insert({
      user_id: g.userId.startsWith("demo") ? null : g.userId,
      action: enabled ? "enable_process_sync" : "disable_process_sync",
      entity_type: "process",
      entity_id: processId.data,
    });
  } catch {
    // não bloqueia
  }
  return done(processId.data, enabled ? "Busca automática ligada." : "Busca automática desligada.");
}

/** Botão "Buscar agora": consulta o DataJud para um processo. */
export async function syncProcessNowAction(_prev: MovementActionState, formData: FormData): Promise<MovementActionState> {
  const processId = uuid.safeParse(formData.get("process_id"));
  if (!processId.success) return { error: "Processo inválido." };
  const g = await guard();
  if ("error" in g) return g;
  if (!isSupabaseConfigured()) {
    return { ok: true, message: "Modo demonstração: a busca no DataJud só funciona com o Supabase configurado." };
  }

  const supabase = await createClient();
  const { data: process } = await supabase
    .from("processes")
    .select("id, process_number, last_synced_at")
    .eq("id", processId.data)
    .maybeSingle();
  if (!process) return { error: "Processo não encontrado." };

  // Evita cliques repetidos martelando o DataJud.
  if (process.last_synced_at && Date.now() - Date.parse(process.last_synced_at) < 60_000) {
    return { ok: true, message: "Buscado há menos de 1 minuto. Aguarde um pouco para buscar de novo." };
  }

  const out = await syncProcess(supabase, process);
  revalidatePath(`/processos/${processId.data}`);
  return out.ok ? { ok: true, message: out.message } : { error: out.message };
}
