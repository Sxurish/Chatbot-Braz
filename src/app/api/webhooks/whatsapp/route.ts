import { after, NextResponse } from "next/server";
import { findTeamMemberByPhone, handleTeamWhatsapp, handleTeamWhatsappMedia } from "@/lib/assistant/whatsapp";
import { ingestMessage } from "@/lib/channels/ingest";
import { dispatchWhatsappPayload } from "@/lib/channels/whatsapp-dispatch";
import { getVerifyToken, sendText, verifySignature } from "@/lib/channels/whatsapp";

export const runtime = "nodejs";
// Evita qualquer cache; cada webhook é único.
export const dynamic = "force-dynamic";
// A resposta do assistente da equipe roda depois do 200 (after) e pode levar
// alguns segundos (consultas ao CRM + IA).
export const maxDuration = 60;

/**
 * Verificação do webhook (handshake da Meta).
 * A Meta chama GET com hub.mode/hub.verify_token/hub.challenge.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === getVerifyToken()) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Recebimento de mensagens. Responde 200 rapidamente (a Meta exige).
 * - Número cadastrado na tela Equipe → assistente da equipe (fase 4), que
 *   roda depois da resposta à Meta.
 * - Qualquer outro número → triagem de clientes + persistência + resposta.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(raw, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Falhas individuais não derrubam o webhook.
  await dispatchWhatsappPayload(payload, {
    // Sem o segredo do app a assinatura não é conferida: o assistente fica desligado.
    teamEnabled: Boolean(process.env.WHATSAPP_APP_SECRET),
    findMember: (contactId) => findTeamMemberByPhone(contactId),
    team: (member, msg) => handleTeamWhatsapp(member, msg),
    teamMedia: (_member, media) => handleTeamWhatsappMedia(media),
    triage: async (msg) => {
      const result = await ingestMessage(msg);
      if (result.reply && !result.skipped) {
        await sendText(msg.contactId, result.reply);
      }
    },
    defer: (task) => after(task),
  });

  // Sempre 200 para a Meta não reenviar em loop.
  return NextResponse.json({ received: true });
}
