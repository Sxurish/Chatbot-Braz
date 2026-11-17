import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { ASSISTANT_DOC_MODEL } from "@/lib/assistant/config";
import {
  AI_OFF_BUDGET,
  AI_OFF_NO_KEY,
  readPendingPublications,
  type AiMessagesClient,
} from "@/lib/intimacoes/ai-read";
import {
  AI_MAX_TEXT_CHARS,
  AI_READING_JSON_SCHEMA,
  AI_READING_SYSTEM_PROMPT,
  CUT_MARK,
  buildUserMessage,
  parseAiReading,
  truncateForAi,
} from "@/lib/intimacoes/ai-prompt";
import { getAiMonthSpendUsd, getIntimacoesMonthCostUsd } from "@/lib/intimacoes/ai-cost";
import { fakeDb, type Row } from "./helpers/intimacoes-fake-db";

const NOW = new Date("2026-11-17T10:00:00-03:00");

const TEXT =
  "Vistos. Manifeste-se a parte autora sobre a contestação e documentos, no prazo de 15 (quinze) dias. Int.";

function pub(id: string, extra: Row = {}): Row {
  return {
    id,
    status: "para_conferir",
    cancelled: false,
    ai_status: "pendente",
    ai_reading: null,
    ai_error: null,
    tribunal: "TJSP",
    organ: "1ª Vara Cível de Santo André",
    kind: "Intimação",
    document_type: "Despacho",
    class_name: "Procedimento Comum Cível",
    process_number: "10023456720268260554",
    process_number_masked: "1002345-67.2026.8.26.0554",
    available_date: "2026-11-16",
    publication_date: "2026-11-17",
    parties: [
      { name: "MARIA DA SILVA", side: "ativo" },
      { name: "BANCO EXEMPLO S.A.", side: "passivo" },
    ],
    lawyers: [{ name: "JEAN BRAZ", oab: "459159", uf: "SP" }],
    text: TEXT,
    captured_at: "2026-11-17T09:00:00Z",
    ...extra,
  };
}

const GOOD = {
  actType: "Intimação para réplica",
  summary: "O juiz mandou a parte autora se manifestar sobre a contestação e os documentos.",
  requiresAction: true,
  suggestedDays: 15,
  suggestedUnit: "uteis",
  startKind: "disponibilizacao",
  dobro: false,
  taskTitle: "Réplica à contestação",
  legalBasis: "CPC, arts. 350 e 351",
  quote: "Manifeste-se a parte autora sobre a contestação e documentos, no prazo de 15 (quinze) dias.",
  uncertain: [],
  confidence: "alta",
};

function message(text: string, stop: Anthropic.StopReason = "end_turn"): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: ASSISTANT_DOC_MODEL,
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 2000, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

