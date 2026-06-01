import { NextResponse } from "next/server";
import { ingestMessage } from "@/lib/channels/ingest";
import {
  getVerifyToken,
  parseInbound,
  sendText,
  verifySignature,
} from "@/lib/channels/whatsapp";

export const runtime = "nodejs";
// Evita qualquer cache; cada webhook é único.
export const dynamic = "force-dynamic";

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
 * Recebimento de mensagens. Responde 200 rapidamente (a Meta exige) e
 * processa a triagem + persistência + envio da resposta.
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

  const messages = parseInbound(payload);

  // Processa cada mensagem; falhas individuais não derrubam o webhook.
  await Promise.all(
    messages.map(async (msg) => {
      try {
        const result = await ingestMessage(msg);
        if (result.reply && !result.skipped) {
          await sendText(msg.contactId, result.reply);
        }
      } catch (err) {
        console.error("[whatsapp webhook] ingest error:", err);
      }
    })
  );

  // Sempre 200 para a Meta não reenviar em loop.
  return NextResponse.json({ received: true });
}
