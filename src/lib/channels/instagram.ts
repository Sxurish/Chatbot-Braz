import "server-only";
import crypto from "crypto";
import type { InboundMessage } from "./types";

/**
 * Integração com a Instagram Messaging API (Meta Graph API).
 * Usa a mesma infraestrutura do WhatsApp (mesma Graph API), mudando apenas o
 * formato do payload e o endpoint de envio.
 *
 * Variáveis de ambiente necessárias:
 *  - INSTAGRAM_VERIFY_TOKEN  (verificação do webhook)
 *  - INSTAGRAM_APP_SECRET    (validação da assinatura X-Hub-Signature-256)
 *  - INSTAGRAM_ACCESS_TOKEN  (envio de mensagens — token da página/conta IG)
 */

const GRAPH_VERSION = "v21.0";

export function getVerifyToken(): string | undefined {
  return process.env.INSTAGRAM_VERIFY_TOKEN;
}

/** Valida a assinatura HMAC-SHA256 enviada pela Meta (X-Hub-Signature-256). */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret) return true; // sem segredo configurado, não bloqueia (dev)
  if (!signature) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Extrai mensagens de texto de um payload de webhook do Instagram.
 * O IG usa o formato de "messaging" (Messenger Platform): entry[].messaging[].
 * Ignora ecos (mensagens enviadas pela própria conta).
 */
export function parseInbound(payload: any): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    for (const event of entry?.messaging ?? []) {
      const message = event?.message;
      if (!message || message.is_echo) continue;

      const text = message.text ?? "";
      if (!text) continue;

      out.push({
        channel: "instagram",
        contactId: event.sender?.id, // IGSID do remetente
        text,
        messageId: message.mid,
        timestamp: event.timestamp ? Math.floor(Number(event.timestamp) / 1000) : undefined,
      });
    }
  }
  return out;
}

/** Envia uma mensagem de texto via Instagram Messaging API. */
export async function sendText(to: string, body: string): Promise<void> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token || !body) return;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(
      token
    )}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient: { id: to },
        message: { text: body.slice(0, 1000) },
      }),
    }
  );
  if (!res.ok) {
    console.error("[instagram] send error:", res.status, await res.text());
  }
}
