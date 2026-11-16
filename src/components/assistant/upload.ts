"use client";

import { checkAttachment, MAX_IMAGE_SIDE } from "@/lib/assistant/attachment-rules";
import { createClient } from "@/lib/supabase/client";

/**
 * Reduz prints e fotos grandes antes de enviar: a IA lê até ~1568 px no
 * lado maior, então acima disso só gasta envio e tokens.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob || blob.size >= file.size) return file;
  const name = file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

export type UploadMode = "storage" | "inline";

/** Envia o arquivo e devolve o id do anexo para mandar junto com a pergunta. */
export async function uploadAttachment(original: File, mode: UploadMode): Promise<{ id: string; name: string }> {
  const file = await shrinkImage(original);
  const problem = checkAttachment(file);
  if (problem) throw new Error(problem);

  if (mode === "inline") {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/assistente/anexos", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha ao enviar o arquivo.");
    return { id: data.id, name: data.name };
  }

  const res = await fetch("/api/assistente/anexos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Falha ao preparar o envio.");

  const { error } = await createClient()
    .storage.from("documents")
    .uploadToSignedUrl(data.upload.path, data.upload.token, file, { contentType: file.type });
  if (error) throw new Error("Falha ao enviar o arquivo. Confira a conexão e tente de novo.");
  return { id: data.id, name: data.name };
}
