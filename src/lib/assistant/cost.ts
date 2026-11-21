import {
  BUDGET_HARD_STOP_RATIO,
  BUDGET_WARNING_RATIO,
  MODEL_PRICING,
  type ModelPricing,
} from "@/lib/assistant/config";

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface UsageTotals {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const EMPTY_USAGE: UsageTotals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

export function addUsage(total: UsageTotals, usage: TokenUsage): UsageTotals {
  return {
    input: total.input + (usage.input_tokens ?? 0),
    output: total.output + (usage.output_tokens ?? 0),
    cacheWrite: total.cacheWrite + (usage.cache_creation_input_tokens ?? 0),
    cacheRead: total.cacheRead + (usage.cache_read_input_tokens ?? 0),
  };
}

/** Custo em dólares de um conjunto de tokens. Modelo desconhecido usa o preço do Sonnet (conservador). */
export function computeCostUsd(model: string, usage: UsageTotals): number {
  const price: ModelPricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-5-5"];
  const cost =
    (usage.input * price.input +
      usage.output * price.output +
      usage.cacheWrite * price.cacheWrite +
      usage.cacheRead * price.cacheRead) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Tokens de cada modelo usado numa pergunta (Haiku e Sonnet podem somar no mesmo turno). */
export type UsageByModel = Record<string, UsageTotals>;

export function sumUsageTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
  };
}

/** Custo de uma pergunta: cada parte com o preço do modelo que realmente a fez. */
export function computeTurnCostUsd(byModel: UsageByModel): number {
  let total = 0;
  for (const [model, usage] of Object.entries(byModel)) total += computeCostUsd(model, usage);
  return Math.round(total * 1_000_000) / 1_000_000;
}

export type BudgetLevel = "ok" | "warning" | "over" | "blocked";

export interface BudgetStatus {
  level: BudgetLevel;
  spentUsd: number;
  limitUsd: number;
  ratio: number;
  /** Consultas simples (Haiku) liberadas. */
  allowChat: boolean;
  /** Leitura de documentos (Sonnet, fase 2) liberada. */
  allowDocuments: boolean;
}

export function getBudgetStatus(spentUsd: number, limitUsd: number): BudgetStatus {
  const limit = limitUsd > 0 ? limitUsd : 0;
  const ratio = limit === 0 ? (spentUsd > 0 ? Infinity : 0) : spentUsd / limit;
  let level: BudgetLevel = "ok";
  if (ratio >= BUDGET_HARD_STOP_RATIO || limit === 0) level = "blocked";
  else if (ratio >= 1) level = "over";
  else if (ratio >= BUDGET_WARNING_RATIO) level = "warning";
  return {
    level,
    spentUsd,
    limitUsd: limit,
    ratio,
    allowChat: level !== "blocked",
    allowDocuments: level === "ok" || level === "warning",
  };
}

export function budgetMessage(status: BudgetStatus): string | null {
  const pct = Number.isFinite(status.ratio) ? Math.round(status.ratio * 100) : 100;
  const spent = `US$ ${status.spentUsd.toFixed(2)} de US$ ${status.limitUsd.toFixed(2)}`;
  switch (status.level) {
    case "warning":
      return `O assistente já usou ${pct}% do limite do mês (${spent}).`;
    case "over":
      return `Limite do mês atingido (${spent}). As consultas continuam, mas a leitura de documentos fica pausada até o mês virar.`;
    case "blocked":
      return status.limitUsd === 0
        ? "O assistente está sem limite de gasto definido. Um Admin precisa definir o limite em Configurações."
        : `O assistente passou bastante do limite do mês (${spent}) e foi pausado. Um Admin pode aumentar o limite em Configurações.`;
    default:
      return null;
  }
}
