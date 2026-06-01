import "server-only";
import crypto from "crypto";
import type { InboundMessage } from "./types";

/**
 * Integração com a WhatsApp Cloud API (Meta Graph API).
 * Variáveis de ambiente necessárias:
 *  - WHATSAPP_VERIFY_TOKEN     (verificação do webhook)
 *  - WHATSAPP_APP_SECRET       (validação da assinatura X-Hub-Signature-256)
 *  - WHATSAPP_ACCESS_TOKEN     (envio de mensagens)
 *  - WHATSAPP_PHONE_NUMBER_ID  (número de envio)
 */

const GRAPH_VERSION = "v21.0";

export function getVerifyToken(): string | undefined {
  return process.env.WHATSAPP_VERIFY_TOKEN;
}

/** Valida a assinatura HMAC-SHA256 enviada pela Meta (X-Hub-Signature-256). */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
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

/** Extrai as mensagens de texto recebidas de um payload de webhook do WhatsApp. */
export function parseInbound(payload: any): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const contacts = value?.contacts ?? [];
      const profileName = contacts[0]?.profile?.name as string | undefined;

      for (const m of value?.messages ?? []) {
        // Apenas mensagens de texto na triagem inicial.
        const text =
          m?.text?.body ??
          m?.button?.text ??
          m?.interactive?.button_reply?.title ??
          m?.interactive?.list_reply?.title ??
          "";
        if (!text) continue;
        out.push({
          channel: "whatsapp",
          contactId: m.from,
          contactName: profileName,
          text,
          messageId: m.id,
          timestamp: m.timestamp ? Number(m.timestamp) : undefined,
        });
      }
    }
  }
  return out;
}

/** Envia uma mensagem de texto de volta ao usuário via Cloud API. */
export async function sendText(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !body) return;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: body.slice(0, 4096) },
      }),
    }
  );
  if (!res.ok) {
    console.error("[whatsapp] send error:", res.status, await res.text());
  }
}
