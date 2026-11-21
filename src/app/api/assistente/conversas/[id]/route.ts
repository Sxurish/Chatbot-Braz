import { listDrafts } from "@/lib/assistant/drafts";
import { tierOfModel } from "@/lib/assistant/model-router";
import { getAssistantSession } from "@/lib/assistant/session";
import { deleteConversation, getConversation, listMessages } from "@/lib/assistant/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Mensagens e rascunhos de uma conversa (só do próprio usuário). */
export async function GET(_req: Request, { params }: Params) {
  const session = await getAssistantSession();
  if (!session) return Response.json({ error: "Faça login." }, { status: 401 });
  const { id } = await params;
  const conversation = await getConversation(session.user.id, id);
  if (!conversation) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
  const [messages, drafts] = await Promise.all([
    listMessages(session.user.id, id),
    listDrafts(session.user.id, id),
  ]);
  // "tier" alimenta a etiqueta "Resposta detalhada (Sonnet)" nas respostas antigas.
  const withTier = messages.map(({ model, ...m }) => ({
    ...m,
    ...(m.role === "assistant" && tierOfModel(model) ? { tier: tierOfModel(model) } : {}),
  }));
  return Response.json({ conversation, messages: withTier, drafts });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getAssistantSession();
  if (!session) return Response.json({ error: "Faça login." }, { status: 401 });
  const { id } = await params;
  const ok = await deleteConversation(session.user.id, id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
