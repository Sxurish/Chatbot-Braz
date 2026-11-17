"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireWriterAction } from "@/lib/auth/require-admin";
import type { DocumentCategory } from "@/lib/types";

// Arquivo "use server": só pode exportar funções async. Exportar estas
// constantes derrubava TODAS as ações da página do lead (tarefa, follow-up,
// caso, agendar, tornar cliente, enviar documento) com erro 500.

/** Tipos de arquivo aceitos para upload (seção 34 do prompt). */
const ACCEPTED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** Tamanho máximo por arquivo: 10 MB. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const BUCKET = "documents";

export interface UploadState {
  ok?: boolean;
  error?: string;
}

/**
 * Upload de documento vinculado a um lead, gravando o arquivo no Supabase
 * Storage (bucket privado) e o metadado na tabela `documents`.
 *
 * Em modo demonstração (sem Supabase) valida o arquivo e retorna sucesso
 * simulado, sem persistir — para que a UI possa ser exercida.
 */
export async function uploadDocumentAction(
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  const leadId = formData.get("leadId") as string;
  const category = (formData.get("category") as DocumentCategory) || "outros";
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    return { error: "Selecione um arquivo." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: "Arquivo excede o limite de 10 MB." };
  }
  if (!ACCEPTED_MIME.includes(file.type)) {
    return { error: "Tipo de arquivo não permitido." };
  }
  const writer = await requireWriterAction();
  if (!writer.ok) return { error: writer.error };

  if (!isSupabaseConfigured()) {
    // Modo demonstração: validação ok, sem persistência real.
    return { ok: true };
  }

  // O id do lead vira parte do caminho do arquivo: só aceita UUID.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId ?? "")) {
    return { error: "Lead inválido." };
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `leads/${leadId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    console.error("[documentos] falha no upload", uploadError.message);
    return { error: "Falha no upload do arquivo." };
  }

  const { data: userData } = await supabase.auth.getUser();

  const { error: insertError } = await supabase.from("documents").insert({
    lead_id: leadId,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    storage_path: path,
    category,
    uploaded_by: userData.user?.id ?? null,
    review_status: "pendente",
  });

  if (insertError) {
    console.error("[documentos] falha ao registrar", insertError.message);
    // Reverte o arquivo órfão no storage.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: "Falha ao registrar o documento." };
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/documentos");
  return { ok: true };
}
