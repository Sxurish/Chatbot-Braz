import "server-only";
import { LEGAL_AREA_LABELS } from "@/lib/constants";
import {
  detectArea,
  detectIllegalRequest,
  detectUrgency,
  SUGGESTED_DOCS,
} from "@/lib/chatbot/flow";
import { aiResponseSchema, type AiResponse } from "@/lib/chatbot/schema";
import { STANDARD_MESSAGES, SYSTEM_PROMPT } from "@/lib/chatbot/system-prompt";

/**
 * Motor de triagem reutilizável (channel-agnostic).
 * Usado pelo widget web (/api/chat) e pelos webhooks de WhatsApp/Instagram.
 *
 * Recebe a mensagem do usuário + histórico e devolve o retorno estruturado
 * (AiResponse). Aplica a camada de segurança comportamental e o fallback
 * heurístico quando a IA não está configurada ou falha.
 */

export type HistoryItem = { role: "user" | "assistant"; content: string };

export async function runTriage(
  message: string,
  history: HistoryItem[] = [],
  context: unknown = {}
): Promise<AiResponse> {
  // 1. Segurança comportamental — bloqueia pedidos ilícitos.
  if (detectIllegalRequest(message)) {
    return buildResponse({
      resposta_cliente: STANDARD_MESSAGES.illegalRequest,
      precisa_humano: true,
      motivo_handoff: "Pedido potencialmente ilícito identificado na triagem.",
    });
  }

  // 2. Tenta o provedor de IA configurado.
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider !== "mock") {
    try {
      const ai = await callProvider(provider, message, history, context);
      if (ai) return ai;
    } catch (err) {
      console.error("[engine] provider error:", err);
    }
  }

  // 3. Fallback heurístico determinístico.
  return buildHeuristicResponse(message);
}

/** Resposta heurística (sem IA externa) — fallback seguro e determinístico. */
export function buildHeuristicResponse(message: string): AiResponse {
  const area = detectArea(message);
  const { urgency, reason } = detectUrgency(message);
  const isHigh = urgency === "alta";

  const areaLabel =
    area === "nao_confirmada"
      ? "Ainda preciso entender melhor sua situação"
      : LEGAL_AREA_LABELS[area];

  const resposta = isHigh
    ? `${STANDARD_MESSAGES.urgency} Para que a equipe avalie corretamente, preciso de algumas informações iniciais sobre o seu caso (${areaLabel}).`
    : area === "nao_confirmada"
      ? "Entendi. Para direcionar corretamente, pode me contar um pouco mais sobre a sua situação? Assim consigo identificar a área jurídica e organizar as informações para a equipe."
      : `Entendi. Identifiquei que sua situação se relaciona a ${areaLabel}. Para que a equipe jurídica possa avaliar corretamente, vou coletar algumas informações iniciais. Lembrando que este é um atendimento de triagem e não substitui consulta jurídica formal.`;

  return buildResponse({
    resposta_cliente: resposta,
    area_juridica: area,
    urgencia: urgency,
    motivo_urgencia: reason,
    documentos_sugeridos: SUGGESTED_DOCS[area] ?? [],
    precisa_humano: isHigh,
    motivo_handoff: isHigh ? "Urgência alta detectada na triagem." : "",
    proxima_acao: isHigh
      ? "Contato imediato da equipe jurídica."
      : "Coletar dados e documentos para análise.",
    status_comercial_sugerido: "novo_lead",
    status_juridico_sugerido: "triagem_inicial",
  });
}

/** Normaliza um objeto parcial em um AiResponse completo e validado. */
export function buildResponse(partial: Partial<AiResponse>): AiResponse {
  return aiResponseSchema.parse({ resposta_cliente: "", ...partial });
}

/** Chama o provedor de IA configurado e valida o JSON estruturado de retorno. */
async function callProvider(
  provider: string,
  message: string,
  history: HistoryItem[],
  context: unknown
): Promise<AiResponse | null> {
  const schemaInstruction = `Responda SOMENTE com um objeto JSON válido (sem markdown) seguindo exatamente este formato:
{"resposta_cliente": string, "area_juridica": string, "subarea": string, "tipo_caso": string, "urgencia": "alta"|"media"|"baixa"|"", "motivo_urgencia": string, "dados_coletados": {"nome": string, "telefone": string, "email": string, "cidade": string, "estado": string, "melhor_horario": string, "ja_e_cliente": boolean}, "resumo_caso": string, "documentos_sugeridos": string[], "documentos_mencionados": string[], "dados_faltantes": string[], "prazos_identificados": string[], "processo_existente": boolean, "numero_processo": string, "precisa_humano": boolean, "motivo_handoff": string, "proxima_acao": string, "status_comercial_sugerido": string, "status_juridico_sugerido": string, "status_financeiro_sugerido": string}`;

  const userContent = `${schemaInstruction}\n\nContexto atual: ${JSON.stringify(
    context ?? {}
  )}\n\nMensagem do usuário: ${message}`;

  let raw: string | null = null;

  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: userContent },
        ],
      }),
    });
    const data = await res.json();
    raw = data?.content?.[0]?.text ?? null;
  } else {
    const { url, key } = openAiCompatibleConfig(provider);
    if (!key) return null;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: userContent },
        ],
      }),
    });
    const data = await res.json();
    raw = data?.choices?.[0]?.message?.content ?? null;
  }

  if (!raw) return null;
  const json = extractJson(raw);
  if (!json) return null;
  const parsed = aiResponseSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

function openAiCompatibleConfig(provider: string): { url: string; key?: string } {
  switch (provider) {
    case "openrouter":
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: process.env.OPENROUTER_API_KEY,
      };
    case "google":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        key: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      };
    case "openai":
    default:
      return {
        url: "https://api.openai.com/v1/chat/completions",
        key: process.env.OPENAI_API_KEY,
      };
  }
}

function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
