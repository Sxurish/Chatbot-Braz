import { NextResponse } from "next/server";
import { z } from "zod";
import { aiResponseSchema } from "@/lib/chatbot/schema";
import { buildConversationSummary } from "@/lib/chatbot/summary";
import { finalizeConversation } from "@/lib/data/leads-write";

export const runtime = "nodejs";

const finalizeSchema = z.object({
  leadId: z.string(),
  conversationId: z.string().optional(),
  ai: aiResponseSchema,
  consent: z.object({
    given: z.boolean(),
    at: z.string(),
    policyVersion: z.string(),
  }),
});

/**
 * Encerra a conversa: gera o resumo interno final (Fase 4) e o persiste,
 * criando também a notificação interna para a equipe.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = finalizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Requisição inválida.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { leadId, conversationId, ai, consent } = parsed.data;

  const summary = buildConversationSummary(ai, {
    given: consent.given,
    at: consent.at,
    policyVersion: consent.policyVersion,
    channel: "chatbot",
  });

  try {
    const result = await finalizeConversation({ leadId, conversationId, summary });
    return NextResponse.json({ ok: result.ok, summary });
  } catch (err) {
    console.error("[finalize] error:", err);
    return NextResponse.json({ ok: false, summary });
  }
}
