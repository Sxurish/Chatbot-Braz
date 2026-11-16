import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildHistory, runAgent, type MessagesClientLike } from "@/lib/assistant/agent";
import { getToolsFor, type ToolContext } from "@/lib/assistant/tools";
import type { TeamUser } from "@/lib/types";

const user: TeamUser = {
  id: "u2",
  name: "Atendente Teste",
  email: "a@teste.dev",
  role: "atendente",
  active: true,
  last_login: null,
  created_at: "2026-01-01T00:00:00Z",
};
const ctx: ToolContext = { user, isAdmin: false, now: new Date("2026-05-30T12:00:00-03:00") };

function message(content: Anthropic.ContentBlock[], stop: Anthropic.StopReason): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 50,
    },
  } as unknown as Anthropic.Message;
}

/** Cliente falso: devolve respostas roteirizadas e guarda o que recebeu. */
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

const textBlock = (text: string) => ({ type: "text", text, citations: null }) as Anthropic.TextBlock;
const toolUse = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use", id, name, input }) as Anthropic.ToolUseBlock;

describe("laço do assistente", () => {
  it("executa a ferramenta, devolve o resultado e termina com texto", async () => {
    const { client, calls } = fakeClient([
      message([textBlock("Vou procurar."), toolUse("tu_1", "buscar_leads", { texto: "Fernanda" })], "tool_use"),
      message([textBlock("Achei [Fernanda Lima](/leads/lead-002).")], "end_turn"),
    ]);
    const events: string[] = [];
    const result = await runAgent({
      client,
      model: "claude-haiku-5-5",
      system: [{ type: "text", text: "sistema" }],
      tools: getToolsFor(false),
      messages: [{ role: "user", content: "Tem lead Fernanda?" }],
      ctx,
      onEvent: (e) => events.push(e.type === "tool" ? `tool:${e.name}` : "text"),
    });

    expect(result.text).toBe("Vou procurar.\n\nAchei [Fernanda Lima](/leads/lead-002).");
    expect(result.toolsUsed).toEqual([{ name: "buscar_leads", ok: true, links: ["/leads/lead-002"] }]);
    expect(result.usage).toEqual({ input: 200, output: 40, cacheRead: 100, cacheWrite: 0 });
    expect(events).toContain("tool:buscar_leads");

    // Segunda chamada recebe o turno do assistente intacto + o resultado da ferramenta.
    const second = calls[1].messages;
    expect(second[1]).toMatchObject({ role: "assistant" });
    const toolResult = (second[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });
    expect(String(toolResult.content)).toContain("Fernanda Lima");
    expect(calls[0].output_config).toEqual({ effort: "low" });
  });

  it("não entrega dados financeiros a quem não é Admin, mesmo se o modelo pedir", async () => {
    const { client, calls } = fakeClient([
      message([toolUse("tu_9", "resumo_financeiro", {})], "tool_use"),
      message([textBlock("Esses dados são restritos.")], "end_turn"),
    ]);
    const result = await runAgent({
      client,
      model: "claude-haiku-5-5",
      system: [],
      tools: getToolsFor(false),
      messages: [{ role: "user", content: "Quanto temos a receber?" }],
      ctx,
    });
    const toolResult = (calls[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect(toolResult.is_error).toBe(true);
    expect(String(toolResult.content)).not.toMatch(/recebido|a_receber/);
    expect(result.toolsUsed[0]).toMatchObject({ name: "resumo_financeiro", ok: false });
    // e a ferramenta nem foi oferecida
    expect(calls[0].tools?.map((t) => (t as Anthropic.Tool).name)).not.toContain("resumo_financeiro");
  });

  it("na última rodada desliga as ferramentas para forçar uma resposta", async () => {
    const loop = message([toolUse("tu_x", "listar_equipe", {})], "tool_use");
    const { client, calls } = fakeClient([loop, message([textBlock("Pronto.")], "end_turn")]);
    const result = await runAgent({
      client,
      model: "claude-haiku-5-5",
      system: [],
      tools: getToolsFor(false),
      messages: [{ role: "user", content: "equipe" }],
      ctx,
      maxRounds: 2,
    });
    expect(calls[0].tool_choice).toBeUndefined();
    expect(calls[1].tool_choice).toEqual({ type: "none" });
    expect(result.text).toBe("Pronto.");
  });

  it("trata recusa do modelo", async () => {
    const { client } = fakeClient([message([], "refusal")]);
    const result = await runAgent({
      client,
      model: "claude-haiku-5-5",
      system: [],
      tools: [],
      messages: [{ role: "user", content: "x" }],
      ctx,
    });
    expect(result.text).toMatch(/Não posso ajudar/);
  });
});

describe("histórico", () => {
  it("começa pelo usuário e junta mensagens seguidas do mesmo papel", () => {
    const history = buildHistory(
      [
        { role: "assistant", content: "sobra" },
        { role: "user", content: "a" },
        { role: "user", content: "b" },
        { role: "assistant", content: "c" },
      ],
      "d"
    );
    expect(history).toEqual([
      { role: "user", content: "a\n\nb" },
      { role: "assistant", content: "c" },
      { role: "user", content: "d" },
    ]);
  });
});
