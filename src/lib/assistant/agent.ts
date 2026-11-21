import type Anthropic from "@anthropic-ai/sdk";
import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_MAX_TOOL_ROUNDS,
} from "@/lib/assistant/config";
import {
  addUsage,
  computeTurnCostUsd,
  EMPTY_USAGE,
  sumUsageTotals,
  type UsageByModel,
  type UsageTotals,
} from "@/lib/assistant/cost";
import {
  decideEscalation,
  ESCALATION_TOOL,
  ESCALATION_TOOL_NAME,
  resolveModel,
  tierSettings,
  type EscalationDecision,
  type ModelTier,
} from "@/lib/assistant/model-router";
import {
  executeTool,
  toApiTools,
  type AssistantTool,
  type ToolContext,
} from "@/lib/assistant/tools";

/** Parte do cliente da Anthropic que o assistente usa (permite um cliente falso nos testes). */
export interface MessageStreamLike {
  on(event: "text", listener: (delta: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Message>;
}

export interface MessagesClientLike {
  messages: {
    stream(
      params: Anthropic.MessageStreamParams,
      options?: { signal?: AbortSignal }
    ): MessageStreamLike;
  };
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  /** Modelo que está respondendo. escalated=true: o Haiku passou a pergunta ao Sonnet e o texto recomeça. */
  | { type: "model"; tier: ModelTier; model: string; escalated: boolean };

export interface ToolUseRecord {
  name: string;
  ok: boolean;
  /** Rascunho de cadastro criado por esta chamada (cartão de confirmação). */
  draftId?: string;
  /** Links de registros devolvidos pela ferramenta (para conferência). */
  links: string[];
}

export interface AgentResult {
  text: string;
  toolsUsed: ToolUseRecord[];
  usage: UsageTotals;
  stopReason: Anthropic.StopReason | null;
  /** O modelo pediu a análise detalhada e a escalada foi aceita (o turno deve ser refeito). */
  escalation?: { motivo: string };
}

export interface RunAgentOptions {
  client: MessagesClientLike;
  model: string;
  system: Anthropic.TextBlockParam[];
  tools: AssistantTool[];
  messages: Anthropic.MessageParam[];
  ctx: ToolContext;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  maxRounds?: number;
  /** Esforço de raciocínio: "low" nas consultas, "medium" na leitura de documentos. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /**
   * Oferece a ferramenta pedir_analise_detalhada (só ao Haiku). A chamada é
   * interceptada: se aceita, o laço para sem executar o resto da rodada e
   * devolve `escalation`; se negada, o modelo recebe o motivo e segue.
   */
  escalation?: {
    decide: (state: { toolsUsed: ToolUseRecord[]; roundHasDraftCall: boolean }) => EscalationDecision;
  };
}

/** Limite de caracteres de um resultado de ferramenta enviado ao modelo. */
const MAX_TOOL_RESULT_CHARS = 24_000;

function collectLinks(value: unknown, out: Set<string>, depth = 0) {
  if (depth > 6 || out.size >= 30 || value == null) return;
  if (Array.isArray(value)) {
    for (const v of value) collectLinks(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "link" && typeof v === "string" && v.startsWith("/")) out.add(v);
      else collectLinks(v, out, depth + 1);
    }
  }
}

function serialize(result: unknown): string {
  const json = JSON.stringify(result ?? null);
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  return `${json.slice(0, MAX_TOOL_RESULT_CHARS)}… [resultado cortado: peça um filtro mais específico]`;
}

/**
 * Laço de conversa com ferramentas: chama o modelo em streaming, executa as
 * ferramentas pedidas (só leitura) e devolve os resultados até o modelo
 * terminar a resposta. Na última rodada as ferramentas são desligadas para
 * garantir uma resposta final.
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const maxRounds = opts.maxRounds ?? ASSISTANT_MAX_TOOL_ROUNDS;
  const apiTools = toApiTools(opts.escalation ? [...opts.tools, ESCALATION_TOOL] : opts.tools);
  const messages: Anthropic.MessageParam[] = [...opts.messages];
  const toolsUsed: ToolUseRecord[] = [];
  let usage = EMPTY_USAGE;
  let text = "";
  let stopReason: Anthropic.StopReason | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const lastRound = round === maxRounds - 1;
    const stream = opts.client.messages.stream(
      {
        model: opts.model,
        max_tokens: opts.maxTokens ?? ASSISTANT_MAX_TOKENS,
        system: opts.system,
        tools: apiTools,
        ...(lastRound ? { tool_choice: { type: "none" as const } } : {}),
        // Consultas simples: pouco raciocínio, resposta rápida e barata.
        output_config: { effort: opts.effort ?? "low" },
        messages,
      },
      { signal: opts.signal }
    );

    let roundHasText = false;
    stream.on("text", (delta) => {
      if (!delta) return;
      if (!roundHasText && text.length > 0) {
        text += "\n\n";
        opts.onEvent?.({ type: "text", delta: "\n\n" });
      }
      roundHasText = true;
      text += delta;
      opts.onEvent?.({ type: "text", delta });
    });

    const message = await stream.finalMessage();
    usage = addUsage(usage, message.usage);
    stopReason = message.stop_reason;

    if (message.stop_reason === "refusal") {
      const note = "Não posso ajudar com esse pedido.";
      text = text ? `${text}\n\n${note}` : note;
      opts.onEvent?.({ type: "text", delta: text === note ? note : `\n\n${note}` });
      break;
    }

    if (message.stop_reason !== "tool_use") {
      if (message.stop_reason === "max_tokens") {
        const note = "\n\n_(Resposta interrompida por tamanho. Peça um recorte menor.)_";
        text += note;
        opts.onEvent?.({ type: "text", delta: note });
      }
      break;
    }

    // O modelo pediu ferramentas: devolve o conteúdo intacto (inclui o raciocínio).
    messages.push({ role: "assistant", content: message.content });
    const calls = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    // Pedido de análise detalhada: decide antes de executar o resto da rodada,
    // para não criar rascunho que o Sonnet criaria de novo.
    const escalationCalls = calls.filter((c) => c.name === ESCALATION_TOOL_NAME);
    let escalationDenied: string | null = null;
    if (escalationCalls.length > 0) {
      const decision = opts.escalation
        ? opts.escalation.decide({
            toolsUsed,
            roundHasDraftCall: calls.some((c) => opts.tools.find((t) => t.name === c.name)?.writeOnly),
          })
        : ({ allow: false, message: "Ferramenta não disponível agora." } as const);
      if (decision.allow) {
        const input = escalationCalls[0].input as { motivo?: unknown } | null;
        const motivo = typeof input?.motivo === "string" ? input.motivo.slice(0, 300) : "";
        opts.onEvent?.({ type: "tool", name: ESCALATION_TOOL_NAME, label: ESCALATION_TOOL.label });
        toolsUsed.push({ name: ESCALATION_TOOL_NAME, ok: true, links: [] });
        return { text, toolsUsed, usage, stopReason, escalation: { motivo } };
      }
      escalationDenied = decision.message;
    }

    const results = await Promise.all(
      calls.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
        if (call.name === ESCALATION_TOOL_NAME) {
          toolsUsed.push({ name: call.name, ok: false, links: [] });
          return { type: "tool_result", tool_use_id: call.id, content: escalationDenied ?? "" };
        }
        const tool = opts.tools.find((t) => t.name === call.name);
        opts.onEvent?.({ type: "tool", name: call.name, label: tool?.label ?? "Consultando o CRM" });
        // Ferramenta fora da lista desta pessoa (ex.: financeiro sem ser Admin) é negada.
        const outcome = tool
          ? await executeTool(call.name, call.input, opts.ctx, opts.tools)
          : ({ ok: false, error: "Ferramenta não disponível para este usuário." } as const);
        const links = new Set<string>();
        if (outcome.ok) collectLinks(outcome.result, links);
        const draftId =
          outcome.ok && outcome.result && typeof outcome.result === "object"
            ? (outcome.result as { rascunho_id?: unknown }).rascunho_id
            : undefined;
        toolsUsed.push({
          name: call.name,
          ok: outcome.ok,
          links: [...links],
          ...(typeof draftId === "string" ? { draftId } : {}),
        });
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: outcome.ok ? serialize(outcome.result) : outcome.error,
          ...(outcome.ok ? {} : { is_error: true }),
        };
      })
    );

    messages.push({ role: "user", content: results });
  }

  if (!text.trim()) {
    text = "Não consegui montar uma resposta agora. Tente perguntar de outro jeito.";
    opts.onEvent?.({ type: "text", delta: text });
  }

  return { text, toolsUsed, usage, stopReason };
}

export interface RunRoutedAgentOptions
  extends Omit<RunAgentOptions, "model" | "system" | "effort" | "maxTokens" | "escalation"> {
  /** Nível com que a pergunta começa (chooseInitialTier). */
  initialTier: ModelTier;
  /** Instruções de cada nível; canEscalate diz se a ferramenta de escalada está disponível. */
  buildSystem: (info: { tier: ModelTier; canEscalate: boolean }) => Anthropic.TextBlockParam[];
  /** Sonnet liberado pelo orçamento (BudgetStatus.allowDocuments). */
  detailedAllowed: boolean;
  /** Troca o modelo de cada nível (testes). Padrão: resolveModel. */
  resolve?: (tier: ModelTier) => string;
}

export interface RoutedAgentResult extends AgentResult {
  /** Modelo que deu a resposta final. */
  model: string;
  tier: ModelTier;
  escalated: boolean;
  /** Tokens por modelo realmente usado. */
  usageByModel: UsageByModel;
  /** Custo somado, cada parte com o preço do seu modelo. */
  costUsd: number;
}

/**
 * Pergunta com troca automática de modelo: começa no nível escolhido e, se o
 * Haiku pedir a análise detalhada (e for permitido), refaz o turno inteiro no
 * Sonnet com o mesmo histórico. No máximo uma escalada: o Sonnet não recebe a
 * ferramenta.
 */
export async function runRoutedAgent(opts: RunRoutedAgentOptions): Promise<RoutedAgentResult> {
  const { initialTier, buildSystem, detailedAllowed, resolve = resolveModel, ...base } = opts;
  const firstModel = resolve(initialTier);
  const detailedModel = resolve("detalhado");
  const canEscalate = initialTier === "rapido" && firstModel !== detailedModel;

  opts.onEvent?.({ type: "model", tier: initialTier, model: firstModel, escalated: false });
  const first = await runAgent({
    ...base,
    model: firstModel,
    system: buildSystem({ tier: initialTier, canEscalate }),
    ...tierSettings(initialTier),
    ...(canEscalate
      ? { escalation: { decide: (s) => decideEscalation({ detailedAllowed, ...s }) } }
      : {}),
  });
  const usageByModel: UsageByModel = { [firstModel]: first.usage };

  if (!first.escalation) {
    return {
      ...first,
      model: firstModel,
      tier: initialTier,
      escalated: false,
      usageByModel,
      costUsd: computeTurnCostUsd(usageByModel),
    };
  }

  opts.onEvent?.({ type: "model", tier: "detalhado", model: detailedModel, escalated: true });
  const second = await runAgent({
    ...base,
    model: detailedModel,
    system: buildSystem({ tier: "detalhado", canEscalate: false }),
    ...tierSettings("detalhado"),
  });
  usageByModel[detailedModel] = sumUsageTotals(usageByModel[detailedModel] ?? EMPTY_USAGE, second.usage);

  return {
    text: second.text,
    toolsUsed: [...first.toolsUsed, ...second.toolsUsed],
    usage: sumUsageTotals(first.usage, second.usage),
    stopReason: second.stopReason,
    model: detailedModel,
    tier: "detalhado",
    escalated: true,
    usageByModel,
    costUsd: computeTurnCostUsd(usageByModel),
  };
}

/**
 * Monta o histórico enviado ao modelo: só texto, começando por "user" e
 * alternando papéis (mensagens seguidas do mesmo papel são juntadas).
 */
export function buildHistory(
  previous: { role: "user" | "assistant"; content: string }[],
  current: string
): Anthropic.MessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of [...previous, { role: "user" as const, content: current }]) {
    const content = m.content.trim();
    if (!content) continue;
    if (out.length === 0 && m.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  return out;
}
