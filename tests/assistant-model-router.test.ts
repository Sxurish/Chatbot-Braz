import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runRoutedAgent, type AgentEvent, type MessagesClientLike } from "@/lib/assistant/agent";
import { computeCostUsd, computeTurnCostUsd } from "@/lib/assistant/cost";
import {
  chooseInitialTier,
  decideEscalation,
  ESCALATION_PAUSED_MESSAGE,
  ESCALATION_TOOL_NAME,
  resolveModel,
  tierOfModel,
} from "@/lib/assistant/model-router";
import { buildModelChoiceInstructions, buildSystemPrompt } from "@/lib/assistant/prompt";
import { getToolsFor, type AssistantTool, type ToolContext } from "@/lib/assistant/tools";
import type { TeamUser } from "@/lib/types";

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";

const user: TeamUser = {
  id: "u-router",
  name: "Advogada Teste",
  email: "adv@teste.dev",
  role: "advogado",
  active: true,
  last_login: null,
  created_at: "2026-01-01T00:00:00Z",
};
const ctx: ToolContext = { user, isAdmin: false, now: new Date("2026-11-20T12:00:00-03:00"), canWrite: true };

const textBlock = (text: string) => ({ type: "text", text, citations: null }) as Anthropic.TextBlock;
const toolUse = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use", id, name, input }) as Anthropic.ToolUseBlock;

function message(content: Anthropic.ContentBlock[], stop: Anthropic.StopReason, tokens = 1000): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: HAIKU,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: tokens, output_tokens: tokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

function fakeClient(script: Anthropic.Message[]) {
  const calls: Anthropic.MessageStreamParams[] = [];
  const client: MessagesClientLike = {
    messages: {
      stream(params) {
        calls.push(structuredClone(params));
        const reply = script[calls.length - 1];
        const listeners: ((d: string) => void)[] = [];
        return {
          on(_event: "text", listener: (d: string) => void) {
            listeners.push(listener);
            return this;
          },
          async finalMessage() {
            for (const block of reply.content) {
              if (block.type === "text") listeners.forEach((l) => l(block.text));
            }
            return reply;
          },
        };
      },
    },
  };
  return { client, calls };
}

const toolNames = (p: Anthropic.MessageStreamParams) => (p.tools ?? []).map((t) => (t as Anthropic.Tool).name);
const systemText = (p: Anthropic.MessageStreamParams) =>
  (p.system as Anthropic.TextBlockParam[]).map((b) => b.text).join("\n");

function routed(client: MessagesClientLike, extra: Partial<Parameters<typeof runRoutedAgent>[0]> = {}) {
  return runRoutedAgent({
    client,
    initialTier: "rapido",
    detailedAllowed: true,
    buildSystem: ({ canEscalate }) => buildSystemPrompt(user, false, ctx.now, { canWrite: true, canEscalate }),
    tools: getToolsFor(false),
    messages: [{ role: "user", content: "Compare os processos da cliente Ana" }],
    ctx,
    resolve: (tier) => (tier === "rapido" ? HAIKU : SONNET),
    ...extra,
  });
}

describe("lista de modelos permitidos", () => {
  afterEach(() => vi.restoreAllMocks());

  it("usa Haiku e Sonnet por padrão", () => {
    expect(resolveModel("rapido", {})).toBe(HAIKU);
    expect(resolveModel("detalhado", {})).toBe(SONNET);
  });

  it("aceita os modelos da lista vindos do ambiente", () => {
    expect(resolveModel("detalhado", { ASSISTANT_DOC_MODEL: SONNET })).toBe(SONNET);
    expect(resolveModel("rapido", { ASSISTANT_MODEL: ` ${HAIKU} ` })).toBe(HAIKU);
  });

  it("ignora modelo fora da lista, volta ao padrão e avisa no log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveModel("rapido", { ASSISTANT_MODEL: "claude-opus-5-5" })).toBe(HAIKU);
    expect(resolveModel("detalhado", { ASSISTANT_DOC_MODEL: "gpt-x" })).toBe(SONNET);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toMatch(/ASSISTANT_MODEL="claude-opus-5-5"/);
  });

  it("reconhece o nível de um modelo gravado", () => {
    expect(tierOfModel(SONNET)).toBe("detalhado");
    expect(tierOfModel(HAIKU)).toBe("rapido");
    expect(tierOfModel(null)).toBeNull();
  });
});

