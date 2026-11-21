import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OFFICE_OAB } from "@/lib/constants";
import { DOCUMENTS_BUCKET } from "@/lib/data/documents-read";
import { getSettings } from "@/lib/data/settings";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAssistantSession, rateLimited, type AssistantSession } from "@/lib/assistant/session";
import { buildMinutaDocx, DOCX_MIME, minutaFileName } from "@/lib/minutas/docx";
import { auditMinuta, getMinuta, markMinutaSaved, updateMinutaText } from "@/lib/minutas/store";
import {
  canDraftMinuta,
  MINUTA_DOC_CATEGORY,
  MINUTA_MAX_BODY,
  MINUTA_MAX_TITLE,
  type MinutaView,
} from "@/lib/minutas/types";

/**
 * Ações das rotas /api/assistente/minutas/*: conferem o login, o papel
 * (Admin ou Advogado) e o dono da minuta antes de qualquer coisa.
 */

export const minutaTextSchema = z.object({
  title: z.string().trim().min(1, "Dê um título à minuta.").max(MINUTA_MAX_TITLE, "Título muito longo."),
  body: z.string().trim().min(1, "A minuta está vazia.").max(MINUTA_MAX_BODY, "Minuta muito longa."),
});
export type MinutaText = z.infer<typeof minutaTextSchema>;

type Access = { ok: true; session: AssistantSession; minuta: MinutaView } | { ok: false; response: Response };

const deny = (error: string, status: number): Access => ({
  ok: false,
  response: Response.json({ error }, { status }),
});

/** Login + papel + dono da minuta. */
export async function minutaAccess(id: string): Promise<Access> {
  const session = await getAssistantSession();
  if (!session) return deny("Faça login.", 401);
  if (!canDraftMinuta(session.user.role)) {
    return deny("Minutas são só para Admin e Advogado(a).", 403);
  }
  if (rateLimited(`minuta:${session.user.id}`)) return deny("Muitas ações seguidas. Espere um minuto.", 429);
  if (!z.string().min(1).max(64).safeParse(id).success) return deny("Minuta inválida.", 400);
  const minuta = await getMinuta(session.user.id, id);
  if (!minuta) return deny("Minuta não encontrada.", 404);
  return { ok: true, session, minuta };
}

/** Lê o texto editado do corpo do pedido. */
export async function readMinutaText(
  request: Request,
): Promise<{ ok: true; text: MinutaText } | { ok: false; response: Response }> {
  const parsed = minutaTextSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json({ error: parsed.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 }),
    };
  }
  return { ok: true, text: parsed.data };
}

export async function renderMinutaDocx(text: MinutaText): Promise<Buffer> {
  const settings = await getSettings();
  return buildMinutaDocx({
    officeName: settings.office_name,
    oab: settings.office.oab || OFFICE_OAB,
    title: text.title,
    body: text.body,
  });
}

export type SaveResult =
  | { ok: true; message: string; documentId: string | null; link: string }
  | { ok: false; error: string; status: number };

function linkFor(m: MinutaView): string {
  if (m.refs.process_id) return `/processos/${encodeURIComponent(m.refs.process_id)}`;
  if (m.refs.lead_id) return `/leads/${encodeURIComponent(m.refs.lead_id)}`;
  return "/documentos";
}

/** Gera o .docx e grava em Documentos (bucket + tabela), ligado ao processo/caso/lead/cliente da minuta. */
export async function saveMinutaToDocuments(
  session: AssistantSession,
  minuta: MinutaView,
  text: MinutaText,
): Promise<SaveResult> {
  const { user } = session;
  if (minuta.status === "salva") {
    return { ok: false, status: 409, error: "Esta minuta já foi salva em Documentos." };
  }
  const { refs } = minuta;
  if (!refs.process_id && !refs.case_id && !refs.lead_id && !refs.client_id) {
    return { ok: false, status: 400, error: "A minuta não está ligada a nenhum registro do CRM." };
  }
  await updateMinutaText(user.id, minuta.id, text);
  const link = linkFor(minuta);

  if (!isSupabaseConfigured()) {
    await markMinutaSaved(user.id, minuta.id, null);
    return {
      ok: true,
      documentId: null,
      link,
      message: "Modo demonstração: a minuta foi conferida, mas nada foi gravado.",
    };
  }

  const bytes = await renderMinutaDocx(text);
  const fileName = minutaFileName(text.title);
  const storagePath = `minutas/${user.id}/${minuta.id}-${Date.now()}.docx`;
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, bytes, { upsert: false, contentType: DOCX_MIME });
  if (uploadError) {
    console.error("[minutas] upload", uploadError.message);
    return { ok: false, status: 500, error: "Não consegui salvar o arquivo agora. Tente de novo." };
  }
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      process_id: refs.process_id,
      case_id: refs.case_id,
      lead_id: refs.lead_id,
      client_id: refs.client_id,
      file_name: fileName,
      file_type: DOCX_MIME,
      file_size: bytes.length,
      storage_path: storagePath,
      category: MINUTA_DOC_CATEGORY,
      uploaded_by: user.id,
      review_status: "pendente",
    })
    .select("id")
    .single();
  if (error || !doc) {
    console.error("[minutas] documento", error?.message);
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return { ok: false, status: 500, error: "Não consegui registrar o documento agora. Tente de novo." };
  }
  const documentId = doc.id as string;
  await markMinutaSaved(user.id, minuta.id, documentId);
  await auditMinuta(user.id, "assistant_minuta_save", "document", documentId, {
    minuta_id: minuta.id,
    tipo: minuta.tipo,
    ...refs,
  });
  for (const path of ["/documentos", link]) {
    try {
      revalidatePath(path);
    } catch {
      // cache: não bloqueia
    }
  }
  return { ok: true, documentId, link, message: "Minuta salva em Documentos, com revisão pendente." };
}
