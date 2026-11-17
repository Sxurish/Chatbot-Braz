import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeDjenItem } from "@/lib/djen/parse";
import { DJEN_GEOBLOCK_MESSAGE } from "@/lib/djen/client";
import { computeDeadline } from "@/lib/prazos/compute";

// ---------------------------------------------------------------------------
// Banco falso (só o que a captura e o recordRun usam).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const unique: Record<string, string> = { court_publications: "external_key", publication_sync_state: "source" };

  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let limit = Infinity;
    let mode: "many" | "single" | "maybe" = "many";

    const run = () => {
      const rows = tables[table] ?? (tables[table] = []);
      if (op === "insert" || op === "upsert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const key = upsertOpts.onConflict ?? unique[table];
        const added: Row[] = [];
        for (const r of list) {
          const old = key ? rows.find((x) => x[key] === r[key]) : undefined;
          if (old) {
            if (op === "insert") return { data: null, error: { code: "23505", message: "duplicate key" } };
            if (!upsertOpts.ignoreDuplicates) Object.assign(old, r);
            continue;
          }
          const row = { id: `id-${++seq}`, status: "para_conferir", ...r };
          rows.push(row);
          added.push(row);
        }
        return { data: mode === "many" ? added : added[0] ?? null, error: null };
      }
      const match = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        match.forEach((r) => Object.assign(r, payload));
        return { data: match, error: null };
      }
      if (op === "delete") {
        tables[table] = rows.filter((r) => !match.includes(r));
        return { data: null, error: null };
      }
      const out = match.slice(0, limit).map((r) => ({ ...r }));
      return { data: mode === "many" ? out : out[0] ?? null, error: null };
    };

    const q = {
      select: () => q,
      insert(p: Row | Row[]) {
        op = "insert";
        payload = p;
        return q;
      },
      upsert(p: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        op = "upsert";
        payload = p;
        upsertOpts = o;
        return q;
      },
      update(p: Row) {
        op = "update";
        payload = p;
        return q;
      },
      delete() {
        op = "delete";
        return q;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return q;
      },
      is(col: string, v: unknown) {
        filters.push((r) => (r[col] ?? null) === v);
        return q;
      },
      not(col: string, _op: string, v: unknown) {
        filters.push((r) => (r[col] ?? null) !== v);
        return q;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[col]));
        return q;
      },
      lt(col: string, v: string) {
        filters.push((r) => String(r[col]) < v);
        return q;
      },
      order: () => q,
      limit(n: number) {
        limit = n;
        return q;
      },
      single() {
        mode = "single";
        return q;
      },
      maybeSingle() {
        mode = "maybe";
        return q;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return q;
  }
  return { from, tables };
}

// ---------------------------------------------------------------------------
// Módulos trocados nos testes
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  db: null as unknown,
  readPending: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => h.db, createClient: () => h.db }));
vi.mock("@/lib/intimacoes/ai-read", () => ({ readPendingPublications: h.readPending }));
vi.mock("@/lib/intimacoes/notify", () => ({ notifyNewPublications: h.notify }));

import { GET } from "@/app/api/cron/intimacoes/route";
import {
  buildProcessIndex,
  captureDjenPublications,
  findProcessId,
  matchOffice,
  publicationDateFor,
} from "@/lib/intimacoes/capture";

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

/** Item real do DJEN (17/11/2026): a OAB do Dr. Jean só aparece no texto. */
const REAL_ITEM = {
  id: 787900059,
  data_disponibilizacao: "2026-11-16",
  siglaTribunal: "TJSP",
  tipoComunicacao: "Intimação",
  nomeOrgao: "Foro de Embu-Guaçu - Vara Única",
  texto:
    "Processo 0000468-20.2020.8.26.0177 (processo principal 1001103-18.2019.8.26.0177) - Cumprimento de Sentença de Obrigação de Prestar Alimentos - Dissolução - A.M.R.P.S. - J.C.B.J. - Processo Desarquivado com Reabertura - ADV: RONALDO GONÇALVES SILVA (OAB 239932/SP), JEAN CARLOS BRAZ DE JESUS (OAB 459159/SP)",
  numero_processo: "00004682020208260177",
  link: "https://www.dje.tjsp.jus.br",
  tipoDocumento: "Intimação",
  nomeClasse: "CUMPRIMENTO DE SENTENÇA DE OBRIGAÇÃO DE PRESTAR ALIMENTOS",
  ativo: true,
  hash: "Mg9oWrB69XsXmMaUjTpDEX7RzwDv82",
  motivo_cancelamento: null,
  data_cancelamento: null,
  numeroprocessocommascara: "0000468-20.2020.8.26.0177",
  destinatarios: [
    { nome: "A.M.R.P.S.", polo: "A" },
    { nome: "J.C.B.J.", polo: "P" },
  ],
  destinatarioadvogados: [{ advogado: { nome: "RONALDO GONÇALVES SILVA", numero_oab: "239932", uf_oab: "SP" } }],
};

