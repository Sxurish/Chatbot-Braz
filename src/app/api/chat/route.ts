import { NextResponse } from "next/server";
import { chatRequestSchema } from "@/lib/chatbot/schema";
import { runTriage } from "@/lib/chatbot/engine";
import { persistLeadFromChat } from "@/lib/data/leads-write";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Requisição inválida.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { message, history, context, consent, persist } = parsed.data;

  // Motor de triagem reutilizável (IA + heurística + segurança comportamental).
  const ai = await runTriage(message, history, context);

  // Persistência opcional do lead/conversa (apenas com consentimento + Supabase).
  if (persist && consent?.given) {
    try {
      const userAgent = req.headers.get("user-agent");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const result = await persistLeadFromChat({
        ai,
        consent: {
          given: consent.given,
          at: consent.at,
          policyVersion: consent.policyVersion,
          channel: "web",
          ip,
          userAgent,
        },
        fullMessage: message,
      });
      if (result.persisted) {
        return NextResponse.json({
          ...ai,
          _leadId: result.leadId,
          _conversationId: result.conversationId,
        });
      }
    } catch (err) {
      console.error("[chat] persist error:", err);
    }
  }

  return NextResponse.json(ai);
}
