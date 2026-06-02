"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireAdminAction } from "@/lib/auth/require-admin";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DEMO_NOTICE =
  "Modo demonstração: configure o Supabase para gravar os dados de verdade.";

async function audit(
  supabase: ReturnType<typeof createClient>,
  action: string,
  entityId: string | null,
  userId: string | null
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId && !userId.startsWith("demo") ? userId : null,
      action,
      entity_type: "knowledge_base",
      entity_id: entityId,
    });
  } catch {
    // não bloqueia
  }
}

const entrySchema = z.object({
  title: z
    .string()
    .min(2, "Informe um título com pelo menos 2 caracteres.")
    .max(200, "Título muito longo (máx. 200)."),
  category: z.enum(["mensagem_padrao", "documento_area", "glossario"], {
    errorMap: () => ({ message: "Selecione uma categoria válida." }),
  }),
  content: z
    .string()
    .max(5000, "Conteúdo muito longo (máx. 5000 caracteres).")
    .optional(),
  is_active: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createKnowledgeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const parsed = entrySchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    content: formData.get("content") || undefined,
    is_active: formData.get("is_active") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("knowledge_base")
    .insert({
      title: parsed.data.title,
      category: parsed.data.category,
      content: parsed.data.content ?? null,
      is_active: parsed.data.is_active,
    })
    .select("id")
    .single();

  if (error) return { error: "Falha ao criar a entrada." };
  await audit(supabase, "create_kb", data.id, admin.user.id);
  revalidatePath("/base-conhecimento");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export async function updateKnowledgeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Entrada inválida." };

  const parsed = entrySchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    content: formData.get("content") || undefined,
    is_active: formData.get("is_active") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { error } = await supabase
    .from("knowledge_base")
    .update({
      title: parsed.data.title,
      category: parsed.data.category,
      content: parsed.data.content ?? null,
      is_active: parsed.data.is_active,
    })
    .eq("id", id);

  if (error) return { error: "Falha ao salvar a entrada." };
  await audit(supabase, "update_kb", id, admin.user.id);
  revalidatePath("/base-conhecimento");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Toggle (ativar/desativar)
// ---------------------------------------------------------------------------
export async function toggleKnowledgeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const id = String(formData.get("id") ?? "");
  const next = formData.get("is_active") === "true";
  if (!id) return { error: "Entrada inválida." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { error } = await supabase
    .from("knowledge_base")
    .update({ is_active: next })
    .eq("id", id);

  if (error) return { error: "Falha ao atualizar o status." };
  await audit(supabase, "toggle_kb", id, admin.user.id);
  revalidatePath("/base-conhecimento");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete (hard delete — temos toggle ativo/inativo + audit log)
// ---------------------------------------------------------------------------
export async function deleteKnowledgeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Entrada inválida." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { error } = await supabase.from("knowledge_base").delete().eq("id", id);

  if (error) return { error: "Falha ao excluir a entrada." };
  await audit(supabase, "delete_kb", id, admin.user.id);
  revalidatePath("/base-conhecimento");
  return { ok: true };
}