/** Disponibilizada numa quinta antes do feriado de 20/11. */
const STRUCTURED_ITEM = {
  id: 900000001,
  data_disponibilizacao: "2026-11-19",
  siglaTribunal: "TJSP",
  tipoComunicacao: "Intimação",
  texto: "Fica a parte autora intimada para réplica no prazo legal.",
  ativo: true,
  destinatarioadvogados: [{ advogado: { nome: "JEAN CARLOS BRAZ DE JESUS", numero_oab: "459159", uf_oab: "SP" } }],
};

const OTHER_LAWYER_ITEM = {
  id: 900000002,
  data_disponibilizacao: "2026-11-16",
  siglaTribunal: "TJSP",
  texto: "Intimação - ADV: FULANO DE TAL (OAB 111111/SP)",
  ativo: true,
  destinatarioadvogados: [{ advogado: { nome: "FULANO DE TAL", numero_oab: "111111", uf_oab: "SP" } }],
};

function envelope(items: unknown[], count = items.length) {
  return { status: "success", message: "Sucesso", count, items };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function manyItems(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({ ...STRUCTURED_ITEM, id: 950000000 + offset + i }));
}

const PROCESS_ID = "proc-principal";

function newTables(): Record<string, Row[]> {
  return {
    publication_sync_state: [],
    court_publications: [],
    forensic_calendar_days: [],
    automation_runs: [],
    // O processo principal citado no texto do REAL_ITEM.
    processes: [
      { id: PROCESS_ID, process_number: "1001103-18.2019.8.26.0177" },
      { id: "sem-numero", process_number: null },
    ],
  };
}

function req(secret = "segredo-de-teste") {
  return new Request("http://localhost/api/cron/intimacoes", { headers: { authorization: `Bearer ${secret}` } });
}

// ---------------------------------------------------------------------------
// Funções puras
// ---------------------------------------------------------------------------

describe("matchOffice", () => {
  it("acha a OAB nos advogados citados no texto (item real)", () => {
    const n = normalizeDjenItem(REAL_ITEM);
    expect(n.ok).toBe(true);
    if (n.ok) expect(matchOffice(n.item)).toBe("advogados");
  });

  it("acha 'OAB nº 459.159' no texto, mas não com outro estado", () => {
    expect(matchOffice({ lawyers: [], text: "Intimado o advogado inscrito na OAB nº 459.159/SP." })).toBe("texto");
    expect(matchOffice({ lawyers: [], text: "Advogado OAB 459159 - SP." })).toBe("texto");
    expect(matchOffice({ lawyers: [], text: "Advogado OAB 459159/RJ." })).toBeNull();
    expect(matchOffice({ lawyers: [], text: "Valor de R$ 459.159,00." })).toBeNull();
    expect(matchOffice({ lawyers: [{ name: "X", oab: "459159", uf: "RJ" }], text: "" })).toBeNull();
  });
});

describe("publicationDateFor", () => {
  it("usa a mesma regra da parte A (1º dia útil seguinte)", () => {
    expect(publicationDateFor("2026-11-16", [])).toBe("2026-11-17");
    // Quinta 19/11 → sexta 20/11 é feriado, fim de semana → segunda 23/11.
    expect(publicationDateFor("2026-11-19", [])).toBe("2026-11-23");
    expect(publicationDateFor("2026-11-19", [])).toBe(
      computeDeadline({ start: { kind: "disponibilizacao", date: "2026-11-19" }, days: 15, unit: "uteis" }, []).publicationDate,
    );
    // Recesso: publicação em 21/01.
    expect(publicationDateFor("2026-12-22", [])).toBe("2027-01-21");
  });

  it("considera os dias cadastrados no calendário", () => {
    const day = {
      id: "d1",
      court: "TJSP",
      day: "2026-11-17",
      kind: "suspensao" as const,
      comarca: null,
      description: "Suspensão",
      source: "Comunicado",
      source_url: null,
      created_by: null,
      created_at: "2026-11-01T00:00:00Z",
      removed_at: null,
      removed_by: null,
      removed_reason: null,
    };
    expect(publicationDateFor("2026-11-16", [day])).toBe("2026-11-18");
  });
});

