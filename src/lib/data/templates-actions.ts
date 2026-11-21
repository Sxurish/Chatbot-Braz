"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireAdminAction, requireWriterAction } from "@/lib/auth/require-admin";
import {
  DOCX_MIME,
  MAX_TEMPLATE_SIZE,
  TEMPLATE_BUCKET,
} from "@/lib/data/templates-types";
import { extractPlaceholders, getTemplate } from "@/lib/data/templates-read";
import {
  generateDocumentFromTemplate,
  TEMPLATE_DEMO_NOTICE,
} from "@/lib/data/templates-generate";
import {
  canGenerateFromTemplates,
  TEMPLATE_ROLE_DENIED,
} from "@/lib/data/templates-permissions";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Para download imediato após gerar. */
  url?: string;
  /** ID do documento gerado (linha na tabela documents). */
  documentId?: string;
}

const DEMO_NOTICE = TEMPLATE_DEMO_NOTICE;

async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
  entityType: string,
  entityId: string | null,
  userId: string | null
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId && !userId.startsWith("demo") ? userId : null,
      action,
      entity_type: entityType,
      entity_id: entityId,
    });
  } catch {
    // não bloqueia
  }
}

// ---------------------------------------------------------------------------
// Upload de template (admin)
// ---------------------------------------------------------------------------
export async function uploadTemplateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const category = (formData.get("category") as string) || "outros";
  const file = formData.get("file") as File | null;

  if (!name || name.length < 2) return { error: "Informe um nome." };
  if (!file || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_TEMPLATE_SIZE)
    return { error: "Arquivo excede o limite de 5 MB." };
  if (file.type !== DOCX_MIME)
    return { error: "Apenas arquivos .docx são aceitos." };

  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const placeholders = await extractPlaceholders(buffer);

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, buffer, { upsert: false, contentType: file.type });

  if (uploadError) {
    console.error("[templates] falha no upload", uploadError.message);
    return {
      error:
        "Falha no upload. Rode supabase/correcao-cadastros.sql no Supabase (cria o bucket document_templates e as regras de acesso).",
    };
  }

  const { data, error: insertError } = await supabase
    .from("document_templates")
    .insert({
      name,
      description: description || null,
      category,
      storage_path: path,
      placeholders,
      active: true,
      created_by: admin.user.id.startsWith("demo") ? null : admin.user.id,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[templates] falha ao registrar", insertError.message);
    await supabase.storage.from(TEMPLATE_BUCKET).remove([path]);
    return { error: "Falha ao registrar o template." };
  }

  await audit(supabase, "create_template", "template", data.id, admin.user.id);
  revalidatePath("/templates");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Atualizar template (nome/descrição/categoria/ativo) — admin
// ---------------------------------------------------------------------------
const updateSchema = z.object({
  // No modo demonstração os registros de exemplo usam ids curtos.
  id: z
    .string()
    .refine(
      (v) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ||
        !isSupabaseConfigured(),
      "Template inválido."
    ),
  name: z.string().min(2, "Informe um nome."),
  description: z.string().optional(),
  category: z.string().min(1).default("outros"),
  active: z.boolean().default(true),
});

export async function updateTemplateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    category: formData.get("category") || "outros",
    active: formData.get("active") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const { error } = await supabase
    .from("document_templates")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      active: parsed.data.active,
    })
    .eq("id", parsed.data.id);

  if (error) return { error: "Falha ao salvar o template." };
  await audit(
    supabase,
    "update_template",
    "template",
    parsed.data.id,
    admin.user.id
  );
  revalidatePath("/templates");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Excluir template (admin)
// ---------------------------------------------------------------------------
export async function deleteTemplateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Template inválido." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();
  const template = await getTemplate(id);
  if (!template) return { error: "Template não encontrado." };

  await supabase.storage
    .from(TEMPLATE_BUCKET)
    .remove([template.storage_path]);
  const { error } = await supabase
    .from("document_templates")
    .delete()
    .eq("id", id);

  if (error) return { error: "Falha ao excluir o template." };
  await audit(supabase, "delete_template", "template", id, admin.user.id);
  revalidatePath("/templates");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Gerar documento (Advogado(a) e Admin)
// ---------------------------------------------------------------------------
export async function generateDocumentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const templateId = String(formData.get("template_id") ?? "");
  const leadId = String(formData.get("lead_id") ?? "");
  if (!templateId || !leadId) return { error: "Dados incompletos." };
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };
  // Só Advogado(a) e Admin geram documentos de modelo.
  if (!canGenerateFromTemplates(writer.user.role)) return { error: TEMPLATE_ROLE_DENIED };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  // Sobrescreve com valores fornecidos pelo usuário (override_<placeholder>).
  const overrides: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("override_") && typeof v === "string" && v.trim()) {
      overrides[k.replace(/^override_/, "")] = v;
    }
  }

  const result = await generateDocumentFromTemplate({
    templateId,
    leadId,
    overrides,
    user: { id: writer.user.id, role: writer.user.role },
    channel: "painel",
  });
  if (!result.ok) return { error: result.error };

  return {
    ok: true,
    url: result.url,
    documentId: result.documentId,
  };
}
