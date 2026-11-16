import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidCnj, tribunalFromCnj } from "@/lib/datajud/tribunals";
import { describeMovement, parseDatajudDate, parseDatajudResponse } from "@/lib/datajud/parse";
import { fetchDatajudMovements } from "@/lib/datajud/client";
import { NOT_FOUND_MESSAGE, syncDueProcesses, syncProcess } from "@/lib/datajud/sync";

const SAMPLE = {
  hits: {
    hits: [
      {
        _source: {
          numeroProcesso: "10023456720268260554",
          tribunal: "TJSP",
          grau: "G1",
          classe: { codigo: 7, nome: "Procedimento Comum Cível" },
          orgaoJulgador: { nome: "1ª Vara Cível de Santo André" },
          dataHoraUltimaAtualizacao: "2026-11-10T08:00:00.000Z",
          movimentos: [
            {
              codigo: 26,
              nome: "Distribuição",
              dataHora: "2026-05-29T10:10:00.000Z",
              complementosTabelados: [{ codigo: 2, valor: 1, nome: "sorteio", descricao: "tipo_de_distribuicao" }],
            },
            { codigo: 51, nome: "Conclusão", dataHora: "20260602144200" },
            { codigo: 51, nome: "Conclusão", dataHora: "20260602144200" }, // repetido no tribunal
            { codigo: 60, nome: "Expedição de documento", dataHora: "data-ruim" },
          ],
        },
      },
      {
        _source: {
          grau: "G2",
          dataHoraUltimaAtualizacao: "2026-11-12T08:00:00.000Z",
          tribunal: "TJSP",
          classe: { nome: "Apelação Cível" },
          movimentos: [{ codigo: 26, nome: "Distribuição", dataHora: "2026-10-01T09:00:00" }],
        },
      },
    ],
  },
};

describe("tribunal pelo número CNJ", () => {
  it("acha o endpoint de cada justiça", () => {
    expect(tribunalFromCnj("1002345-67.2026.8.26.0554")).toEqual({ alias: "tjsp", label: "TJSP" });
    expect(tribunalFromCnj("0000000-00.2026.8.07.0001")?.alias).toBe("tjdft");
    expect(tribunalFromCnj("0000000-00.2026.4.03.6100")?.alias).toBe("trf3");
    expect(tribunalFromCnj("0000000-00.2026.5.02.0001")?.alias).toBe("trt2");
    expect(tribunalFromCnj("0000000-00.2026.5.00.0000")?.alias).toBe("tst");
    expect(tribunalFromCnj("0000000-00.2026.6.26.0001")?.alias).toBe("tre-sp");
    expect(tribunalFromCnj("0000000-00.2026.3.00.0000")?.alias).toBe("stj");
    expect(tribunalFromCnj("0000000-00.2026.9.26.0001")?.alias).toBe("tjmsp");
  });

  it("recusa STF, número incompleto e tribunal inexistente", () => {
    expect(tribunalFromCnj("0000000-00.2026.1.00.0000")).toBeNull();
    expect(tribunalFromCnj("12345")).toBeNull();
    expect(tribunalFromCnj("0000000-00.2026.4.09.0001")).toBeNull();
  });

  it("confere o dígito verificador", () => {
    expect(isValidCnj("0000832-35.2018.4.01.3202")).toBe(true);
    expect(isValidCnj("0000832-36.2018.4.01.3202")).toBe(false);
  });
});

describe("resposta do DataJud", () => {
  it("lê datas nos formatos do DataJud", () => {
    expect(parseDatajudDate("20260602144200")).toBe("2026-06-02T17:42:00.000Z");
    expect(parseDatajudDate("2026-10-01T09:00:00")).toBe("2026-10-01T12:00:00.000Z");
    expect(parseDatajudDate("2026-05-29T10:10:00.000Z")).toBe("2026-05-29T10:10:00.000Z");
    expect(parseDatajudDate("data-ruim")).toBeNull();
  });

  it("junta os graus, tira repetidos e ignora datas inválidas", () => {
    const { rows, info, found } = parseDatajudResponse(SAMPLE);
    expect(found).toBe(true);
    expect(rows.map((r) => r.description)).toEqual(["Distribuição (sorteio)", "Conclusão", "Distribuição"]);
    expect(rows.map((r) => r.instance)).toEqual(["G1", "G1", "G2"]);
    expect(new Set(rows.map((r) => r.external_key)).size).toBe(3);
    expect(info).toMatchObject({ className: "Apelação Cível", instances: ["G1", "G2"] });
  });

  it("a chave do andamento é estável entre buscas", () => {
    const a = parseDatajudResponse(SAMPLE).rows.map((r) => r.external_key);
    const b = parseDatajudResponse(JSON.parse(JSON.stringify(SAMPLE))).rows.map((r) => r.external_key);
    expect(a).toEqual(b);
  });

  it("descreve o movimento sem repetir o complemento", () => {
    expect(describeMovement({ nome: "Juntada", complementosTabelados: [{ nome: "Petição" }, { nome: "Petição" }] })).toBe(
      "Juntada (Petição)"
    );
    expect(describeMovement({ codigo: 123 })).toBe("Movimento 123");
  });
});

