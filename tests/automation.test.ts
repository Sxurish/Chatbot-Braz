import { describe, expect, it, vi } from "vitest";
import { recordRun } from "@/lib/automation/runs";
import { maybeAlertOnFailure, shouldAlert } from "@/lib/automation/alert";
import {
  checkEnv,
  checkTables,
  ENV_SPECS,
  testAnthropic,
  testDatajud,
  testSupabase,
  testWhatsapp,
} from "@/lib/automation/diagnostics";
import { formatBrasilia, formatDuration, summaryText } from "@/lib/automation/format";

// ---------------------------------------------------------------------------
// Cliente falso do Supabase (só o que as automações usam).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>, opts: { missing?: string[]; failInsert?: boolean } = {}) {
  let seq = 0;
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let order: { col: string; asc: boolean } | null = null;
    let limit = Infinity;
    let single = false;
    let head = false;

    const run = () => {
      if (opts.missing?.includes(table)) {
        return { data: null, count: null, error: { code: "PGRST205", message: `Could not find the table 'public.${table}'` } };
      }
      const rows = tables[table] ?? (tables[table] = []);
      if (op === "insert") {
        if (opts.failInsert) return { data: null, error: { message: "boom" } };
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const added = list.map((r) => ({ id: `id-${++seq}`, ok: null, ...r }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const match = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        match.forEach((r) => Object.assign(r, payload));
        return { data: null, error: null };
      }
      if (op === "delete") {
        tables[table] = rows.filter((r) => !match.includes(r));
        return { data: null, error: null };
      }
      let out = [...match];
      if (order) {
        const { col, asc } = order;
        out.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1));
      }
      out = out.slice(0, limit);
      return { data: head ? null : single ? out[0] ?? null : out, count: match.length, error: null };
    };

    const q = {
      select(_cols?: string, o?: { head?: boolean }) {
        if (o?.head) head = true;
        return q;
      },
      insert(p: Row | Row[]) {
        op = "insert";
        payload = p;
        calls.push({ table, op, payload: p });
        return q;
      },
      update(p: Row) {
        op = "update";
        payload = p;
        calls.push({ table, op, payload: p });
        return q;
      },
      delete() {
        op = "delete";
        calls.push({ table, op });
        return q;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return q;
      },
      lt(col: string, v: string) {
        filters.push((r) => String(r[col]) < v);
        return q;
      },
      not(col: string) {
        filters.push((r) => r[col] !== null && r[col] !== undefined);
        return q;
      },
      order(col: string, o: { ascending: boolean }) {
        order = { col, asc: o.ascending };
        return q;
      },
      limit(n: number) {
        limit = n;
        return q;
      },
      single() {
        single = true;
        return q;
      },
      then<A, B>(res: (v: ReturnType<typeof run>) => A, rej?: (e: unknown) => B) {
        return Promise.resolve(run()).then(res, rej);
      },
    };
    return q;
  }
  return { client: { from } as never, tables, calls };
}

function clock(start = Date.parse("2026-11-17T09:00:00Z")) {
  let t = start;
  return () => new Date((t += 1000));
}

// ---------------------------------------------------------------------------
// recordRun
// ---------------------------------------------------------------------------

