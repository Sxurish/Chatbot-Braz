"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { getSettings } from "@/lib/data/settings";
import { LEGAL_AREA_LABELS } from "@/lib/constants";
import {
  DOCX_MIME,
  MAX_TEMPLATE_SIZE,
  TEMPLATE_BUCKET,
} from "@/lib/data/templates-types";
import {
  downloadTemplateFile,
  extractPlaceholders,
  getTemplate,
} from "@/lib/data/templates-read";
import {
  buildAutoFilledData,
  renderDocxTemplate,
} from "@/lib/data/templates-render";
import { DOCUMENTS_BUCKET } from "@/lib/data/documents-read";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Para download imediato após gerar. */
  url?: string;
  /** ID do documento gerado (linha na tabela documents). */
  documentId?: string;
}

const DEMO_NOTICE =
  "Modo demonstração: configure o Supabase e o bucket document_templates para usar a automação documental.";

async function audit(
  supabase: ReturnType<typeof createClient>,
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

  const supabase = createClient();
  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const placeholders = await extractPlaceholders(buffer);

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, buffer, { upsert: false, contentType: file.type });

  if (uploadError) {
    return {
      error:
        "Falha no upload. Verifique se o bucket document_templates existe no Supabase Storage.",
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
  id: z.string().uuid(),
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

  const supabase = createClient();
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

  const supabase = createClient();
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
// Gerar documento (qualquer equipe)
// ---------------------------------------------------------------------------
export async function generateDocumentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const templateId = String(formData.get("template_id") ?? "");
  const leadId = String(formData.get("lead_id") ?? "");
  if (!templateId || !leadId) return { error: "Dados incompletos." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const user = await getCurrentUser();

  const template = await getTemplate(templateId);
  if (!template) return { error: "Template não encontrado." };
  if (!template.active) return { error: "Template está inativo." };

  // Lead + cliente vinculado (se houver).
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Lead não encontrado." };

  const { data: client } = await supabase
    .from("clients")
    .select("full_name, email, phone, city, state")
    .eq("lead_id", leadId)
    .maybeSingle();

  const { data: firstCase } = await supabase
    .from("cases")
    .select("title")
    .eq("lead_id", leadId)
    .limit(1)
    .maybeSingle();

  const settings = await getSettings();

  const autoData = buildAutoFilledData({
    lead,
    client,
    caseTitle: firstCase?.title ?? null,
    office: { name: settings.office_name, data: settings.office },
    legalAreaLabel: lead?.legal_area
      ? LEGAL_AREA_LABELS[lead.legal_area as keyof typeof LEGAL_AREA_LABELS]
      : undefined,
  });

  // Sobrescreve com valores fornecidos pelo usuário (override_<placeholder>).
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("override_") && typeof v === "string" && v.trim()) {
      autoData[k.replace(/^override_/, "")] = v;
    }
  }

  const tplBuffer = await downloadTemplateFile(template.storage_path);
  if (!tplBuffer) return { error: "Falha ao baixar o template." };

  let rendered: Buffer;
  try {
    rendered = await renderDocxTemplate(tplBuffer, autoData);
  } catch (err) {
    console.error("[templates] render error:", err);
    return {
      error:
        "Falha ao renderizar o documento. Verifique se os placeholders do template estão íntegros.",
    };
  }

  const fileName = `${template.name.replace(/[^\w.\-]+/g, "_")}_${Date.now()}.docx`;
  const storagePath = `leads/${leadId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, rendered, {
      upsert: false,
      contentType: DOCX_MIME,
    });
  if (uploadError) return { error: "Falha ao salvar o documento gerado." };

  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      lead_id: leadId,
      file_name: fileName,
      file_type: DOCX_MIME,
      file_size: rendered.length,
      storage_path: storagePath,
      category: template.category,
      uploaded_by: user.id.startsWith("demo") ? null : user.id,
      review_status: "pendente",
    })
    .select("id")
    .single();

  if (insertError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return { error: "Falha ao registrar o documento." };
  }

  // Link de download imediato (60s).
  const { data: signed } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60);

  await audit(supabase, "generate_doc", "document", doc.id, user.id);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/documentos");

  return {
    ok: true,
    url: signed?.signedUrl,
    documentId: doc.id,
  };
}
