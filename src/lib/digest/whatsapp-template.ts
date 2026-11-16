import "server-only";
import { DIGEST_TEMPLATE_DEFAULT_LANG, DIGEST_TEMPLATE_DEFAULT_NAME } from "./format";

/**
 * Envio do resumo diário pelo WhatsApp Cloud API usando um MODELO APROVADO
 * pela Meta (fora da janela de 24h só modelo é entregue).
 *
 * Variáveis de ambiente:
 *  - WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID (as mesmas do canal)
 *  - WHATSAPP_DIGEST_TEMPLATE       nome do modelo (padrão "resumo_diario")
 *  - WHATSAPP_DIGEST_TEMPLATE_LANG  idioma do modelo (padrão "pt_BR")
 *
 * Corpo do modelo: {{1}} = primeiro nome, {{2}} = linha do resumo.
 * Nunca lança erro: devolve { ok, error } em português.
 */

// Mesma versão do Graph API usada em src/lib/channels/whatsapp.ts.
const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 15_000;

export type DigestSendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

type Env = Record<string, string | undefined>;

export function digestTemplateConfig(env: Env = process.env) {
  return {
    name: env.WHATSAPP_DIGEST_TEMPLATE?.trim() || DIGEST_TEMPLATE_DEFAULT_NAME,
    lang: env.WHATSAPP_DIGEST_TEMPLATE_LANG?.trim() || DIGEST_TEMPLATE_DEFAULT_LANG,
    configured: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
  };
}

/** Parâmetro de modelo da Meta: sem quebras, tabulações nem 4+ espaços seguidos. */
function param(text: string, max: number): string {
  const t = text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (t.length > max ? `${t.slice(0, max - 1)}…` : t) || "-";
}

export function buildDigestTemplatePayload(input: {
  to: string;
  firstName: string;
  summaryLine: string;
  name: string;
  lang: string;
}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "template",
    template: {
      name: input.name,
      language: { code: input.lang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: param(input.firstName, 60) },
            { type: "text", text: param(input.summaryLine, 899) },
          ],
        },
      ],
    },
  };
}

function explainGraphError(status: number, body: unknown, templateName: string): string {
  const err = (body as { error?: { code?: number; message?: string; error_data?: { details?: string } } } | null)
    ?.error;
  const code = err?.code;
  if (code === 190 || status === 401) {
    return "O token do WhatsApp (WHATSAPP_ACCESS_TOKEN) expirou ou é inválido. Gere um novo no painel da Meta.";
  }
  if (code === 132001) {
    return `O modelo "${templateName}" não existe ou ainda não foi aprovado pela Meta para este idioma.`;
  }
  if (code === 132000 || code === 132012) {
    return `O modelo "${templateName}" aprovado na Meta não tem as variáveis {{1}} e {{2}} esperadas. Confira o texto do modelo.`;
  }
  if (code === 132015 || code === 132016) {
    return `O modelo "${templateName}" está pausado ou desativado pela Meta.`;
  }
  if (code === 131026) return "Este número não pode receber mensagens no WhatsApp.";
  if (code === 131030) return "Número fora da lista de teste da Meta. Adicione-o no painel do app ou publique o app.";
  if (code === 131047) return "Fora da janela de 24h: só modelo aprovado é entregue.";
  if (code === 131056 || code === 130429 || status === 429) {
    return "Limite de envios da Meta atingido. Tente de novo mais tarde.";
  }
  if (code === 100 || status === 400) {
    return `A Meta recusou o envio${err?.message ? `: ${err.message}` : ""}. Confira WHATSAPP_PHONE_NUMBER_ID e o nome do modelo.`;
  }
  return `A Meta recusou o envio (HTTP ${status}${code ? `, código ${code}` : ""}).`;
}

export async function sendDigestTemplate(
  input: { to: string; firstName: string; summaryLine: string },
  deps: { fetchImpl?: typeof fetch; env?: Env } = {}
): Promise<DigestSendResult> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return {
      ok: false,
      error: "WhatsApp ainda não configurado (faltam WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID na Vercel).",
    };
  }
  const to = input.to.replace(/\D/g, "");
  if (to.length < 10) return { ok: false, error: "Número de WhatsApp inválido." };

  const { name, lang } = digestTemplateConfig(env);
  const payload = buildDigestTemplatePayload({ ...input, to, name, lang });

  try {
    const res = await doFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) return { ok: false, error: explainGraphError(res.status, body, name) };
    const messageId = (body as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id ?? null;
    return { ok: true, messageId };
  } catch (err) {
    const timeout = (err as Error)?.name === "TimeoutError" || (err as Error)?.name === "AbortError";
    return {
      ok: false,
      error: timeout
        ? "A Meta não respondeu a tempo (15 s). Tente de novo mais tarde."
        : "Não foi possível falar com a Meta (erro de rede).",
    };
  }
}
