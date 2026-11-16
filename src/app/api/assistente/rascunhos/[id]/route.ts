import { z } from "zod";
import { confirmDraft, rejectDraft } from "@/lib/assistant/confirm-draft";
import { getAssistantSession, rateLimited } from "@/lib/assistant/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["confirmar", "descartar"]),
  data: z.record(z.string(), z.union([z.string().max(4000), z.boolean(), z.null()])).optional(),
});

/** Confirma (grava no CRM) ou descarta um rascunho preparado pelo assistente. */
export async function POST(request: Request, { params }: Params) {
  const session = await getAssistantSession();
  if (!session) return Response.json({ error: "Faça login." }, { status: 401 });
  if (rateLimited(`rascunho:${session.user.id}`)) {
    return Response.json({ error: "Muitas ações seguidas. Espere um minuto." }, { status: 429 });
  }
  const { id } = await params;
  if (!z.string().min(1).max(64).safeParse(id).success) {
    return Response.json({ error: "Rascunho inválido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });

  const result =
    parsed.data.action === "confirmar"
      ? await confirmDraft(session, id, parsed.data.data ?? {})
      : await rejectDraft(session, id);
  if (!result.ok) {
    return Response.json({ error: result.error, field: result.field }, { status: result.status ?? 400 });
  }
  return Response.json(result);
}
