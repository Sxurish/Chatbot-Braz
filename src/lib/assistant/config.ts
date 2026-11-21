/**
 * Configuração do assistente virtual da equipe (fases 1 e 2).
 * Modelos e preços ficam aqui para mudar num lugar só.
 */

/** Teto de tokens de saída por chamada (resposta + raciocínio). */
export const ASSISTANT_MAX_TOKENS = 4096;

/** Na leitura de documentos o modelo raciocina mais antes de responder. */
export const ASSISTANT_DOC_MAX_TOKENS = 12_000;

/** Máximo de rodadas de ferramentas por pergunta (evita laços). */
export const ASSISTANT_MAX_TOOL_ROUNDS = 6;

/** Quantas mensagens anteriores da conversa vão como contexto. */
export const ASSISTANT_HISTORY_LIMIT = 20;

/** Limite mensal padrão de gasto com IA, em dólares (alterável em Configurações). */
export const DEFAULT_MONTHLY_LIMIT_USD = 50;

/** Aviso de gasto a partir desta fração do limite. */
export const BUDGET_WARNING_RATIO = 0.8;

/**
 * Trava de segurança: acima desta fração do limite o assistente para de
 * responder até o mês virar (ou até um Admin aumentar o limite). Entre 100% e
 * este valor, as consultas simples continuam e as leituras de documento
 * (fase 2) ficam pausadas, como combinado no escopo.
 */
export const BUDGET_HARD_STOP_RATIO = 1.5;

/** Preço por milhão de tokens, em dólares. */
export interface ModelPricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Haiku 5.5 (prompt de até 100 mil tokens).
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  // Claude Sonnet 5.5 — usado na leitura de documentos (fase 2).
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
};

/** Modelos padrão de cada nível. O assistente só usa estes dois. */
export const DEFAULT_ASSISTANT_MODEL = "claude-haiku-5-5";
export const DEFAULT_ASSISTANT_DOC_MODEL = "claude-sonnet-5-5";

/** Modelos permitidos: só os que têm preço cadastrado (Haiku e Sonnet). */
export function isAllowedModel(model: string | null | undefined): model is string {
  return typeof model === "string" && Object.prototype.hasOwnProperty.call(MODEL_PRICING, model);
}

const warned = new Set<string>();

/**
 * Lê o modelo de uma variável de ambiente. Valor fora da lista é ignorado
 * (volta ao padrão, com aviso no log uma vez por valor).
 */
export function pickAllowedModel(value: string | null | undefined, fallback: string, envName: string): string {
  const v = value?.trim();
  if (!v) return fallback;
  if (isAllowedModel(v)) return v;
  const key = `${envName}=${v}`;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(
      `[assistente] ${envName}="${v}" não é um modelo permitido (${Object.keys(MODEL_PRICING).join(", ")}). Usando ${fallback}.`
    );
  }
  return fallback;
}

/** Modelo do dia a dia: rápido e barato, escolhe a consulta certa e resume. */
export const ASSISTANT_MODEL = pickAllowedModel(
  process.env.ASSISTANT_MODEL,
  DEFAULT_ASSISTANT_MODEL,
  "ASSISTANT_MODEL"
);

/** Modelo detalhado: lê PDFs e prints (fase 2) e recebe as perguntas escaladas pelo Haiku. */
export const ASSISTANT_DOC_MODEL = pickAllowedModel(
  process.env.ASSISTANT_DOC_MODEL,
  DEFAULT_ASSISTANT_DOC_MODEL,
  "ASSISTANT_DOC_MODEL"
);

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