describe("escolha inicial do modelo", () => {
  it("Haiku sempre começa sem arquivo", () => {
    expect(chooseInitialTier({ hasAttachment: false })).toBe("rapido");
  });
  it("com arquivo anexado já começa no Sonnet", () => {
    expect(chooseInitialTier({ hasAttachment: true })).toBe("detalhado");
  });
});

describe("decisão de escalar", () => {
  const base = { detailedAllowed: true, toolsUsed: [], roundHasDraftCall: false };
  it("libera quando não há rascunho e o orçamento permite", () => {
    expect(decideEscalation(base)).toEqual({ allow: true });
  });
  it("nega depois de rascunho criado ou na mesma rodada de um preparar_*", () => {
    expect(decideEscalation({ ...base, toolsUsed: [{ name: "preparar_tarefa", draftId: "d1" }] }).allow).toBe(false);
    expect(decideEscalation({ ...base, roundHasDraftCall: true }).allow).toBe(false);
  });
  it("nega depois de uma ferramenta que já usa o Sonnet (redigir_minuta)", () => {
    expect(decideEscalation({ ...base, toolsUsed: [{ name: "redigir_minuta" }] }).allow).toBe(false);
  });
  it("nega com o orçamento pausando o Sonnet", () => {
    expect(decideEscalation({ ...base, detailedAllowed: false })).toEqual({
      allow: false,
      message: ESCALATION_PAUSED_MESSAGE,
    });
  });
});

