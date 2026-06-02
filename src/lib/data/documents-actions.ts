"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { DOCUMENTS_BUCKET } from "@/lib/data/documents-read";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  url?: string;
}

const DEMO_NOTICE =
  "Modo demonstração: configure o Supabase para baixar/editar documentos.";

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
      entity_type: "document",
      entity_id: entityId,
    });
  } catch {
    // não bloqueia
  }
}

// ---------------------------------------------------------------------------
// Signed URL para download (60s)
// ---------------------------------------------------------------------------
export async function downloadDocumentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Documento inválido." };
  if (!isSupabaseConfigured()) return { message: DEMO_NOTICE };

  const supabase = createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!doc) return { error: "Documento não encontrado." };

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, 60);

  if (error || !data?.signedUrl) {
    return { error: "Não foi possível gerar o link de download." };
  }

  const user = await getCurrentUser();
  await audit(supabase, "download_doc", id, user.id);
  return { ok: true, url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// Atualizar status de revisão
// ---------------------------------------------------------------------------
const reviewSchema = z.object({
  id: z.string().uuid(),
  review_status: z.enum(["pendente", "revisado", "rejeitado"]),
});

export async function updateReviewStatusAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = reviewSchema.safeParse({
    id: formData.get("id"),
    review_status: formData.get("review_status"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { error } = await supabase
    .from("documents")
    .update({ review_status: parsed.data.review_status })
    .eq("id", parsed.data.id);

  if (error) return { error: "Falha ao atualizar o status." };

  const user = await getCurrentUser();
  await audit(supabase, "update_doc_review", parsed.data.id, user.id);
  revalidatePath("/documentos");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Excluir documento (admin)
// ---------------------------------------------------------------------------
export async function deleteDocumentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Documento inválido." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, lead_id")
    .eq("id", id)
    .maybeSingle();

  if (!doc) return { error: "Documento não encontrado." };

  // Remove o arquivo do storage primeiro; se falhar, ainda exclui a linha
  // (linha órfã é pior do que arquivo órfão — que pode ser limpo depois).
  const { error: storageError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([doc.storage_path]);
  if (storageError) {
    console.error("[documents] storage remove error:", storageError.message);
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return { error: "Falha ao excluir o documento." };

  await audit(supabase, "delete_doc", id, admin.user.id);
  revalidatePath("/documentos");
  if (doc.lead_id) revalidatePath(`/leads/${doc.lead_id}`);
  return { ok: true };
}
