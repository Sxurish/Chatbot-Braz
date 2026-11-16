import { z } from "zod";
import { checkAttachment, isAllowedMime, maxBytesFor } from "@/lib/assistant/attachment-rules";
import { createUpload, saveDemoFile } from "@/lib/assistant/attachments";
import { canWrite } from "@/lib/assistant/confirm-draft";
import { getAssistantSession, rateLimited } from "@/lib/assistant/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.string().max(60),
  size: z.number().int().positive(),
});

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/**
 * Prepara o envio de um arquivo para o assistente.
 * - Com Supabase: recebe nome/tipo/tamanho e devolve uma URL assinada; o
 *   navegador envia o arquivo direto para o Storage (sem passar pela Vercel).
 * - Modo demonstração: recebe o próprio arquivo (multipart) e guarda na memória.
 */
export async function POST(request: Request) {
  const session = await getAssistantSession();
  if (!session) return json({ error: "Faça login para usar o assistente." }, 401);
  if (!canWrite(session)) return json({ error: "Seu papel na equipe é só de visualização." }, 403);
  if (rateLimited(`anexo:${session.user.id}`)) {
    return json({ error: "Muitos envios seguidos. Espere um minuto." }, 429);
  }

  if (!isSupabaseConfigured()) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return json({ error: "Envie o arquivo." }, 400);
    const problem = checkAttachment({ name: file.name, type: file.type, size: file.size });
    if (problem) return json({ error: problem }, 400);
    const row = saveDemoFile(session.user.id, file.name, Buffer.from(await file.arrayBuffer()));
    if (!row) return json({ error: "O conteúdo não parece um PDF ou imagem válido." }, 400);
    return json({ id: row.id, name: row.file_name });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Pedido inválido." }, 400);
  const { name, type, size } = parsed.data;
  if (!isAllowedMime(type)) return json({ error: checkAttachment({ name, type, size }) }, 400);
  if (size > maxBytesFor(type)) return json({ error: checkAttachment({ name, type, size }) }, 400);

  try {
    const upload = await createUpload(session.user.id, { name, mime: type, size });
    return json({ id: upload.id, name, upload: { path: upload.path, token: upload.token } });
  } catch (err) {
    console.error("[assistente] anexo", err);
    return json(
      { error: "Não foi possível preparar o envio. Confira se o arquivo supabase/assistente-fase2.sql já foi rodado." },
      500
    );
  }
}