function fakeAi(replies: (string | Error)[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: AiMessagesClient = {
    messages: {
      async create(params) {
        calls.push(params);
        const r = replies[calls.length - 1] ?? replies[replies.length - 1];
        if (r instanceof Error) throw r;
        return message(r);
      },
    },
  };
  return { client, calls };
}

describe("leitura das intimações pela IA", () => {
  it("saída boa: grava a leitura, o custo e marca como pronta", async () => {
    const { client: db, tables } = fakeDb({ court_publications: [pub("p1")] });
    const ai = fakeAi([JSON.stringify(GOOD)]);
    const r = await readPendingPublications(db, { client: ai.client, now: NOW, monthSpendUsd: 1, monthlyLimitUsd: 50 });

    expect(r).toMatchObject({ read: 1, failed: 0, skipped: 0, disabled: false });
    expect(r.costUsd).toBeGreaterThan(0);
    const row = tables.court_publications[0];
    expect(row.ai_status).toBe("pronta");
    expect(row.ai_error).toBeNull();
    expect(row.ai_reading).toMatchObject({ suggestedDays: 15, suggestedUnit: "uteis", confidence: "alta", uncertain: [] });
    expect(row.ai_model).toBe(ASSISTANT_DOC_MODEL);
    expect(Number(row.ai_cost_usd)).toBe(r.costUsd);
    expect(row.ai_input_tokens).toBe(2000);
    expect(row.ai_output_tokens).toBe(400);

    // Pedido: modelo da config, saída estruturada e o texto da intimação.
    const req = ai.calls[0];
    expect(req.model).toBe(ASSISTANT_DOC_MODEL);
    expect(req.output_config?.format).toEqual({ type: "json_schema", schema: AI_READING_JSON_SCHEMA });
    expect(JSON.stringify(req.messages)).toContain("Manifeste-se a parte autora");
    expect(JSON.stringify(req.messages)).toContain("BANCO EXEMPLO S.A. (polo passivo)");
  });

  it("saída inválida: marca falhou com motivo curto e segue para a próxima", async () => {
    const { client: db, tables } = fakeDb({
      court_publications: [pub("p1"), pub("p2"), pub("p3")],
    });
    const ai = fakeAi([
      "isto não é JSON",
      JSON.stringify({ ...GOOD, suggestedDays: "quinze" }),
      JSON.stringify(GOOD),
    ]);
    const r = await readPendingPublications(db, { client: ai.client, now: NOW, monthSpendUsd: 0, monthlyLimitUsd: 50 });
    expect(r).toMatchObject({ read: 1, failed: 2, disabled: false });
    const [a, b, c] = tables.court_publications;
    expect(a.ai_status).toBe("falhou");
    expect(String(a.ai_error)).toMatch(/fora do formato/);
    expect(String(a.ai_error).length).toBeLessThan(120);
    expect(b.ai_status).toBe("falhou");
    expect(String(b.ai_error)).toContain("suggestedDays");
    expect(c.ai_status).toBe("pronta");
  });

  it("erro da API não trava: falhou e continua", async () => {
    const { client: db, tables } = fakeDb({ court_publications: [pub("p1"), pub("p2")] });
    const ai = fakeAi([new Error("rede"), JSON.stringify(GOOD)]);
    const r = await readPendingPublications(db, { client: ai.client, now: NOW, monthSpendUsd: 0, monthlyLimitUsd: 50 });
    expect(r).toMatchObject({ read: 1, failed: 1 });
    expect(tables.court_publications[0].ai_status).toBe("falhou");
    expect(tables.court_publications[1].ai_status).toBe("pronta");
  });

  it("sem verba no mês: não chama a IA e marca desligada", async () => {
    const { client: db, tables } = fakeDb({ court_publications: [pub("p1"), pub("p2")] });
    const ai = fakeAi([JSON.stringify(GOOD)]);
    const r = await readPendingPublications(db, { client: ai.client, now: NOW, monthSpendUsd: 50, monthlyLimitUsd: 50 });
    expect(ai.calls).toHaveLength(0);
    expect(r).toMatchObject({ read: 0, failed: 0, skipped: 2, disabled: true, costUsd: 0 });
    for (const row of tables.court_publications) {
      expect(row.ai_status).toBe("desligada");
      expect(row.ai_error).toBe(AI_OFF_BUDGET);
    }
  });

  it("verba acaba no meio: o resto fica desligado", async () => {
    const { client: db, tables } = fakeDb({ court_publications: [pub("p1"), pub("p2")] });
    const ai = fakeAi([JSON.stringify(GOOD)]);
    // Limite 50, gasto 49,999: a 1ª leitura passa do limite.
    const r = await readPendingPublications(db, { client: ai.client, now: NOW, monthSpendUsd: 49.999, monthlyLimitUsd: 50 });
    expect(ai.calls).toHaveLength(1);
    expect(r).toMatchObject({ read: 1, skipped: 1, disabled: true });
    expect(tables.court_publications[1].ai_status).toBe("desligada");
  });

  it("sem chave da IA: desligada, e a conferência manual continua", async () => {
    const { client: db, tables } = fakeDb({ court_publications: [pub("p1")] });
    const r = await readPendingPublications(db, { client: null, now: NOW });
    expect(r).toMatchObject({ disabled: true, skipped: 1, read: 0 });
    expect(tables.court_publications[0]).toMatchObject({ ai_status: "desligada", ai_error: AI_OFF_NO_KEY, status: "para_conferir" });
  });

  it("com a IA de volta, lê as desligadas recentes; canceladas e conferidas ficam de fora", async () => {
    const { client: db, tables } = fakeDb({
      court_publications: [
        pub("p1", { ai_status: "desligada" }),
        pub("p2", { ai_status: "desligada", captured_at: "2026-10-01T09:00:00Z" }),
        pub("p3", { cancelled: true }),
        pub("p4", { status: "confirmada" }),
      ],
    });
    const ai = fakeAi([JSON.stringify(GOOD)]);
    const r = await readPendingPublications(db, { client: ai.client, now: NOW, monthSpendUsd: 0, monthlyLimitUsd: 50 });
    expect(r.read).toBe(1);
    expect(tables.court_publications.map((p) => p.ai_status)).toEqual(["pronta", "desligada", "pendente", "pendente"]);
  });

  it("respeita o limite por execução", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => pub(`p${i}`));
    const { client: db } = fakeDb({ court_publications: rows });
    const ai = fakeAi([JSON.stringify(GOOD)]);
    const r = await readPendingPublications(db, { client: ai.client, limit: 2, now: NOW, monthSpendUsd: 0, monthlyLimitUsd: 50 });
    expect(ai.calls).toHaveLength(2);
    expect(r.read).toBe(2);
  });
});

