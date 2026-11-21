import { describe, expect, it } from "vitest";
import {
  applyViewFilters,
  filterOptions,
  intimacoesHref,
  parseViewOptions,
  sortForView,
} from "@/lib/intimacoes/list-view";
import type { CourtPublication, PublicationAiReading } from "@/lib/intimacoes/types";

function reading(over: Partial<PublicationAiReading> = {}): PublicationAiReading {
  return {
    actType: "Intimação para réplica",
    summary: "Prazo para réplica à contestação.",
    requiresAction: true,
    suggestedDays: 15,
    suggestedUnit: "uteis",
    startKind: "disponibilizacao",
    dobro: false,
    taskTitle: null,
    legalBasis: null,
    quote: null,
    uncertain: [],
    confidence: "alta",
    ...over,
  } as PublicationAiReading;
}

function pub(id: string, over: Partial<CourtPublication> = {}): CourtPublication {
  return {
    id,
    available_date: "2026-11-10",
    created_at: `2026-11-10T10:00:0${id.length % 10}Z`,
    tribunal: "TJSP",
    organ: "Foro de Embu-Guaçu - Vara Única",
    kind: "Intimação",
    document_type: null,
    class_name: null,
    process_number: "00004682020208260177",
    process_number_masked: "0000468-20.2020.8.26.0177",
    process_id: null,
    text: "Texto da intimação",
    parties: [{ name: "Maria Aparecida", side: "ativo" }],
    cancelled: false,
    status: "para_conferir",
    ai_status: "pronta",
    ai_reading: reading(),
    ...over,
  } as CourtPublication;
}

const A = pub("a", { available_date: "2026-11-01", ai_reading: reading({ suggestedDays: 5, suggestedUnit: "corridos" }) });
const B = pub("bb", {
  available_date: "2026-11-15",
  tribunal: "TRT2",
  organ: "1ª Vara do Trabalho",
  process_number: "10011031820195020177",
  parties: [{ name: "João Sebastião", side: "passivo" }],
  ai_reading: reading({ actType: "Sentença", requiresAction: false, suggestedDays: null, suggestedUnit: null, confidence: "baixa" }),
});
const C = pub("ccc", { available_date: "2026-11-08", cancelled: true, ai_reading: reading({ suggestedDays: 15, dobro: true }) });
const ALL = [A, B, C];

describe("parseViewOptions", () => {
  it("usa padrões seguros e ignora valores inválidos", () => {
    expect(parseViewOptions({ ordem: "xpto", vista: "kanban", acao: "sim" })).toMatchObject({
      ordem: "padrao",
      vista: "tabela",
      acao: false,
      q: null,
    });
  });
  it("lê filtros e ordem da URL", () => {
    const o = parseViewOptions({ q: "  maria ", tribunal: "TJSP", ordem: "prazo", vista: "lista", duvida: "1" });
    expect(o).toMatchObject({ q: "maria", tribunal: "TJSP", ordem: "prazo", vista: "lista", duvida: true });
  });
});

describe("applyViewFilters", () => {
  const base = parseViewOptions({});
  it("busca sem acento por parte e por número do processo", () => {
    expect(applyViewFilters(ALL, { ...base, q: "joao sebastiao" }).map((p) => p.id)).toEqual(["bb"]);
    expect(applyViewFilters(ALL, { ...base, q: "1001103" }).map((p) => p.id)).toEqual(["bb"]);
  });
  it("filtra por tribunal, tipo, providência, dúvida e cancelada", () => {
    expect(applyViewFilters(ALL, { ...base, tribunal: "TRT2" }).map((p) => p.id)).toEqual(["bb"]);
    expect(applyViewFilters(ALL, { ...base, tipo: "Sentença" }).map((p) => p.id)).toEqual(["bb"]);
    expect(applyViewFilters(ALL, { ...base, acao: true }).map((p) => p.id)).toEqual(["a", "ccc"]);
    expect(applyViewFilters(ALL, { ...base, duvida: true }).map((p) => p.id)).toEqual(["bb"]);
    expect(applyViewFilters(ALL, { ...base, cancelada: true }).map((p) => p.id)).toEqual(["ccc"]);
  });
});

describe("sortForView", () => {
  it("padrão mantém a ordem do servidor", () => {
    expect(sortForView(ALL, "padrao")).toBe(ALL);
  });
  it("ordena por data nos dois sentidos", () => {
    expect(sortForView(ALL, "recentes").map((p) => p.id)).toEqual(["bb", "ccc", "a"]);
    expect(sortForView(ALL, "antigas").map((p) => p.id)).toEqual(["a", "ccc", "bb"]);
  });
  it("menor prazo primeiro e sem prazo no fim", () => {
    expect(sortForView(ALL, "prazo").map((p) => p.id)).toEqual(["a", "ccc", "bb"]);
  });
  it("tribunal em ordem alfabética", () => {
    expect(sortForView(ALL, "tribunal").map((p) => p.id)).toEqual(["a", "ccc", "bb"]);
  });
  it("não altera a lista original", () => {
    const copy = [...ALL];
    sortForView(ALL, "recentes");
    expect(ALL).toEqual(copy);
  });
});

describe("filterOptions e intimacoesHref", () => {
  it("lista valores distintos em ordem", () => {
    const o = filterOptions(ALL);
    expect(o.tribunais).toEqual(["TJSP", "TRT2"]);
    expect(o.tipos).toEqual(["Intimação para réplica", "Sentença"]);
  });
  it("mantém os parâmetros e troca só o pedido", () => {
    expect(intimacoesHref({ status: "todas", q: "maria" }, { ordem: "prazo" })).toBe(
      "/intimacoes?status=todas&q=maria&ordem=prazo"
    );
    expect(intimacoesHref({ vista: "lista" }, { vista: null })).toBe("/intimacoes");
  });
});
