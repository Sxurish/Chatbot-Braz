import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  ATTACHMENT_RETENTION_DAYS,
  detectMime,
  type AttachmentMime,
} from "@/lib/assistant/attachment-rules";

/**
 * Anexos do assistente (PDF e prints).
 * Com Supabase: o navegador envia o arquivo direto para o Storage (bucket
 * privado "documents", pasta assistente/<usuário>/) com uma URL assinada;
 * o servidor só baixa na hora de mandar para a IA. Sem Supabase (modo
 * demonstração): o arquivo fica na memória do servidor.
 */

export const BUCKET = "documents";

export interface AttachmentRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: AttachmentMime;
  size_bytes: number;
  document_id: string | null;
  created_at: string;
}

interface DemoFile extends AttachmentRow {
  bytes: Buffer;
}

const g = globalThis as unknown as { __assistantFiles?: Map<string, DemoFile> };
function demoFiles() {
  g.__assistantFiles ??= new Map();
  return g.__assistantFiles;
}

function extensionFor(mime: AttachmentMime) {
  return { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[mime];
}

export function cleanFileName(name: string): string {
  const base = name.replace(/[\\/]/g, " ").replace(/[\u0000-\u001f]/g, "").trim();
  return (base || "arquivo").slice(0, 160);
}

/** Supabase: registra o anexo e devolve a URL assinada para o navegador enviar o arquivo. */
export async function createUpload(
  userId: string,
  input: { name: string; mime: AttachmentMime; size: number }
): Promise<{ id: string; path: string; token: string }> {
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const path = `assistente/${userId}/${id}.${extensionFor(input.mime)}`;
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed) throw new Error(`Falha ao preparar o envio: ${signError?.message}`);

  const { error } = await supabase.from("assistant_attachments").insert({
    id,
    user_id: userId,
    storage_path: path,
    file_name: cleanFileName(input.name),
    mime_type: input.mime,
    size_bytes: input.size,
  });
  if (error) throw new Error(`Falha ao registrar o anexo: ${error.message}`);
  return { id, path, token: signed.token };
}

/** Modo demonstração: guarda o arquivo na memória. */
export function saveDemoFile(userId: string, name: string, bytes: Buffer): AttachmentRow | null {
  const mime = detectMime(bytes);
  if (!mime) return null;
  const id = crypto.randomUUID();
  const row: DemoFile = {
    id,
    user_id: userId,
    conversation_id: null,
    storage_path: `demo/${id}`,
    file_name: cleanFileName(name),
    mime_type: mime,
    size_bytes: bytes.length,
    document_id: null,
    created_at: new Date().toISOString(),
    bytes,
  };
  demoFiles().set(id, row);
  return row;
}

export async function getAttachment(userId: string, id: string): Promise<AttachmentRow | null> {
  if (!isSupabaseConfigured()) {
    const f = demoFiles().get(id);
    if (!f || f.user_id !== userId) return null;
    const { bytes: _bytes, ...row } = f;
    void _bytes;
    return row;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_attachments")
    .select("id, user_id, conversation_id, storage_path, file_name, mime_type, size_bytes, document_id, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as AttachmentRow | null) ?? null;
}

/**
 * Baixa o arquivo para mandar à IA. Confere o tipo pelo conteúdo (não pela
 * extensão) e o tamanho. Devolve null se o arquivo não existe ou não confere.
 */
export async function readAttachment(
  userId: string,
  id: string
): Promise<{ row: AttachmentRow; base64: string } | null> {
  const row = await getAttachment(userId, id);
  if (!row) return null;

  let bytes: Buffer;
  if (!isSupabaseConfigured()) {
    bytes = demoFiles().get(id)!.bytes;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(BUCKET).download(row.storage_path);
    if (error || !data) return null;
    bytes = Buffer.from(await data.arrayBuffer());
  }
  const mime = detectMime(bytes);
  if (!mime || mime !== row.mime_type || bytes.length > row.size_bytes + 1024) return null;
  return { row, base64: bytes.toString("base64") };
}

export async function linkAttachmentToConversation(userId: string, id: string, conversationId: string) {
  if (!isSupabaseConfigured()) {
    const f = demoFiles().get(id);
    if (f && f.user_id === userId) f.conversation_id = conversationId;
    return;
  }
  const supabase = await createClient();
  await supabase
    .from("assistant_attachments")
    .update({ conversation_id: conversationId })
    .eq("id", id)
    .eq("user_id", userId);
}

/**
 * Retenção: anexos que não viraram documento do CRM são apagados (arquivo e
 * registro) depois de alguns dias. Best-effort, roda ao abrir o histórico.
 */
export async function cleanupStaleAttachments(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await createClient();
    const cutoff = new Date(Date.now() - ATTACHMENT_RETENTION_DAYS * 86_400_000).toISOString();
    const { data } = await supabase
      .from("assistant_attachments")
      .select("id, storage_path")
      .eq("user_id", userId)
      .is("document_id", null)
      .lt("created_at", cutoff)
      .limit(50);
    if (!data?.length) return;
    await supabase.storage.from(BUCKET).remove(data.map((d) => d.storage_path as string));
    await supabase
      .from("assistant_attachments")
      .delete()
      .in(
        "id",
        data.map((d) => d.id as string)
      );
  } catch (err) {
    console.error("[assistente] limpeza de anexos", err);
  }
}