describe("recordRun", () => {
  it("grava início e fim com resumo quando dá certo", async () => {
    const db = fakeSupabase({});
    const alert = vi.fn();
    const out = await recordRun("andamentos", async () => ({ checked: 3, inserted: 1 }), {
      client: db.client,
      summarize: (r) => ({ ...r }),
      alert,
      now: clock(),
    });
    expect(out).toEqual({ checked: 3, inserted: 1 });
    const runs = db.tables.automation_runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ job: "andamentos", ok: true, error: null, trigger: "cron" });
    expect(runs[0].summary).toMatchObject({ checked: 3, inserted: 1, ms: 1000 });
    expect(runs[0].finished_at).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
  });

  it("grava o erro, avisa e lança o mesmo erro de antes", async () => {
    const db = fakeSupabase({});
    const alert = vi.fn().mockResolvedValue({ alerted: false, notificacoes: 0, whatsapp_enviados: 0, whatsapp_erros: [] });
    const boom = new Error("Falha ao listar processos: x");
    await expect(recordRun("andamentos", async () => Promise.reject(boom), { client: db.client, alert })).rejects.toBe(boom);
    expect(db.tables.automation_runs[0]).toMatchObject({ ok: false, error: "Falha ao listar processos: x" });
    expect(alert).toHaveBeenCalledWith(db.client, { job: "andamentos", error: "Falha ao listar processos: x" });
  });

  it("usa outcome para marcar falha sem lançar", async () => {
    const db = fakeSupabase({});
    const alert = vi.fn().mockResolvedValue({ alerted: false, notificacoes: 0, whatsapp_enviados: 0, whatsapp_erros: [] });
    const out = await recordRun("resumo", async () => "x", {
      client: db.client,
      outcome: () => ({ ok: false, error: "Token expirou" }),
      alert,
    });
    expect(out).toBe("x");
    expect(db.tables.automation_runs[0]).toMatchObject({ ok: false, error: "Token expirou" });
  });

  it("sem a tabela, a rotina segue normal", async () => {
    const db = fakeSupabase({}, { missing: ["automation_runs"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await recordRun("andamentos", async () => 42, { client: db.client });
    expect(out).toBe(42);
    const err = new Error("rotina falhou");
    await expect(recordRun("andamentos", async () => Promise.reject(err), { client: db.client })).rejects.toBe(err);
    warn.mockRestore();
  });

  it("se o cliente lança erro, a rotina segue normal", async () => {
    const client = {
      from() {
        throw new Error("sem rede");
      },
    } as never;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordRun("resumo", async () => "ok", { client })).resolves.toBe("ok");
    warn.mockRestore();
  });

  it("sem cliente, só roda a rotina", async () => {
    await expect(recordRun("resumo", async () => 1)).resolves.toBe(1);
  });

  it("apaga execuções com mais de 90 dias", async () => {
    const db = fakeSupabase({
      automation_runs: [
        { id: "velha", job: "resumo", started_at: "2026-01-01T00:00:00.000Z", ok: true },
        { id: "nova", job: "resumo", started_at: "2026-11-01T00:00:00.000Z", ok: true },
      ],
    });
    await recordRun("resumo", async () => 1, { client: db.client, now: clock() });
    const ids = db.tables.automation_runs.map((r) => r.id);
    expect(ids).not.toContain("velha");
    expect(ids).toContain("nova");
  });
});

// ---------------------------------------------------------------------------
// Alerta na 2ª falha seguida
// ---------------------------------------------------------------------------