describe("instruções de escolha do modelo", () => {
  it("só vão para o Haiku com a ferramenta de escalada", () => {
    const haiku = buildSystemPrompt(user, false, ctx.now, { canEscalate: true }).map((b) => b.text).join("\n");
    const sonnet = buildSystemPrompt(user, false, ctx.now, {}).map((b) => b.text).join("\n");
    expect(haiku).toContain("Escolha do modelo");
    expect(sonnet).not.toContain("Escolha do modelo");
  });
  it("com redigir_minuta disponível, a minuta vai pela ferramenta", () => {
    expect(buildModelChoiceInstructions(["redigir_minuta"])).toMatch(/use redigir_minuta/);
    expect(buildModelChoiceInstructions([])).toMatch(/minuta \(petição/);
  });
});

describe("troca automática Haiku → Sonnet", () => {
  it("sem pedido, responde no Haiku e o Sonnet não é chamado", async () => {
    const { client, calls } = fakeClient([message([textBlock("Tem 2 prazos.")], "end_turn")]);
    const result = await routed(client);
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(HAIKU);
    expect(toolNames(calls[0])).toContain(ESCALATION_TOOL_NAME);
    expect(systemText(calls[0])).toContain("Escolha do modelo");
    expect(result).toMatchObject({ model: HAIKU, tier: "rapido", escalated: false, text: "Tem 2 prazos." });
  });

  it("refaz o turno no Sonnet com o mesmo histórico, uma única vez", async () => {
    const { client, calls } = fakeClient([
      message([textBlock("Vou ver."), toolUse("tu_1", "buscar_processos", { texto: "Ana" })], "tool_use"),
      message([toolUse("tu_2", ESCALATION_TOOL_NAME, { motivo: "comparação entre vários processos" })], "tool_use"),
      // Sonnet: consulta de novo e responde
      message([toolUse("tu_3", "buscar_processos", { texto: "Ana" })], "tool_use", 100),
      message([textBlock("Comparação detalhada.")], "end_turn", 100),
    ]);
    const events: AgentEvent[] = [];
    const result = await routed(client, { onEvent: (e) => events.push(e) });

    expect(calls.map((c) => c.model)).toEqual([HAIKU, HAIKU, SONNET, SONNET]);
    // Mesmo histórico de entrada; Sonnet sem a ferramenta de escalada e sem a seção de escolha.
    expect(calls[2].messages).toEqual([{ role: "user", content: "Compare os processos da cliente Ana" }]);
    expect(toolNames(calls[2])).not.toContain(ESCALATION_TOOL_NAME);
    expect(systemText(calls[2])).not.toContain("Escolha do modelo");
    expect(calls[2].output_config).toEqual({ effort: "medium" });

    expect(result.escalated).toBe(true);
    expect(result.model).toBe(SONNET);
    expect(result.text).toBe("Comparação detalhada.");
    expect(result.toolsUsed.map((t) => t.name)).toEqual([
      "buscar_processos",
      ESCALATION_TOOL_NAME,
      "buscar_processos",
    ]);
    const modelEvents = events.filter((e) => e.type === "model");
    expect(modelEvents).toEqual([
      { type: "model", tier: "rapido", model: HAIKU, escalated: false },
      { type: "model", tier: "detalhado", model: SONNET, escalated: true },
    ]);
  });

  it("com arquivo, começa no Sonnet e não oferece a escalada", async () => {
    const { client, calls } = fakeClient([message([textBlock("Li o PDF.")], "end_turn")]);
    const result = await routed(client, { initialTier: chooseInitialTier({ hasAttachment: true }) });
    expect(calls[0].model).toBe(SONNET);
    expect(toolNames(calls[0])).not.toContain(ESCALATION_TOOL_NAME);
    expect(result).toMatchObject({ tier: "detalhado", escalated: false });
  });

  it("orçamento pausado: o Haiku recebe o aviso e responde como puder", async () => {
    const { client, calls } = fakeClient([
      message([toolUse("tu_1", ESCALATION_TOOL_NAME, { motivo: "pergunta complexa" })], "tool_use"),
      message([textBlock("Resposta resumida. A análise detalhada está pausada pelo limite do mês.")], "end_turn"),
    ]);
    const result = await routed(client, { detailedAllowed: false });
    expect(calls.map((c) => c.model)).toEqual([HAIKU, HAIKU]);
    const toolResult = (calls[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "tu_1", content: ESCALATION_PAUSED_MESSAGE });
    expect(result).toMatchObject({ escalated: false, model: HAIKU });
  });

  it("não escala depois de criar rascunho (não duplica)", async () => {
    let drafts = 0;
    const fakeDraftTool: AssistantTool = {
      name: "preparar_tarefa",
      label: "Preparando a tarefa",
      description: "teste",
      schema: z.object({ title: z.string() }),
      writeOnly: true,
      run: async () => ({ rascunho_id: `d${++drafts}` }),
    };
    const { client, calls } = fakeClient([
      message([toolUse("tu_1", "preparar_tarefa", { title: "Ligar" })], "tool_use"),
      message([toolUse("tu_2", ESCALATION_TOOL_NAME, { motivo: "não sei" })], "tool_use"),
      message([textBlock("Preparei a tarefa.")], "end_turn"),
    ]);
    const result = await routed(client, { tools: [fakeDraftTool] });
    expect(drafts).toBe(1);
    expect(calls.every((c) => c.model === HAIKU)).toBe(true);
    expect(result.escalated).toBe(false);
    expect(result.toolsUsed.filter((t) => t.draftId)).toHaveLength(1);
  });

  it("pedido de escalada junto com preparar_* na mesma rodada: nega e o rascunho sai uma vez só", async () => {
    let drafts = 0;
    const fakeDraftTool: AssistantTool = {
      name: "preparar_tarefa",
      label: "Preparando a tarefa",
      description: "teste",
      schema: z.object({ title: z.string() }),
      writeOnly: true,
      run: async () => ({ rascunho_id: `d${++drafts}` }),
    };
    const { client, calls } = fakeClient([
      message(
        [toolUse("tu_1", "preparar_tarefa", { title: "Ligar" }), toolUse("tu_2", ESCALATION_TOOL_NAME, { motivo: "x" })],
        "tool_use"
      ),
      message([textBlock("Preparei.")], "end_turn"),
    ]);
    const result = await routed(client, { tools: [fakeDraftTool] });
    expect(drafts).toBe(1);
    expect(calls).toHaveLength(2);
    expect(result.escalated).toBe(false);
  });
});

describe("custo por modelo", () => {
  it("soma cada parte com o preço do modelo que a fez", () => {
    const u = { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 };
    // Haiku 0,10 + 0,50; Sonnet 2 + 10
    expect(computeTurnCostUsd({ [HAIKU]: u, [SONNET]: u })).toBeCloseTo(12.6, 6);
  });

  it("no turno escalado, o custo não é calculado todo com um modelo só", async () => {
    const { client } = fakeClient([
      message([toolUse("tu_1", ESCALATION_TOOL_NAME, { motivo: "muitos andamentos" })], "tool_use", 1000),
      message([textBlock("Detalhado.")], "end_turn", 500),
    ]);
    const result = await routed(client);
    const haiku = { input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 };
    const sonnet = { input: 500, output: 500, cacheRead: 0, cacheWrite: 0 };
    expect(result.usageByModel).toEqual({ [HAIKU]: haiku, [SONNET]: sonnet });
    expect(result.costUsd).toBeCloseTo(computeCostUsd(HAIKU, haiku) + computeCostUsd(SONNET, sonnet), 6);
    expect(result.usage).toEqual({ input: 1500, output: 1500, cacheRead: 0, cacheWrite: 0 });
  });
});