describe("findProcessId", () => {
  const index = buildProcessIndex([
    { id: "a", process_number: "1001103-18.2019.8.26.0177" },
    { id: "b", process_number: "00004682020208260177" },
    { id: "c", process_number: "0000468-20.2020.8.26.0177" },
    { id: "d", process_number: null },
  ]);

  it("compara só os dígitos e tenta os números relacionados", () => {
    expect(findProcessId({ processNumber: "10011031820198260177", relatedProcessNumbers: [] }, index)).toEqual({
      processId: "a",
      ambiguous: false,
    });
    expect(
      findProcessId({ processNumber: "99999999999999999999", relatedProcessNumbers: ["10011031820198260177"] }, index),
    ).toEqual({ processId: "a", ambiguous: false });
  });

  it("número com mais de um processo não liga sozinho", () => {
    expect(findProcessId({ processNumber: "00004682020208260177", relatedProcessNumbers: [] }, index)).toEqual({
      processId: null,
      ambiguous: true,
    });
    // Ambíguo no principal, mas o relacionado resolve.
    expect(
      findProcessId({ processNumber: "00004682020208260177", relatedProcessNumbers: ["10011031820198260177"] }, index),
    ).toEqual({ processId: "a", ambiguous: false });
  });
});

// ---------------------------------------------------------------------------
// Rota e captura (DJEN simulado)
// ---------------------------------------------------------------------------