describe("validação da leitura", () => {
  it("trecho que não está no texto: descartado, prazo em dúvida e confiança média", () => {
    const r = parseAiReading(JSON.stringify({ ...GOOD, quote: "no prazo de 10 dias úteis" }), TEXT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reading.quote).toBeNull();
    expect(r.reading.uncertain).toContain("dias");
    expect(r.reading.confidence).toBe("media");
  });

  it("trecho igual com espaços e acentos diferentes é aceito", () => {
    const r = parseAiReading(
      JSON.stringify({ ...GOOD, quote: "manifeste-se  a parte autora sobre a contestacao" }),
      TEXT
    );
    expect(r.ok && r.reading.quote).toBeTruthy();
  });

  it("dias sem unidade vira dúvida; dúvidas desconhecidas somem", () => {
    const r = parseAiReading(JSON.stringify({ ...GOOD, suggestedUnit: null, uncertain: ["xyz", "DOBRO"] }), TEXT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reading.uncertain).toEqual(["unidade", "dobro"]);
    expect(r.reading.confidence).toBe("media");
  });

  it("texto cortado nunca dá confiança alta", () => {
    const r = parseAiReading(JSON.stringify(GOOD), TEXT, { cut: true });
    expect(r.ok && r.reading.confidence).toBe("media");
  });

  it("recusa prazo fora da faixa e campo faltando", () => {
    expect(parseAiReading(JSON.stringify({ ...GOOD, suggestedDays: 0 }), TEXT).ok).toBe(false);
    const { confidence: _c, ...missing } = GOOD;
    void _c;
    expect(parseAiReading(JSON.stringify(missing), TEXT).ok).toBe(false);
  });

  it("corta texto longo mantendo começo e fim", () => {
    const long = `INICIO ${"x".repeat(30_000)} FIM-DA-DECISAO`;
    const t = truncateForAi(long);
    expect(t.cut).toBe(true);
    expect(t.text.length).toBeLessThan(AI_MAX_TEXT_CHARS + 200);
    expect(t.text.startsWith("INICIO")).toBe(true);
    expect(t.text.endsWith("FIM-DA-DECISAO")).toBe(true);
    expect(t.text).toContain(CUT_MARK);
    expect(buildUserMessage({ ...(pub("p") as unknown as Parameters<typeof buildUserMessage>[0]), text: long }).cut).toBe(true);
  });

  it("as instruções ensinam as regras de prazo e não citam modelo", () => {
    const p = AI_READING_SYSTEM_PROMPT;
    expect(p).toContain("art. 1.003, § 5º");
    expect(p).toContain("art. 1.023");
    expect(p).toContain("art. 218, § 3º");
    expect(p).toContain("art. 335");
    expect(p).toContain("Lei 9.099/95");
    expect(p).toContain("Lei 13.728/2018");
    expect(p).toMatch(/Fazenda Pública.*art\. 183/);
    expect(p).toContain("Defensoria");
    expect(p).toMatch(/prazo que o juiz fixou no texto vale mais/);
    expect(p).toMatch(/uncertain/);
    expect(p).not.toMatch(/claude|haiku|sonnet|opus/i);
  });
});

describe("gasto do mês com intimações", () => {
  it("soma só o mês corrente e entra no gasto total da IA", async () => {
    const { client } = fakeDb({
      court_publications: [
        { id: "a", ai_cost_usd: 0.5, ai_read_at: "2026-11-02T12:00:00Z" },
        { id: "b", ai_cost_usd: "0.25", ai_read_at: "2026-11-10T12:00:00Z" },
        { id: "c", ai_cost_usd: 9, ai_read_at: "2026-10-30T12:00:00Z" },
      ],
      assistant_messages: [
        { id: "m1", cost_usd: 1, created_at: "2026-11-05T12:00:00Z" },
        { id: "m2", cost_usd: 7, created_at: "2026-10-05T12:00:00Z" },
      ],
    });
    expect(await getIntimacoesMonthCostUsd(client, NOW)).toBeCloseTo(0.75, 6);
    expect(await getAiMonthSpendUsd(client, NOW)).toBeCloseTo(1.75, 6);
  });
});
