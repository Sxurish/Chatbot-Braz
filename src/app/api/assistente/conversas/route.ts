import { after } from "next/server";
import { cleanupStaleAttachments } from "@/lib/assistant/attachments";
import { getAssistantSession } from "@/lib/assistant/session";
import { AssistantSetupError, listConversations } from "@/lib/assistant/store";

export const dynamic = "force-dynamic";

/** Conversas anteriores de quem está logado. */
export async function GET() {
  const session = await getAssistantSession();
  if (!session) return Response.json({ error: "Faça login." }, { status: 401 });
  // Retenção: anexos que não viraram documento são apagados depois de 7 dias.
  after(() => cleanupStaleAttachments(session.user.id));
  try {
    return Response.json({ conversations: await listConversations(session.user.id) });
  } catch (err) {
    if (err instanceof AssistantSetupError) {
      return Response.json({ error: err.message, conversations: [] }, { status: 503 });
    }
    return Response.json({ error: "Falha ao listar conversas.", conversations: [] }, { status: 500 });
  }
}
