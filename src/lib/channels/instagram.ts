import "server-only";
import crypto from "crypto";
import type { InboundMessage } from "./types";

/**
 * Integração com a Instagram Messaging Platform (Meta Graph API).
 * Variáveis de ambiente necessárias:
 *  - INSTAGRAM_VERIFY_TOKEN   (verificação do webhook — handshake da Meta)
 *  - INSTAGRAM_APP_SECRET     (validação da assinatura X-Hub-Signature-256)
 *  - INSTAGRAM_ACCESS_TOKEN   (envio de mensagens)
 *
 * O payload de webhook do Instagram Messaging tem shape diferente do WhatsApp:
 * `entry[].messaging[].message` (estilo Messenger Platform), com `sender.id`
 * sendo o IGSID (identificador do usuário dentro do Instagram).
 */

const GRAPH_VERSION = "v21.0";

export function getVerifyToken(): string | undefined {
  return process.env.INSTAGRAM_VERIFY_TOKEN;
}

/** Valida a assinatura HMAC-SHA256 enviada pela Meta (X-Hub-Signature-256). */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  // Sem segredo configurado, não bloqueia (ambiente de desenvolvimento).
  if (!secret) return true;
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
 * Extrai mensagens de texto recebidas de um payload de webhook do Instagram.
 * Ignora mensagens enviadas pela própria conta (echo) e attachments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseInbound(payload: any): InboundMessage[] {
  const out: InboundMessage[] = [];

  // Verificação extra: só aceita objetos do tipo instagram (a Meta pode usar o
  // mesmo endpoint para messenger ou page comments — descartar o resto).
  if (payload?.object && payload.object !== "instagram") return out;

  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    for (const m of entry?.messaging ?? []) {
      // Ignora echoes (mensagens enviadas pela própria página).
      if (m?.message?.is_echo) continue;

      const text =
        m?.message?.text ??
        m?.postback?.title ??
        "";
      if (!text) continue;

      const messageId = m?.message?.mid ?? `${entry.id}-${m?.timestamp}`;
      const senderId = m?.sender?.id;
      if (!senderId || !messageId) continue;

      out.push({
        channel: "instagram",
        contactId: String(senderId),
        // Instagram Messaging não envia o nome do contato no webhook;
        // a obtenção depende de chamada extra à Graph API (futuro).
        text,
        messageId: String(messageId),
        timestamp: m?.timestamp ? Math.floor(Number(m.timestamp) / 1000) : undefined,
      });
    }
  }
  return out;
}

/**
 * Envia uma mensagem de texto via Instagram Messaging.
 * Endpoint: POST /me/messages com o ACCESS_TOKEN da conta Instagram conectada.
 */
export async function sendText(to: string, body: string): Promise<void> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token || !body) return;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient: { id: to },
        // Limite informal do Instagram para messaging: 1000 chars por mensagem.
        message: { text: body.slice(0, 1000) },
      }),
    }
  );
  if (!res.ok) {
    console.error("[instagram] send error:", res.status, await res.text());
  }
}