describe("alerta de falhas seguidas", () => {
  it("shouldAlert: só na 2ª falha seguida", () => {
    expect(shouldAlert([false])).toBe(false);
    expect(shouldAlert([false, false])).toBe(true);
    expect(shouldAlert([false, false, true])).toBe(true);
    expect(shouldAlert([false, false, false])).toBe(false); // 3ª: fica quieto
    expect(shouldAlert([false, true, false])).toBe(false);
    expect(shouldAlert([true, false, false])).toBe(false);
    expect(shouldAlert([])).toBe(false);
  });

  const admins = [
    { id: "a1", name: "Jean", role: "admin", active: true, whatsapp_number: "5511999990001" },
    { id: "a2", name: "Ana", role: "admin", active: true, whatsapp_number: null },
    { id: "a3", name: "Ex", role: "admin", active: false, whatsapp_number: "5511999990003" },
    { id: "u1", name: "Bia", role: "advogado", active: true, whatsapp_number: "5511999990004" },
  ];
  const env = { WHATSAPP_ACCESS_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_ALERT_TEMPLATE: "alerta_automacao" };

  function runs(...oks: boolean[]) {
    // oks[0] é a mais nova.
    return oks.map((ok, i) => ({ id: `r${i}`, job: "andamentos", ok, started_at: `2026-11-${String(20 - i).padStart(2, "0")}T09:00:00Z` }));
  }

  it("na 2ª falha: notifica cada Admin ativo e manda WhatsApp a quem tem número", async () => {
    const db = fakeSupabase({ automation_runs: runs(false, false, true), users: admins.map((a) => ({ ...a })) });
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: "m1" });
    const out = await maybeAlertOnFailure(db.client, { job: "andamentos", error: "DataJud fora do ar" }, { env, send });
    expect(out).toMatchObject({ alerted: true, notificacoes: 2, whatsapp_enviados: 1 });
    const notifs = db.tables.notifications;
    expect(notifs.map((n) => n.user_id).sort()).toEqual(["a1", "a2"]);
    expect(notifs[0]).toMatchObject({ type: "automacao_falhou", entity_type: "automation" });
    expect(String(notifs[0].title)).toContain("Andamentos dos tribunais");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: "5511999990001" });
    expect(send.mock.calls[0][0].params.map((p: [string, number]) => p[0])).toEqual([
      "Andamentos dos tribunais",
      "2",
      "DataJud fora do ar",
    ]);
  });

  it("na 1ª e na 3ª falha não avisa", async () => {
    for (const list of [runs(false, true), runs(false, false, false)]) {
      const db = fakeSupabase({ automation_runs: list, users: admins.map((a) => ({ ...a })) });
      const send = vi.fn();
      const out = await maybeAlertOnFailure(db.client, { job: "andamentos", error: "x" }, { env, send });
      expect(out.alerted).toBe(false);
      expect(db.tables.notifications ?? []).toHaveLength(0);
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("sem modelo configurado: só a notificação", async () => {
    const db = fakeSupabase({ automation_runs: runs(false, false), users: admins.map((a) => ({ ...a })) });
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const out = await maybeAlertOnFailure(
      db.client,
      { job: "andamentos", error: "x" },
      { env: { WHATSAPP_ACCESS_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "123" } }
    );
    vi.unstubAllGlobals();
    expect(out).toMatchObject({ alerted: true, notificacoes: 2, whatsapp_enviados: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("execuções interrompidas (ok vazio) não contam", async () => {
    const db = fakeSupabase({
      automation_runs: [
        { id: "x", job: "resumo", ok: null, started_at: "2026-11-21T09:00:00Z" },
        { id: "y", job: "resumo", ok: false, started_at: "2026-11-20T09:00:00Z" },
        { id: "z", job: "resumo", ok: false, started_at: "2026-11-19T09:00:00Z" },
      ],
      users: admins.map((a) => ({ ...a })),
    });
    const out = await maybeAlertOnFailure(db.client, { job: "resumo", error: "x" }, { env: {}, send: vi.fn() });
    expect(out.alerted).toBe(true);
  });

  it("recordRun + alerta: avisa na 2ª falha e de novo depois de voltar a funcionar", async () => {
    const db = fakeSupabase({ users: admins.map((a) => ({ ...a })) });
    const now = clock();
    const fail = () => Promise.reject(new Error("caiu"));
    const ok = async () => 1;
    const sequence = [fail, fail, fail, ok, fail, fail];
    for (const fn of sequence) {
      await recordRun("andamentos", fn, { client: db.client, now }).catch(() => {});
    }
    expect(db.tables.notifications).toHaveLength(4); // 2 alertas × 2 Admins ativos
    const alerted = db.tables.automation_runs.filter((r) => (r.summary as Row | null)?.alerta);
    expect(alerted).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Diagnóstico
// ---------------------------------------------------------------------------

describe("diagnóstico", () => {
  const SECRETS: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: "https://segredo-url-xyz.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-SEGREDO-123456",
    SUPABASE_SERVICE_ROLE_KEY: "service-SEGREDO-abcdef",
    NEXT_PUBLIC_APP_URL: "https://app-segredo.example",
    CRON_SECRET: "cron-SEGREDO-999",
    ANTHROPIC_API_KEY: "sk-ant-SEGREDO-777",
    WHATSAPP_ACCESS_TOKEN: "EAAG-SEGREDO-555",
    WHATSAPP_PHONE_NUMBER_ID: "998877665544",
    WHATSAPP_VERIFY_TOKEN: "verify-SEGREDO-1",
    WHATSAPP_APP_SECRET: "appsecret-SEGREDO-2",
    WHATSAPP_DIGEST_TEMPLATE: "modelo-segredo-resumo",
    WHATSAPP_ALERT_TEMPLATE: "modelo-segredo-alerta",
    WHATSAPP_INTIMACAO_TEMPLATE: "modelo-segredo-intimacao",
  };

  it("nunca devolve o valor (nem pedaço) de um segredo", () => {
    const out = checkEnv({ ...SECRETS, AI_PROVIDER: "anthropic" });
    const text = JSON.stringify(out);
    for (const v of Object.values(SECRETS)) expect(text).not.toContain(v);
    // Nem pedaços: todos os valores falsos têm "segredo" ou o número 998877.
    expect(text.toLowerCase()).not.toContain("segredo");
    expect(text).not.toContain("9988");
    expect(out.every((v) => v.status === "configurada")).toBe(true);
    expect(out.find((v) => v.name === "AI_PROVIDER")?.value).toBe("anthropic");
    expect(out.filter((v) => v.value !== null).map((v) => v.name)).toEqual(["AI_PROVIDER"]);
  });

  it("lista todas as variáveis pedidas, com o efeito de faltar", () => {
    const out = checkEnv({});
    expect(out.map((v) => v.name)).toEqual(ENV_SPECS.map((s) => s.name));
    expect(out.find((v) => v.name === "CRON_SECRET")).toMatchObject({ status: "faltando" });
    expect(out.find((v) => v.name === "WHATSAPP_DIGEST_TEMPLATE")).toMatchObject({ status: "padrao" });
    expect(out.every((v) => v.effect && v.purpose)).toBe(true);
    expect(out.every((v) => v.value === null)).toBe(true);
  });

  function res(status: number, body: unknown = {}) {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }

  it("IA: monta a chamada certa e traduz as respostas", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { data: [] }));
    const ok = await testAnthropic({ env: { ANTHROPIC_API_KEY: "sk-ant-SEGREDO-777" }, fetchImpl });
    expect(ok.status).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect(init.headers).toMatchObject({ "x-api-key": "sk-ant-SEGREDO-777", "anthropic-version": "2023-06-01" });
    expect(init.signal).toBeDefined();

    const bad = await testAnthropic({ env: { ANTHROPIC_API_KEY: "sk-ant-SEGREDO-777" }, fetchImpl: vi.fn().mockResolvedValue(res(401)) });
    expect(bad.status).toBe("erro");
    expect(bad.message).toContain("recusou a chave");
    expect(JSON.stringify(bad)).not.toContain("SEGREDO");

    const timeout = await testAnthropic({
      env: { ANTHROPIC_API_KEY: "k" },
      fetchImpl: vi.fn().mockRejectedValue(Object.assign(new Error("t"), { name: "TimeoutError" })),
    });
    expect(timeout.message).toContain("não respondeu em 8 s");

    expect((await testAnthropic({ env: {} })).status).toBe("pulado");
  });

  it("WhatsApp: GET no número com o token e erros amigáveis", async () => {
    const env = { WHATSAPP_ACCESS_TOKEN: "EAAG-SEGREDO-555", WHATSAPP_PHONE_NUMBER_ID: "998877665544" };
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { display_phone_number: "+55 11 3333-4444", verified_name: "Braz" }));
    const ok = await testWhatsapp({ env, fetchImpl });
    expect(ok).toMatchObject({ status: "ok" });
    expect(ok.message).toContain("+55 11 3333-4444");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/998877665544");
    expect(init.headers).toMatchObject({ Authorization: "Bearer EAAG-SEGREDO-555" });

    const expired = await testWhatsapp({ env, fetchImpl: vi.fn().mockResolvedValue(res(401, { error: { code: 190 } })) });
    expect(expired.message).toContain("expirou");
    const wrongId = await testWhatsapp({ env, fetchImpl: vi.fn().mockResolvedValue(res(400, { error: { code: 100 } })) });
    expect(wrongId.message).toContain("WHATSAPP_PHONE_NUMBER_ID");
    for (const r of [expired, wrongId]) expect(JSON.stringify(r)).not.toContain("SEGREDO");

    expect((await testWhatsapp({ env: {} })).status).toBe("pulado");
  });

  it("DataJud: 429/timeout = instável; chave recusada = erro", async () => {
    const ok = await testDatajud({
      fetchMovements: async () => ({ ok: true, found: false, tribunal: "TJSP", rows: [], info: null as never }),
    });
    expect(ok.status).toBe("ok");
    const limit = await testDatajud({
      fetchMovements: async () => ({ ok: false, error: "Limite de consultas do DataJud atingido. Tente mais tarde.", retry: true }),
    });
    expect(limit).toMatchObject({ status: "aviso", message: "DataJud instável, tente mais tarde." });
    const key = await testDatajud({
      fetchMovements: async () => ({ ok: false, error: "O DataJud recusou a chave de acesso. Confira DATAJUD_API_KEY.", retry: false }),
    });
    expect(key.status).toBe("erro");
    vi.useFakeTimers();
    const pending = testDatajud({ fetchMovements: () => new Promise(() => {}) });
    await vi.advanceTimersByTimeAsync(8_001);
    expect(await pending).toMatchObject({ status: "aviso", message: "DataJud instável, tente mais tarde." });
    vi.useRealTimers();
  });

  it("DataJud: com fetch mockado, usa o cliente de verdade", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(429));
    vi.stubGlobal("fetch", fetchImpl);
    const out = await testDatajud();
    vi.unstubAllGlobals();
    expect(out.message).toBe("DataJud instável, tente mais tarde.");
    expect(String(fetchImpl.mock.calls[0][0])).toContain("api_publica_tjsp/_search");
  });

  it("Supabase e tabelas: conta pessoas e diz qual SQL rodar", async () => {
    const db = fakeSupabase(
      { users: [{ id: "1" }, { id: "2" }], assistant_drafts: [], process_movements: [], daily_digests: [] },
      { missing: ["deadline_calculations", "automation_runs"] }
    );
    const sb = await testSupabase(db.client);
    expect(sb).toMatchObject({ status: "ok" });
    expect(sb.message).toContain("2 pessoa");
    expect((await testSupabase(null)).status).toBe("erro");

    const t = await checkTables(db.client);
    expect(t.status).toBe("erro");
    expect(t.details?.join("\n")).toContain("supabase/fase5-prazos.sql");
    expect(t.details?.join("\n")).toContain("supabase/fase5-automacoes.sql");
    expect(t.details?.join("\n")).not.toContain("assistente-fase2.sql");
  });
});

describe("formatação", () => {
  it("horário de Brasília e duração", () => {
    expect(formatBrasilia("2026-11-17T09:00:00Z")).toBe("17/11/2026, 06:00");
    expect(formatDuration(450)).toBe("450 ms");
    expect(formatDuration(2500)).toBe("2,5 s");
    expect(formatDuration(125_000)).toBe("2 min 5 s");
  });

  it("resumo de cada rotina", () => {
    expect(summaryText("andamentos", { checked: 5, inserted: 1, failed: 0, skipped: 0 })).toBe(
      "5 processos consultados, 1 andamento novo"
    );
    expect(summaryText("resumo", { skipped: "Fim de semana: o resumo só sai em dias úteis." })).toContain("Fim de semana");
  });
});