describe("rota /api/cron/intimacoes", () => {
  let tables: Record<string, Row[]>;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T13:00:00Z")); // 10h em Brasília
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-de-teste");
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    tables = newTables();
    h.db = fakeDb(tables);
    h.readPending.mockReset().mockResolvedValue({ read: 2, failed: 0, skipped: 0, disabled: false, costUsd: 0.0123 });
    h.notify.mockReset().mockResolvedValue({ sent: 1, skipped: 0, errors: 0 });
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("recusa sem o CRON_SECRET", async () => {
    const res = await GET(req("errado"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("primeira execução: busca 30 dias, grava só as da OAB, liga ao processo e avança a data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(envelope([REAL_ITEM, STRUCTURED_ITEM, OTHER_LAWYER_ITEM])));
    const res = await GET(req());
    const body = await res.json();

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("numeroOab")).toBe("459159");
    expect(url.searchParams.get("ufOab")).toBe("SP");
    expect(url.searchParams.get("dataDisponibilizacaoInicio")).toBe("2026-10-18");
    expect(url.searchParams.get("dataDisponibilizacaoFim")).toBe("2026-11-17");

    expect(body).toMatchObject({ ok: true, novas: 2, outra_oab: 1, repetidas: 0, vinculadas: 1, data_avancou: "sim" });
    const pubs = tables.court_publications;
    expect(pubs).toHaveLength(2);
    const real = pubs.find((p) => p.external_key === "id:787900059")!;
    expect(real).toMatchObject({
      available_date: "2026-11-16",
      publication_date: "2026-11-17",
      process_number: "00004682020208260177",
      process_id: PROCESS_ID,
      cancelled: false,
    });
    const other = pubs.find((p) => p.external_key === "id:900000001")!;
    expect(other).toMatchObject({ publication_date: "2026-11-23", process_id: null });

    expect(tables.publication_sync_state[0]).toMatchObject({ source: "djen", last_success_date: "2026-11-17", last_error: null });
    const run = tables.automation_runs[0];
    expect(run).toMatchObject({ job: "intimacoes", ok: true, error: null });
    expect(run.summary).toMatchObject({ novas: 2, ia_lidas: 2, whatsapp_enviados: 1, janela: "2026-10-18 a 2026-11-17" });
    expect(h.readPending).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("segunda execução: não duplica e marca a cancelada que ainda está para conferir", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(envelope([REAL_ITEM, STRUCTURED_ITEM])));
    await GET(req());
    // Uma delas já foi conferida: não muda mais.
    tables.court_publications.find((p) => p.external_key === "id:900000001")!.status = "confirmada";

    vi.setSystemTime(new Date("2026-11-17T14:00:00Z"));
    const cancelled = { ...REAL_ITEM, ativo: false, motivo_cancelamento: "Publicada por engano" };
    const cancelledOther = { ...STRUCTURED_ITEM, ativo: false, motivo_cancelamento: "Erro" };
    fetchMock.mockResolvedValueOnce(jsonResponse(envelope([cancelled, cancelledOther])));
    const body = await (await GET(req())).json();

    const url = new URL(String(fetchMock.mock.calls[1][0]));
    expect(url.searchParams.get("dataDisponibilizacaoInicio")).toBe("2026-11-16");
    expect(body).toMatchObject({ ok: true, novas: 0, repetidas: 2, canceladas: 1 });
    expect(tables.court_publications).toHaveLength(2);
    expect(tables.court_publications.find((p) => p.external_key === "id:787900059")).toMatchObject({
      cancelled: true,
      cancel_reason: "Publicada por engano",
    });
    expect(tables.court_publications.find((p) => p.external_key === "id:900000001")).toMatchObject({ cancelled: false });
  });

  it("liga depois a intimação cujo processo foi cadastrado após a captura", async () => {
    tables.processes = [];
    fetchMock.mockResolvedValueOnce(jsonResponse(envelope([REAL_ITEM])));
    await GET(req());
    expect(tables.court_publications[0].process_id).toBeNull();

    tables.processes.push({ id: "novo", process_number: "0000468-20.2020.8.26.0177" });
    fetchMock.mockResolvedValueOnce(jsonResponse(envelope([REAL_ITEM])));
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ novas: 0, vinculadas: 1 });
    expect(tables.court_publications[0].process_id).toBe("novo");
  });

  it("DJEN fora do ar: não avança a data e a execução conta como falha", async () => {
    tables.publication_sync_state.push({ source: "djen", last_success_date: "2026-11-15", last_error: null });
    fetchMock.mockResolvedValue(new Response("erro", { status: 503 }));
    const res = await GET(req());
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.error).toContain("instável");
    expect(tables.publication_sync_state[0]).toMatchObject({ last_success_date: "2026-11-15" });
    expect(String(tables.publication_sync_state[0].last_error)).toContain("instável");
    const run = tables.automation_runs[0];
    expect(run.ok).toBe(false);
    expect(String(run.error)).toContain("instável");
    expect(run.summary).toMatchObject({ data_avancou: "não", ia_lidas: 2 });
    // A IA e o aviso rodam mesmo assim (pendentes de antes).
    expect(h.readPending).toHaveBeenCalledTimes(1);
  });

  it("geobloqueio (403 do CloudFront): registra o motivo e não avança", async () => {
    fetchMock.mockResolvedValue(new Response("The Amazon CloudFront distribution is configured to block access from your country.", { status: 403 }));
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ ok: false, error: DJEN_GEOBLOCK_MESSAGE, geobloqueio: "sim" });
    expect(tables.publication_sync_state[0].last_success_date).toBeUndefined();
    expect(tables.publication_sync_state[0].last_error).toBe(DJEN_GEOBLOCK_MESSAGE);
    expect(tables.automation_runs[0]).toMatchObject({ ok: false, error: DJEN_GEOBLOCK_MESSAGE });
  });

  it("falha da IA e do WhatsApp não derruba a captura", async () => {
    h.readPending.mockRejectedValue(new Error("IA fora do ar"));
    h.notify.mockRejectedValue(new Error("WhatsApp fora do ar"));
    fetchMock.mockResolvedValueOnce(jsonResponse(envelope([REAL_ITEM])));
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, novas: 1, ia_erro: "IA fora do ar", whatsapp_erro: "WhatsApp fora do ar" });
    expect(tables.automation_runs[0]).toMatchObject({ ok: true });
    expect(tables.publication_sync_state[0].last_success_date).toBe("2026-11-17");
  });

  it("sem as tabelas da fase: erro claro", async () => {
    const db = fakeDb(tables);
    h.db = {
      from: (t: string) =>
        t === "publication_sync_state"
          ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }) }) }) }
          : db.from(t),
    };
    const body = await (await GET(req())).json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("fase5-intimacoes.sql");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("busca truncada no limite de páginas: grava o que leu, avisa e não avança", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(envelope(manyItems(100), 250)));
    const out = await captureDjenPublications(fakeDb(tables) as never, { maxPages: 1, delayMs: 0 });
    expect(out).toMatchObject({ ok: true, truncated: true, advanced: false, inserted: 100 });
    expect(out.warnings.join(" ")).toContain("limite");
    expect(tables.publication_sync_state[0].last_success_date).toBeUndefined();
    expect(String(tables.publication_sync_state[0].last_error)).toContain("limite");
  });

  it("falha no meio da busca: grava as páginas lidas e não avança", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(envelope(manyItems(100), 150)))
      .mockResolvedValueOnce(new Response("erro", { status: 500 }));
    const out = await captureDjenPublications(fakeDb(tables) as never, { delayMs: 0 });
    expect(out).toMatchObject({ ok: false, inserted: 100, advanced: false });
    expect(tables.court_publications).toHaveLength(100);
    expect(tables.publication_sync_state[0].last_success_date).toBeUndefined();
  });
});
