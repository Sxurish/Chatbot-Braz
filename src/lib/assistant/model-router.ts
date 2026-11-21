import { z } from "zod";
import {
  ASSISTANT_DOC_MAX_TOKENS,
  ASSISTANT_MAX_TOKENS,
  DEFAULT_ASSISTANT_DOC_MODEL,
  DEFAULT_ASSISTANT_MODEL,
  pickAllowedModel,
} from "@/lib/assistant/config";
import type { AssistantTool } from "@/lib/assistant/tools";

/**
 * Roteamento entre os dois modelos do assistente (e só eles):
 * - "rapido": Claude Haiku, começa toda pergunta sem arquivo;
 * - "detalhado": Claude Sonnet, lê arquivos e recebe as perguntas que o Haiku
 *   escala com a ferramenta pedir_analise_detalhada (no máximo uma vez por pergunta).
 * Funções puras para testar sem rede.
 */
export type ModelTier = "rapido" | "detalhado";

type Env = Record<string, string | undefined>;

/** Modelo de cada nível, lido do ambiente e conferido com a lista de permitidos. */
export function resolveModel(tier: ModelTier, env: Env = process.env): string {
  return tier === "rapido"
    ? pickAllowedModel(env.ASSISTANT_MODEL, DEFAULT_ASSISTANT_MODEL, "ASSISTANT_MODEL")
    : pickAllowedModel(env.ASSISTANT_DOC_MODEL, DEFAULT_ASSISTANT_DOC_MODEL, "ASSISTANT_DOC_MODEL");
}

export interface InitialTierInput {
  /** A pergunta trouxe PDF ou imagem. */
  hasAttachment: boolean;
}

/** Haiku sempre começa; com arquivo anexado, a leitura já vai direto para o Sonnet. */
export function chooseInitialTier(input: InitialTierInput): ModelTier {
  return input.hasAttachment ? "detalhado" : "rapido";
}

/** Raciocínio e teto de saída de cada nível. */
export function tierSettings(tier: ModelTier): { effort: "low" | "medium"; maxTokens: number } {
  return tier === "detalhado"
    ? { effort: "medium", maxTokens: ASSISTANT_DOC_MAX_TOKENS }
    : { effort: "low", maxTokens: ASSISTANT_MAX_TOKENS };
}

/** Nível de um modelo gravado (para a etiqueta nas conversas antigas). */
export function tierOfModel(model: string | null | undefined): ModelTier | null {
  if (!model) return null;
  if (/sonnet/i.test(model)) return "detalhado";
  if (/haiku/i.test(model)) return "rapido";
  return null;
}

// ---------------------------------------------------------------------------
// Escalonamento
// ---------------------------------------------------------------------------

export const ESCALATION_TOOL_NAME = "pedir_analise_detalhada";

/**
 * Ponto de extensão: ferramentas que já chamam o Sonnet por conta própria
 * (ex.: a futura redigir_minuta). Com elas disponíveis o Haiku não precisa
 * escalar para redigir, e depois de usá-las nesta pergunta a escalada é negada
 * (o texto detalhado já foi feito).
 */
export const SONNET_DIRECT_TOOLS: readonly string[] = ["redigir_minuta"];

/**
 * Ferramenta interna, oferecida só ao Haiku. Nunca é executada como as outras:
 * o laço do agente intercepta a chamada e decide com decideEscalation.
 */
export const ESCALATION_TOOL: AssistantTool = {
  name: ESCALATION_TOOL_NAME,
  label: "Passando para a análise detalhada",
  description:
    "Passa esta pergunta para o modelo detalhado (Claude Sonnet), que refaz a resposta do zero com o mesmo histórico. Use só nos casos descritos em \"Escolha do modelo\". Chame sozinha, sem outras ferramentas na mesma rodada, e nunca depois de preparar um rascunho.",
  schema: z.object({
    motivo: z.string().trim().min(1).max(300).describe("Por que a pergunta precisa da análise detalhada, em poucas palavras."),
  }),
  run: async () => {
    throw new Error("pedir_analise_detalhada é tratada pelo laço do agente.");
  },
};

export const ESCALATION_PAUSED_MESSAGE =
  "A análise detalhada está pausada porque o gasto do mês com a IA passou do limite. Responda você mesmo, da melhor forma possível com o que já consultou, e avise em uma frase que a análise detalhada está pausada pelo limite do mês.";

export const ESCALATION_AFTER_DRAFT_MESSAGE =
  "Não dá para passar para a análise detalhada depois de preparar um rascunho nesta resposta (o rascunho seria duplicado). Termine a resposta você mesmo.";

export const ESCALATION_AFTER_DIRECT_MESSAGE =
  "O texto detalhado já foi feito por outra ferramenta nesta resposta. Termine a resposta você mesmo.";

export interface EscalationInput {
  /** Sonnet liberado pelo orçamento (fora da faixa de 100% a 150% do limite). */
  detailedAllowed: boolean;
  /** Ferramentas já usadas nesta pergunta (antes da rodada atual). */
  toolsUsed: { name: string; draftId?: string }[];
  /** A mesma rodada também pediu uma ferramenta de rascunho (preparar_*). */
  roundHasDraftCall: boolean;
}

export type EscalationDecision = { allow: true } | { allow: false; message: string };

/** Decide se a escalada para o Sonnet pode acontecer agora. */
export function decideEscalation(input: EscalationInput): EscalationDecision {
  if (input.toolsUsed.some((t) => t.draftId) || input.roundHasDraftCall) {
    return { allow: false, message: ESCALATION_AFTER_DRAFT_MESSAGE };
  }
  if (input.toolsUsed.some((t) => SONNET_DIRECT_TOOLS.includes(t.name))) {
    return { allow: false, message: ESCALATION_AFTER_DIRECT_MESSAGE };
  }
  if (!input.detailedAllowed) return { allow: false, message: ESCALATION_PAUSED_MESSAGE };
  return { allow: true };
}
