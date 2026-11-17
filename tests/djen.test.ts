import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanDjenText,
  extractCnjNumbers,
  extractLawyersFromText,
  maskCnj,
  normalizeDjenItem,
  parseDjenDate,
  parseDjenEnvelope,
  parseDjenItems,
} from "@/lib/djen/parse";
import { djenKey, splitNewAndSeen, stableTextHash } from "@/lib/djen/dedupe";
import { djenSearchWindow } from "@/lib/djen/window";
import {
  DJEN_GEOBLOCK_MESSAGE,
  fetchAllDjenCommunications,
  fetchDjenCommunications,
} from "@/lib/djen/client";

/** Item real visto no DJEN em 17/11/2026. */
const REAL_ITEM = {
  id: 787900059,
  data_disponibilizacao: "2026-11-16",
  siglaTribunal: "TJSP",
  tipoComunicacao: "Intimação",
  nomeOrgao: "Foro de Embu-Guaçu - Vara Única",
  idOrgao: 71279,
  texto:
    "Processo 0000468-20.2020.8.26.0177 (processo principal 1001103-18.2019.8.26.0177) - Cumprimento de Sentença de Obrigação de Prestar Alimentos - Dissolução - A.M.R.P.S. - J.C.B.J. - Processo Desarquivado com Reabertura - ADV: RONALDO GONÇALVES SILVA (OAB 239932/SP), EDUWARD RODRIGUES DE SOUZA (OAB 483881/SP), JEAN CARLOS BRAZ DE JESUS (OAB 459159/SP), CARLOS ALBERTO DOS SANTOS FELIX (OAB 386828/SP)",
  numero_processo: "00004682020208260177",
  meio: "D",
  link: "https://www.dje.tjsp.jus.br",
  tipoDocumento: "Intimação",
  nomeClasse: "CUMPRIMENTO DE SENTENÇA DE OBRIGAÇÃO DE PRESTAR ALIMENTOS",
  codigoClasse: "12246",
  numeroComunicacao: 296393,
  ativo: true,
  hash: "Mg9oWrB69XsXmMaUjTpDEX7RzwDv82",
  status: "P",
  motivo_cancelamento: null,
  data_cancelamento: null,
  datadisponibilizacao: "16/11/2026",
  meiocompleto: "Diário de Justiça Eletrônico Nacional",
  numeroprocessocommascara: "0000468-20.2020.8.26.0177",
  destinatarios: [
    { comunicacao_id: 787900059, nome: "A.M.R.P.S.", polo: "A" },
    { comunicacao_id: 787900059, nome: "J.C.B.J.", polo: "P" },
  ],
  destinatarioadvogados: [
    {
      id: 1488529588,
      comunicacao_id: 787900059,
      advogado_id: 3600613,
      created_at: "2026-11-13T21:20:15",
      updated_at: "2026-11-13T21:20:15",
      advogado: { id: 3600613, nome: "RONALDO GONÇALVES SILVA", numero_oab: "239932", uf_oab: "SP" },
    },
  ],
};

const QUERY = { oab: "459.159", uf: "sp", from: "2026-11-10", to: "2026-11-17" };