describe("consulta ao DataJud", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("monta a busca pelo número e explica erros em português", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(SAMPLE), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ok = await fetchDatajudMovements("1002345-67.2026.8.26.0554");
    expect(ok.ok && ok.rows.length).toBe(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api_publica_tjsp\/_search$/);
    expect(JSON.parse(String(init.body)).query.match.numeroProcesso).toBe("10023456720268260554");
    expect(String((init.headers as Record<string, string>).Authorization)).toMatch(/^APIKey /);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const denied = await fetchDatajudMovements("1002345-67.2026.8.26.0554");
    expect(!denied.ok && denied.error).toMatch(/chave/);

    expect(await fetchDatajudMovements("123")).toMatchObject({ ok: false, retry: false });
  });
});

/** Cliente Supabase falso: registra as chamadas de rpc e insert. */
function fakeSupabase(rpcResult: { inserted: number; first_sync: boolean }, processes: unknown[] = []) {
  const calls: { rpc: unknown[]; inserts: unknown[] } = { rpc: [], inserts: [] };
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    not: () => chain,
    or: () => chain,
    order: () => chain,
    limit: async () => ({ data: processes, error: null }),
  };
  const client = {
    rpc: async (_name: string, args: unknown) => {
      calls.rpc.push(args);
      return { data: [rpcResult], error: null };
    },
    from: (table: string) => ({
      ...chain,
      insert: async (row: unknown) => {
        calls.inserts.push({ table, row });
        return { error: null };
      },
    }),
  };
  return { client: client as never, calls };
}

describe("sincronização", () => {
  afterEach(() => vi.unstubAllGlobals());
  const target = { id: "p1", process_number: "1002345-67.2026.8.26.0554" };

  it("andamento novo vira notificação, mas a primeira carga não", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(SAMPLE))));
    const later = fakeSupabase({ inserted: 2, first_sync: false });
    const out = await syncProcess(later.client, target);
    expect(out).toMatchObject({ ok: true, inserted: 2 });
    expect(later.calls.inserts).toHaveLength(1);
    expect(later.calls.inserts[0]).toMatchObject({ table: "notifications", row: { type: "andamento_novo", entity_id: "p1" } });

    const first = fakeSupabase({ inserted: 3, first_sync: true });
    const firstOut = await syncProcess(first.client, target);
    expect(firstOut.message).toMatch(/importados/);
    expect(first.calls.inserts).toHaveLength(0);
  });

  it("processo não encontrado e falha do tribunal ficam registrados sem gravar andamento", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hits: { hits: [] } }))));
    const nf = fakeSupabase({ inserted: 0, first_sync: true });
    const out = await syncProcess(nf.client, target);
    expect(out.message).toBe(NOT_FOUND_MESSAGE);
    expect(nf.calls.rpc[0]).toMatchObject({ p_rows: [], p_error: NOT_FOUND_MESSAGE });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const down = fakeSupabase({ inserted: 0, first_sync: false });
    const fail = await syncProcess(down.client, target);
    expect(fail.ok).toBe(false);
    expect(down.calls.rpc[0]).toMatchObject({ p_rows: null });
  });

  it("rotina diária pula números incompletos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(SAMPLE))));
    const { client } = fakeSupabase({ inserted: 1, first_sync: false }, [
      target,
      { id: "p2", process_number: "123" },
    ]);
    const totals = await syncDueProcesses(client);
    expect(totals).toEqual({ checked: 1, inserted: 1, failed: 0, skipped: 1 });
  });
});
