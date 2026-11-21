import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSettings } from "@/lib/data/settings";
import { LEGAL_AREA_LABELS } from "@/lib/constants";
import { DOCX_MIME, isAutoFilled, type DocumentTemplate } from "@/lib/data/templates-types";
import { downloadTemplateFile, getTemplate } from "@/lib/data/templates-read";
import { buildAutoFilledData, renderDocxTemplate } from "@/lib/data/templates-render";
import { DOCUMENTS_BUCKET } from "@/lib/data/documents-read";
import { checkTemplateGeneration, type TemplateChannel } from "@/lib/data/templates-permissions";
import type { Lead, UserRole } from "@/lib/types";

/**
 * Geração de documento a partir de um modelo .docx (tela Templates). Usada
 * pelo botão "Gerar documento" da ficha do lead (generateDocumentAction) e
 * pelo assistente (rascunho "modelo", depois do Confirmar ou do OK no
 * WhatsApp). A permissão é conferida aqui também, sempre no servidor.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TEMPLATE_DEMO_NOTICE =
  "Modo demonstração: configure o Supabase e o bucket document_templates para usar a automação documental.";

export interface TemplateUser {
  id: string;
  role: UserRole;
}

export type GenerateResult =
  | {
      ok: true;
      documentId: string;
      fileName: string;
      /** Link assinado para baixar agora (curto; nunca vai para o WhatsApp). */
      url?: string;
      /** Ficha do lead no CRM, onde o documento fica (exige login). */
      link: string;
    }
  | { ok: false; error: string };

export interface TemplatePreview {
  template: DocumentTemplate;
  lead: Lead;
  /** Valores dos campos automáticos que serão usados. */
  autoData: Record<string, string>;
  /** Campos do modelo que a equipe precisa preencher. */
  manualFields: string[];
}

/** Modelo + lead + valores automáticos, sem gerar nada. */
export async function loadTemplatePreview(
  templateId: string,
  leadId: string
): Promise<{ ok: true; preview: TemplatePreview } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: TEMPLATE_DEMO_NOTICE };
  // O id do lead vira parte do caminho do arquivo: só aceita UUID.
  if (!UUID_RE.test(leadId)) return { ok: false, error: "Lead inválido." };

  const supabase = await createClient();

  const template = await getTemplate(templateId);
  if (!template) return { ok: false, error: "Template não encontrado." };
  if (!template.active) return { ok: false, error: "Template está inativo." };

  // Lead + cliente vinculado (se houver).
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return { ok: false, error: "Lead não encontrado." };

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

  return {
    ok: true,
    preview: {
      template,
      lead: lead as Lead,
      autoData,
      manualFields: (template.placeholders ?? []).filter((p) => !isAutoFilled(p)).sort(),
    },
  };
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Fora de um pedido do navegador (WhatsApp) o Next pode recusar; o documento já foi gerado.
  }
}

/**
 * Gera o .docx preenchido, salva no bucket de documentos (leads/<id>/...),
 * registra em `documents` (revisão pendente) e no log de auditoria.
 */
export async function generateDocumentFromTemplate(input: {
  templateId: string;
  leadId: string;
  /** Valores digitados pela equipe; sobrescrevem os automáticos. */
  overrides?: Record<string, string>;
  user: TemplateUser;
  channel?: TemplateChannel;
  /** Validade do link de download imediato, em segundos. */
  downloadTtlSeconds?: number;
  /** Detalhes extras para o log de auditoria (ex.: id do rascunho). */
  auditMeta?: Record<string, unknown>;
}): Promise<GenerateResult> {
  const { templateId, leadId, user } = input;
  if (!templateId || !leadId) return { ok: false, error: "Dados incompletos." };

  const loaded = await loadTemplatePreview(templateId, leadId);
  if (!loaded.ok) return loaded;
  const { template, autoData } = loaded.preview;

  // Permissão pelo modelo real (nunca pelo que o navegador ou a IA disseram).
  const allowed = checkTemplateGeneration(user.role, template, input.channel ?? "painel");
  if (!allowed.ok) return allowed;

  const data = { ...autoData };
  for (const [k, v] of Object.entries(input.overrides ?? {})) {
    if (typeof v === "string" && v.trim()) data[k] = v;
  }

  const tplBuffer = await downloadTemplateFile(template.storage_path);
  if (!tplBuffer) return { ok: false, error: "Falha ao baixar o template." };

  let rendered: Buffer;
  try {
    rendered = await renderDocxTemplate(tplBuffer, data);
  } catch (err) {
    console.error("[templates] render error:", err);
    return {
      ok: false,
      error: "Falha ao renderizar o documento. Verifique se os placeholders do template estão íntegros.",
    };
  }

  const supabase = await createClient();
  const fileName = `${template.name.replace(/[^\w.\-]+/g, "_")}_${Date.now()}.docx`;
  const storagePath = `leads/${leadId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, rendered, { upsert: false, contentType: DOCX_MIME });
  if (uploadError) return { ok: false, error: "Falha ao salvar o documento gerado." };

  const realUser = user.id && !user.id.startsWith("demo") ? user.id : null;
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      lead_id: leadId,
      file_name: fileName,
      file_type: DOCX_MIME,
      file_size: rendered.length,
      storage_path: storagePath,
      category: template.category,
      uploaded_by: realUser,
      review_status: "pendente",
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return { ok: false, error: "Falha ao registrar o documento." };
  }

  // Link de download imediato.
  const { data: signed } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, input.downloadTtlSeconds ?? 60);

  try {
    await supabase.from("audit_logs").insert({
      user_id: realUser,
      action: "generate_doc",
      entity_type: "document",
      entity_id: doc.id,
      metadata: {
        template_id: template.id,
        template_name: template.name,
        lead_id: leadId,
        channel: input.channel ?? "painel",
        ...(input.auditMeta ?? {}),
      },
    });
  } catch {
    // não bloqueia
  }

  safeRevalidate(`/leads/${leadId}`);
  safeRevalidate("/documentos");

  return {
    ok: true,
    documentId: doc.id as string,
    fileName,
    url: signed?.signedUrl,
    link: `/leads/${leadId}`,
  };
}