const GEOBLOCK_HTML = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<HTML><HEAD><TITLE>ERROR: The request could not be satisfied</TITLE></HEAD><BODY>
<H1>403 ERROR</H1><H2>The request could not be satisfied.</H2>
The Amazon CloudFront distribution is configured to block access from your country.
</BODY></HTML>`;

function item(id: number, extra: Record<string, unknown> = {}) {
  return { ...REAL_ITEM, id, hash: `h${id}`, ...extra };
}

function okBody(items: unknown[], count: number) {
  return new Response(JSON.stringify({ status: "success", message: "Sucesso", count, items }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("normalização do item do DJEN", () => {
  it("normaliza o item real", () => {
    const r = normalizeDjenItem(REAL_ITEM);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const it = r.item;
    expect(it).toMatchObject({
      externalId: "787900059",
      hash: "Mg9oWrB69XsXmMaUjTpDEX7RzwDv82",
      availableDate: "2026-11-16",
      tribunal: "TJSP",
      organ: "Foro de Embu-Guaçu - Vara Única",
      kind: "Intimação",
      documentType: "Intimação",
      className: "CUMPRIMENTO DE SENTENÇA DE OBRIGAÇÃO DE PRESTAR ALIMENTOS",
      processNumber: "00004682020208260177",
      processNumberMasked: "0000468-20.2020.8.26.0177",
      link: "https://www.dje.tjsp.jus.br",
      cancelled: false,
      cancelReason: null,
      relatedProcessNumbers: ["10011031820198260177"],
    });
    expect(it.text).toBe(REAL_ITEM.texto);
    expect(it.parties).toEqual([
      { name: "A.M.R.P.S.", side: "ativo" },
      { name: "J.C.B.J.", side: "passivo" },
    ]);
    // O da lista do DJEN vem primeiro; os outros saem do texto, sem repetir.
    expect(it.lawyers).toEqual([
      { name: "RONALDO GONÇALVES SILVA", oab: "239932", uf: "SP" },
      { name: "EDUWARD RODRIGUES DE SOUZA", oab: "483881", uf: "SP" },
      { name: "JEAN CARLOS BRAZ DE JESUS", oab: "459159", uf: "SP" },
      { name: "CARLOS ALBERTO DOS SANTOS FELIX", oab: "386828", uf: "SP" },
    ]);
  });

  it("acha o processo no texto quando o campo vem vazio", () => {
    const r = normalizeDjenItem({ ...REAL_ITEM, numero_processo: "", numeroprocessocommascara: null });
    expect(r.ok && r.item.processNumber).toBe("00004682020208260177");
    expect(r.ok && r.item.relatedProcessNumbers).toEqual(["10011031820198260177"]);
  });

  it("ignora número de processo com dígito verificador errado", () => {
    const r = normalizeDjenItem({
      ...REAL_ITEM,
      numero_processo: "00004682120208260177",
      numeroprocessocommascara: "",
      texto: "Intimação sem número no texto.",
    });
    expect(r.ok && r.item.processNumber).toBeNull();
    expect(r.ok && r.item.processNumberMasked).toBeNull();
  });

  it("marca como cancelado (ativo=false ou data de cancelamento)", () => {
    const a = normalizeDjenItem({ ...REAL_ITEM, ativo: false, motivo_cancelamento: "Publicado por engano" });
    expect(a.ok && a.item.cancelled).toBe(true);
    expect(a.ok && a.item.cancelReason).toBe("Publicado por engano");
    const b = normalizeDjenItem({ ...REAL_ITEM, data_cancelamento: "2026-11-17T10:00:00" });
    expect(b.ok && b.item.cancelled).toBe(true);
  });

  it("usa a data DD/MM/AAAA quando falta a outra", () => {
    const r = normalizeDjenItem({ ...REAL_ITEM, data_disponibilizacao: null });
    expect(r.ok && r.item.availableDate).toBe("2026-11-16");
  });

  it("um item ruim não derruba os outros", () => {
    const res = parseDjenItems([
      REAL_ITEM,
      "lixo",
      { ...REAL_ITEM, id: 2, data_disponibilizacao: "2026-02-30", datadisponibilizacao: null },
      { data_disponibilizacao: "2026-11-16" },
      { ...REAL_ITEM, id: 3, destinatarios: "x", destinatarioadvogados: [null, { advogado: 5 }], campoNovo: { a: 1 } },
    ]);
    expect(res.items.map((i) => i.externalId)).toEqual(["787900059", "3"]);
    expect(res.items[1].parties).toEqual([]);
    expect(res.rejected).toEqual([
      { index: 1, reason: "Item não é um objeto.", externalId: null },
      { index: 2, reason: "Sem data de disponibilização válida.", externalId: "2" },
      { index: 3, reason: "Sem id, hash nem texto.", externalId: null },
    ]);
    expect(parseDjenItems(null)).toEqual({ items: [], rejected: [] });
  });
});

describe("ajudantes do parser", () => {
  it("lê datas", () => {
    expect(parseDjenDate("2026-11-16")).toBe("2026-11-16");
    expect(parseDjenDate("2026-11-16T03:00:00")).toBe("2026-11-16");
    expect(parseDjenDate("16/11/2026")).toBe("2026-11-16");
    expect(parseDjenDate("31/02/2026")).toBeNull();
    expect(parseDjenDate("ontem")).toBeNull();
    expect(parseDjenDate(null)).toBeNull();
  });

  it("limpa o texto sem perder conteúdo", () => {
    expect(cleanDjenText("  Processo   123 \r\n\r\n\r\n\r\n Despacho:\t\tvista  ")).toBe("Processo 123\n\nDespacho: vista");
    expect(cleanDjenText("<p>Intime-se&nbsp;o r&eacute;u. &Ccedil;&atilde;o &xyz;</p><p>Prazo: 15 dias &amp; custas.</p>")).toBe(
      "Intime-se o réu. Ção &xyz;\nPrazo: 15 dias & custas.",
    );
    expect(cleanDjenText("A<br/>B")).toBe("A\nB");
    expect(cleanDjenText("valor < 10 e > 5")).toBe("valor < 10 e > 5");
    expect(cleanDjenText(null)).toBe("");
  });

  it("acha números CNJ com e sem máscara", () => {
    expect(extractCnjNumbers("proc. 00004682020208260177 e 1001103-18.2019.8.26.0177 e 0000468-21.2020.8.26.0177")).toEqual([
      "00004682020208260177",
      "10011031820198260177",
    ]);
    expect(maskCnj("10011031820198260177")).toBe("1001103-18.2019.8.26.0177");
  });

  it("acha advogados no texto em formatos comuns", () => {
    expect(extractLawyersFromText("ADV: FULANO DE TAL (OAB: 12.345/RJ), BELTRANA (OAB 007/sp)")).toEqual([
      { name: "FULANO DE TAL", oab: "12345", uf: "RJ" },
    ]);
  });

  it("confere o envelope", () => {
    expect(parseDjenEnvelope({ status: "success", count: "61", items: [] })).toEqual({ ok: true, count: 61, rawItems: [] });
    expect(parseDjenEnvelope({ items: [1] })).toEqual({ ok: true, count: null, rawItems: [1] });
    expect(parseDjenEnvelope({ status: "error", message: "Parâmetro inválido" })).toEqual({
      ok: false,
      error: "O DJEN respondeu com erro: Parâmetro inválido",
    });
    expect(parseDjenEnvelope({ status: "success" }).ok).toBe(false);
    expect(parseDjenEnvelope([]).ok).toBe(false);
    expect(parseDjenEnvelope("oi").ok).toBe(false);
  });
});

describe("chave e separação de novos", () => {
  const base = { availableDate: "2026-11-16", processNumber: "00004682020208260177", text: "abc" };

  it("usa id, depois hash, depois o texto", () => {
    expect(djenKey({ ...base, externalId: "787900059", hash: "x" })).toBe("id:787900059");
    expect(djenKey({ ...base, externalId: null, hash: "Mg9o" })).toBe("hash:Mg9o");
    const k = djenKey({ ...base, externalId: " ", hash: null });
    expect(k).toMatch(/^txt:[0-9a-f]{16}$/);
    expect(djenKey({ ...base, externalId: null, hash: null })).toBe(k);
    expect(djenKey({ ...base, externalId: null, hash: null, text: "abd" })).not.toBe(k);
    expect(stableTextHash("abc")).toBe(stableTextHash("abc"));
  });

  it("separa novos e já vistos, inclusive repetidos no lote", () => {
    const items = [
      { ...base, externalId: "1", hash: null },
      { ...base, externalId: "2", hash: null },
      { ...base, externalId: "2", hash: null },
      { ...base, externalId: null, hash: "h3" },
    ];
    const { fresh, seen } = splitNewAndSeen(items, ["id:1"]);
    expect(fresh.map((i) => i.key)).toEqual(["id:2", "hash:h3"]);
    expect(seen.map((i) => i.key)).toEqual(["id:1", "id:2"]);
  });
});

describe("janela de busca", () => {
  // 17/11/2026 01:30 em UTC ainda é 16/11 em Brasília.
  const lateNight = new Date("2026-11-17T01:30:00Z");
  const now = new Date("2026-11-17T15:00:00Z");

  it("primeira execução: últimos 30 dias", () => {
    expect(djenSearchWindow(null, now)).toEqual({ from: "2026-10-18", to: "2026-11-17", firstRun: true });
    expect(djenSearchWindow("data-ruim", now).firstRun).toBe(true);
  });

  it("repete um dia antes do último buscado, até hoje em Brasília", () => {
    expect(djenSearchWindow("2026-11-17", now)).toEqual({ from: "2026-11-16", to: "2026-11-17", firstRun: false });
    expect(djenSearchWindow("2026-11-01", now)).toEqual({ from: "2026-10-31", to: "2026-11-17", firstRun: false });
    expect(djenSearchWindow("2026-11-15", lateNight)).toEqual({ from: "2026-11-14", to: "2026-11-16", firstRun: false });
  });

  it("data no futuro busca só hoje", () => {
    expect(djenSearchWindow("2026-12-25", now)).toEqual({ from: "2026-11-17", to: "2026-11-17", firstRun: false });
  });
});

describe("cliente do DJEN", () => {
  it("monta a URL e normaliza a página", async () => {
    vi.stubEnv("DJEN_BASE_URL", "https://djen.teste/");
    const fetchMock = vi.fn(async () => okBody([REAL_ITEM], 1));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchDjenCommunications({ ...QUERY, page: 2, perPage: 500 });
    expect(res.ok).toBe(true);
    expect(res.items[0].externalId).toBe("787900059");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://djen.teste/api/v1/comunicacao");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      numeroOab: "459159",
      ufOab: "SP",
      dataDisponibilizacaoInicio: "2026-11-10",
      dataDisponibilizacaoFim: "2026-11-17",
      pagina: "2",
      itensPorPagina: "100",
    });
    expect(init.method).toBe("GET");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("recusa filtros ruins sem chamar a API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchDjenCommunications({ ...QUERY, oab: "" })).toMatchObject({ ok: false, retry: false });
    expect(await fetchDjenCommunications({ ...QUERY, uf: "São Paulo" })).toMatchObject({ ok: false, retry: false });
    expect(await fetchDjenCommunications({ ...QUERY, from: "2026-11-18" })).toMatchObject({
      ok: false,
      error: "A data inicial é depois da data final.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explica o bloqueio de país (403 do CloudFront)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(GEOBLOCK_HTML, { status: 403, headers: { server: "CloudFront" } })),
    );
    const res = await fetchDjenCommunications(QUERY);
    expect(res).toEqual({ ok: false, items: [], rejected: [], error: DJEN_GEOBLOCK_MESSAGE, retry: false });
    expect(DJEN_GEOBLOCK_MESSAGE).toBe(
      "O DJEN só aceita acesso a partir do Brasil. Confira se o CRM está rodando na região de São Paulo.",
    );
  });

  it("429 e 5xx pedem nova tentativa; 4xx não", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    expect(await fetchDjenCommunications(QUERY)).toMatchObject({ ok: false, retry: true, error: expect.stringContaining("Limite") });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await fetchDjenCommunications(QUERY)).toMatchObject({ ok: false, retry: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 400 })));
    expect(await fetchDjenCommunications(QUERY)).toMatchObject({ ok: false, retry: false });
  });

  it("trata rede fora, demora e JSON inesperado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await fetchDjenCommunications(QUERY)).toMatchObject({ ok: false, retry: true, error: "Não foi possível falar com o DJEN." });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" }))));
    expect(await fetchDjenCommunications(QUERY)).toMatchObject({ ok: false, error: "O DJEN demorou demais para responder." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oi</html>", { status: 200 })));
    expect(await fetchDjenCommunications(QUERY)).toMatchObject({ ok: false, retry: true, error: "Resposta do DJEN em formato inesperado." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "success", count: 3 }))));
    expect(await fetchDjenCommunications(QUERY)).toMatchObject({ ok: false, retry: true });
  });

  it("percorre várias páginas até o count", async () => {
    const pages: Record<string, unknown[]> = {
      "1": [item(1), item(2)],
      "2": [item(2), "lixo"], // item 2 repetido (página deslocada) e um ruim
      "3": [item(4)],
    };
    const fetchMock = vi.fn(async (url: string) => {
      const p = new URL(url).searchParams.get("pagina") ?? "1";
      return okBody(pages[p] ?? [], 5);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchAllDjenCommunications({ ...QUERY, perPage: 2, delayMs: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.pages).toBe(3);
    expect(res.truncated).toBe(false);
    expect(res.count).toBe(5);
    expect(res.items.map((i) => i.externalId)).toEqual(["1", "2", "4"]);
    expect(res.rejected).toEqual([{ index: 3, reason: "Item não é um objeto.", externalId: null }]);
  });

  it("para no limite de páginas", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => okBody([item(++n), item(++n)], 1000)));
    const res = await fetchAllDjenCommunications({ ...QUERY, perPage: 2, maxPages: 3, delayMs: 0 });
    expect(res).toMatchObject({ ok: true, pages: 3, truncated: true });
    expect(res.items).toHaveLength(6);
  });

  it("para na página vazia mesmo sem count", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const p = new URL(url).searchParams.get("pagina");
      return new Response(JSON.stringify({ status: "success", items: p === "1" ? [item(1), item(2)] : [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchAllDjenCommunications({ ...QUERY, perPage: 2, delayMs: 0 });
    expect(res).toMatchObject({ ok: true, pages: 2, truncated: false, count: null });
    expect(res.items).toHaveLength(2);
  });

  it("erro no meio devolve o que já leu e o pedido de nova tentativa", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new URL(url).searchParams.get("pagina") === "1" ? okBody([item(1), item(2)], 4) : new Response("", { status: 429 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchAllDjenCommunications({ ...QUERY, perPage: 2, delayMs: 0 });
    expect(res).toMatchObject({ ok: false, retry: true, pages: 2 });
    expect(res.items.map((i) => i.externalId)).toEqual(["1", "2"]);
  });

  it("geobloqueio na busca completa não pede nova tentativa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(GEOBLOCK_HTML, { status: 403 })));
    const res = await fetchAllDjenCommunications({ ...QUERY, delayMs: 0 });
    expect(res).toMatchObject({ ok: false, retry: false, error: DJEN_GEOBLOCK_MESSAGE, pages: 1 });
  });
});
