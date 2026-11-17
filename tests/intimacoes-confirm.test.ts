import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALREADY_REVIEWED, confirmPublication, defaultConfirmInput, discardPublication, linkPublicationProcess } from "@/lib/intimacoes/confirm";
import { CIENCIA_WARNING, comarcaOf, computePublicationDeadline, confirmFormDefaults, movementDescription } from "@/lib/intimacoes/rules";
import { mockPublications } from "@/lib/intimacoes/mock";
import { computeDeadline } from "@/lib/prazos/compute";
import type { CalendarDay } from "@/lib/prazos/types";
import type { ConfirmPublicationInput, CourtPublication, PublicationAiReading } from "@/lib/intimacoes/types";

// ---------------------------------------------------------------------------
// Cliente falso do Supabase em memória: guarda as tabelas, aplica eq/is e
// anota cada escrita, na ordem, para conferir a sequência da confirmação.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Op = { table: string; op: "insert" | "update" | "delete"; row: Row };
type Failure = (table: string, op: Op["op"], row: Row) => { code?: string; message: string } | null;

function fakeDb(tables: Record<string, Row[]>, fail: Failure = () => null) {
  const ops: Op[] = [];

  function from(table: string) {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    let returning = false;

    const matching = () => rows.filter((r) => filters.every((f) => f(r)));

    function run(): { data: unknown; error: unknown } {
      if (mode === "select") return { data: matching(), error: null };
      if (mode === "insert") {
        const row = { id: randomUUID(), ...payload };
        const err = fail(table, "insert", row);
        if (err) return { data: null, error: err };
        rows.push(row);
        ops.push({ table, op: "insert", row });
        return { data: [row], error: null };
      }
      const hit = matching();
      for (const r of hit) {
        const err = fail(table, mode, { ...r, ...payload });
        if (err) return { data: null, error: err };
      }
      if (mode === "update") {
        for (const r of hit) {
          Object.assign(r, payload);
          ops.push({ table, op: "update", row: { ...r } });
        }
      } else {
        for (const r of hit) {
          rows.splice(rows.indexOf(r), 1);
          ops.push({ table, op: "delete", row: r });
        }
      }
      return { data: returning ? hit : null, error: null };
    }

    const q = {
      select() {
        if (mode !== "select") returning = true;
        return q;
      },
      insert(p: Row) {
        mode = "insert";
        payload = p;
        return q;
      },
      update(p: Row) {
        mode = "update";
        payload = p;
        return q;
      },
      delete() {
        mode = "delete";
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
      order() {
        return q;
      },
      limit() {
        return q;
      },
      async single() {
        const out = run();
        if (out.error) return out;
        const list = out.data as Row[];
        return list?.length ? { data: list[0], error: null } : { data: null, error: { message: "not found" } };
      },
      async maybeSingle() {
        const out = run();
        if (out.error) return out;
        return { data: (out.data as Row[])?.[0] ?? null, error: null };
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return q;
  }

  return { db: { from } as unknown as SupabaseClient, ops, tables };
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

const USER = "11111111-1111-4111-8111-111111111111";
const PROC = "22222222-2222-4222-8222-222222222222";
const PROC_B = "33333333-3333-4333-8333-333333333333";
const PUB = "44444444-4444-4444-8444-444444444444";

const holiday: CalendarDay = {
  id: "55555555-5555-4555-8555-555555555555",
  court: "TJSP",
  day: "2026-11-20",
  kind: "feriado",
  comarca: null,
  description: "Dia da Consciência Negra",
  source: "Lei 14.759/2023",
  source_url: null,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  removed_at: null,
  removed_by: null,
  removed_reason: null,
};

function reading(r: Partial<PublicationAiReading> = {}): PublicationAiReading {
  return {
    actType: "Intimação para réplica",
    summary: "Prazo para réplica.",
    requiresAction: true,
    suggestedDays: 15,
    suggestedUnit: "uteis",
    startKind: "disponibilizacao",
    dobro: false,
    taskTitle: "Réplica à contestação",
    legalBasis: "CPC, art. 351",
    quote: null,
    uncertain: [],
    confidence: "alta",
    ...r,
  };
}

function publication(p: Partial<CourtPublication> = {}): CourtPublication {
  return {
    ...mockPublications[0],
    id: PUB,
    external_key: "id:987654",
    available_date: "2026-11-12",
    process_id: PROC,
    status: "para_conferir",
    ai_status: "pronta",
    ai_reading: reading(),
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    calculation_id: null,
    task_id: null,
    movement_id: null,
    ...p,
  };
}

function setup(pub: Partial<CourtPublication> = {}, fail?: Failure) {
  return fakeDb(
    {
      court_publications: [publication(pub) as unknown as Row],
      processes: [
        { id: PROC, jurisdiction: "Comarca de Santo André", next_deadline: null },
        { id: PROC_B, jurisdiction: "Comarca de São Bernardo do Campo", next_deadline: null },
      ],
      forensic_calendar_days: [holiday as unknown as Row],
      deadline_calculations: [],
      tasks: [],
      process_movements: [],
      audit_logs: [],
    },
    fail
  );
}

function input(i: Partial<ConfirmPublicationInput> = {}): ConfirmPublicationInput {
  return {
    publicationId: PUB,
    userId: USER,
    days: 15,
    unit: "uteis",
    startKind: "disponibilizacao",
    dobro: false,
    title: "Réplica à contestação",
    channel: "painel",
    ...i,
  };
}

const writes = (ops: Op[]) => ops.map((o) => `${o.op} ${o.table}${o.row.action ? `:${o.row.action}` : ""}`);

// ---------------------------------------------------------------------------

describe("confirmPublication", () => {
  it("grava na ordem: cálculo, tarefa, confirmação, andamento, processo, intimação, auditoria", async () => {
    const { db, ops, tables } = setup();
    const out = await confirmPublication(db, input());
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(writes(ops)).toEqual([
      "insert deadline_calculations:calculo",
      "insert tasks",
      "insert deadline_calculations:confirmacao",
      "insert process_movements",
      "update processes",
      "update court_publications",
      "insert audit_logs:confirm_publication",
    ]);

    const expected = computeDeadline(
      { start: { kind: "disponibilizacao", date: "2026-11-12" }, days: 15, unit: "uteis", comarca: "Santo André" },
      [holiday]
    );
    expect(out.finalDate).toBe(expected.finalDate);
    // O feriado da tabela foi pulado.
    expect(expected.skipped.map((s) => s.date)).toContain("2026-11-20");

    const [calc, task, conf, mov] = ops.map((o) => o.row);
    expect(calc).toMatchObject({ publication_id: PUB, process_id: PROC, final_date: out.finalDate, created_by: USER });
    expect(calc.input).toMatchObject({ start: { kind: "disponibilizacao", date: "2026-11-12" }, comarca: "Santo André" });
    expect(task).toMatchObject({
      title: "Prazo: Réplica à contestação",
      priority: "alta",
      status: "pendente",
      assigned_to: USER,
      process_id: PROC,
    });
    // 23:59 em São Paulo (UTC-3).
    expect(task.due_date).toBe(new Date(`${out.finalDate}T23:59:00-03:00`).toISOString());
    expect(conf).toMatchObject({ previous_id: calc.id, task_id: task.id, publication_id: PUB, final_date: out.finalDate });
    expect(mov).toMatchObject({
      process_id: PROC,
      source: "djen",
      external_key: "djen:id:987654",
      occurred_at: new Date("2026-11-12T12:00:00-03:00").toISOString(),
    });
    expect(mov.description).toBe(movementDescription({ kind: "Intimação", ai_reading: reading() }, out.finalDate));
    expect(String(mov.description)).toMatch(/^Intimação \(DJEN\): Intimação para réplica — prazo até \d{2}\/\d{2}\/\d{4}$/);

    const pub = tables.court_publications[0];
    expect(pub).toMatchObject({
      status: "confirmada",
      reviewed_by: USER,
      calculation_id: conf.id,
      task_id: task.id,
      movement_id: mov.id,
      process_id: PROC,
    });
    expect(tables.processes[0].next_deadline).toBe(task.due_date);
    expect(tables.audit_logs[0]).toMatchObject({
      action: "confirm_publication",
      entity_type: "court_publication",
      entity_id: PUB,
      user_id: USER,
      metadata: expect.objectContaining({ channel: "painel", task_id: task.id }),
    });
    expect(out).toMatchObject({ taskId: task.id, calculationId: conf.id, movementId: mov.id, processId: PROC });
  });

  it("ajuste de data: registro 'ajuste' com motivo, ligado ao cálculo, e a confirmação ligada ao ajuste", async () => {
    const { db, ops } = setup();
    const out = await confirmPublication(db, input({ overrideFinalDate: "2026-12-10", overrideReason: "Suspensão pelo Comunicado CSM 99/2026" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.finalDate).toBe("2026-12-10");
    const calcs = ops.filter((o) => o.table === "deadline_calculations").map((o) => o.row);
    expect(calcs.map((c) => c.action)).toEqual(["calculo", "ajuste", "confirmacao"]);
    expect(calcs[1]).toMatchObject({ previous_id: calcs[0].id, final_date: "2026-12-10", reason: "Suspensão pelo Comunicado CSM 99/2026" });
    expect(calcs[1].result).toMatchObject({ adjusted: { from: calcs[0].final_date, to: "2026-12-10" } });
    expect(calcs[2]).toMatchObject({ previous_id: calcs[1].id, final_date: "2026-12-10" });
    const task = ops.find((o) => o.table === "tasks")!.row;
    expect(task.due_date).toBe(new Date("2026-12-10T23:59:00-03:00").toISOString());
  });

  it("ajuste sem motivo é recusado antes de gravar qualquer coisa", async () => {
    const { db, ops } = setup();
    const out = await confirmPublication(db, input({ overrideFinalDate: "2026-12-10", overrideReason: "  " }));
    expect(out).toEqual({ ok: false, error: "Explique o motivo do ajuste da data." });
    expect(ops).toEqual([]);
  });

  it("se a confirmação no histórico falhar, desfaz a tarefa e a intimação continua para conferir", async () => {
    const { db, ops, tables } = setup({}, (table, op, row) =>
      table === "deadline_calculations" && op === "insert" && row.action === "confirmacao" ? { message: "falhou" } : null
    );
    const out = await confirmPublication(db, input());
    expect(out).toEqual({ ok: false, error: "Não consegui registrar a confirmação." });
    expect(writes(ops)).toEqual(["insert deadline_calculations:calculo", "insert tasks", "delete tasks"]);
    expect(tables.tasks).toEqual([]);
    expect(tables.court_publications[0].status).toBe("para_conferir");
    expect(tables.process_movements).toEqual([]);
  });

  it("intimação já conferida (ou descartada) é bloqueada sem gravar nada", async () => {
    for (const status of ["confirmada", "descartada"] as const) {
      const { db, ops } = setup({ status });
      const out = await confirmPublication(db, input());
      expect(out).toEqual({ ok: false, error: ALREADY_REVIEWED });
      expect(ALREADY_REVIEWED).toBe("Esta intimação já foi conferida.");
      expect(ops).toEqual([]);
    }
  });

  it("se outra pessoa conferiu no meio do caminho, a tarefa desta tentativa sai", async () => {
    // Enquanto esta tentativa lança o andamento, outra confirma a intimação.
    const { db, tables } = setup({}, (table, op) => {
      if (table === "process_movements" && op === "insert") tables.court_publications[0].status = "confirmada";
      return null;
    });
    const out = await confirmPublication(db, input());
    expect(out).toEqual({ ok: false, error: ALREADY_REVIEWED });
    expect(tables.tasks).toEqual([]);
  });

  it("se o banco recusar marcar a intimação, a tarefa sai e o erro é claro", async () => {
    const { db, tables } = setup({}, (table, op) =>
      table === "court_publications" && op === "update" ? { message: "permission denied" } : null
    );
    const out = await confirmPublication(db, input());
    expect(out).toEqual({ ok: false, error: "Não consegui marcar a intimação como conferida." });
    expect(tables.tasks).toEqual([]);
    expect(tables.court_publications[0].status).toBe("para_conferir");
  });

  it("sem processo: não lança andamento nem mexe no processo", async () => {
    const { db, ops } = setup({ process_id: null });
    const out = await confirmPublication(db, input());
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.movementId).toBeNull();
    expect(ops.some((o) => o.table === "process_movements" || o.table === "processes")).toBe(false);
  });

  it("pedir para atualizar o próximo prazo sem processo é recusado", async () => {
    const { db, ops } = setup({ process_id: null });
    const out = await confirmPublication(db, input({ updateProcessDeadline: true }));
    expect(out).toEqual({ ok: false, error: "Escolha o processo para atualizar o próximo prazo." });
    expect(ops).toEqual([]);
  });

  it("processId do input troca o vínculo e a comarca da conta", async () => {
    const { db, ops, tables } = setup();
    const out = await confirmPublication(db, input({ processId: PROC_B, updateProcessDeadline: false }));
    expect(out.ok && out.processId).toBe(PROC_B);
    expect(ops[0].row.input).toMatchObject({ comarca: "São Bernardo do Campo" });
    expect(tables.court_publications[0].process_id).toBe(PROC_B);
    expect(ops.some((o) => o.table === "processes")).toBe(false);
  });

  it("intimação cancelada no DJEN não vira prazo", async () => {
    const { db, ops } = setup({ cancelled: true });
    const out = await confirmPublication(db, input());
    expect(out.ok).toBe(false);
    expect(ops).toEqual([]);
  });

  it("canal do WhatsApp vai para a auditoria", async () => {
    const { db, tables } = setup();
    await confirmPublication(db, input({ channel: "whatsapp" }));
    expect(tables.audit_logs[0].metadata).toMatchObject({ channel: "whatsapp" });
  });
});

describe("discardPublication e linkPublicationProcess", () => {
  it("descarta com motivo e bloqueia descartar de novo", async () => {
    const { db, tables } = setup();
    expect(await discardPublication(db, { publicationId: PUB, userId: USER, reason: "", channel: "painel" })).toEqual({
      ok: false,
      error: "Informe o motivo do descarte.",
    });
    const out = await discardPublication(db, { publicationId: PUB, userId: USER, reason: "Dirigida à parte contrária", channel: "whatsapp" });
    expect(out).toEqual({ ok: true });
    expect(tables.court_publications[0]).toMatchObject({ status: "descartada", review_note: "Dirigida à parte contrária", reviewed_by: USER });
    expect(tables.audit_logs[0]).toMatchObject({ action: "discard_publication", metadata: { channel: "whatsapp", reason: "Dirigida à parte contrária" } });
    expect(tables.tasks).toEqual([]);
    const again = await discardPublication(db, { publicationId: PUB, userId: USER, reason: "de novo", channel: "painel" });
    expect(again).toEqual({ ok: false, error: ALREADY_REVIEWED });
  });

  it("vincula a outro processo só enquanto está para conferir", async () => {
    const { db, tables } = setup({ process_id: null });
    expect(await linkPublicationProcess(db, { publicationId: PUB, processId: PROC_B, userId: USER, channel: "painel" })).toEqual({ ok: true });
    expect(tables.court_publications[0].process_id).toBe(PROC_B);
    expect(
      await linkPublicationProcess(db, { publicationId: PUB, processId: "99999999-9999-4999-8999-999999999999", userId: USER, channel: "painel" })
    ).toEqual({ ok: false, error: "Processo não encontrado." });
    tables.court_publications[0].status = "confirmada";
    expect(await linkPublicationProcess(db, { publicationId: PUB, processId: PROC, userId: USER, channel: "painel" })).toEqual({
      ok: false,
      error: ALREADY_REVIEWED,
    });
  });
});

describe("defaultConfirmInput", () => {
  it("monta a confirmação a partir da leitura da IA", () => {
    expect(defaultConfirmInput(publication(), USER, "whatsapp")).toEqual({
      publicationId: PUB,
      userId: USER,
      days: 15,
      unit: "uteis",
      startKind: "disponibilizacao",
      dobro: false,
      title: "Réplica à contestação",
      processId: PROC,
      updateProcessDeadline: true,
      channel: "whatsapp",
    });
  });

  it("usa o tipo do ato quando não há título sugerido", () => {
    expect(defaultConfirmInput(publication({ ai_reading: reading({ taskTitle: null }) }), USER, "painel")?.title).toBe("Intimação para réplica");
  });

  it("devolve null quando falta sugestão, a confiança é baixa ou há dúvida no prazo", () => {
    const cases: Partial<CourtPublication>[] = [
      { ai_reading: null, ai_status: "pendente" },
      { ai_status: "falhou" },
      { ai_reading: reading({ suggestedDays: null }) },
      { ai_reading: reading({ suggestedUnit: null }) },
      { ai_reading: reading({ confidence: "baixa" }) },
      { ai_reading: reading({ requiresAction: false }) },
      { ai_reading: reading({ uncertain: ["dias"] }) },
      { ai_reading: reading({ uncertain: ["dobro"] }) },
      { status: "confirmada" },
      { cancelled: true },
    ];
    for (const c of cases) expect(defaultConfirmInput(publication(c), USER, "whatsapp")).toBeNull();
  });

  it("dúvida só no processo não impede o OK", () => {
    expect(defaultConfirmInput(publication({ ai_reading: reading({ uncertain: ["processo"], confidence: "media" }) }), USER, "whatsapp")).not.toBeNull();
  });
});

describe("regras da tela", () => {
  it("contar da ciência usa a disponibilização e avisa", () => {
    const { input: i, result } = computePublicationDeadline(
      { available_date: "2026-11-12" },
      { days: 5, unit: "uteis", startKind: "intimacao", dobro: false },
      []
    );
    expect(i.start).toEqual({ kind: "intimacao", date: "2026-11-12" });
    expect(result.warnings[0]).toBe(CIENCIA_WARNING);
  });

  it("formulário vem preenchido com a sugestão da IA", () => {
    expect(confirmFormDefaults(publication({ ai_reading: reading({ dobro: true, suggestedUnit: "corridos" }) }))).toEqual({
      days: 15,
      unit: "corridos",
      startKind: "disponibilizacao",
      dobro: true,
      title: "Réplica à contestação",
    });
    expect(confirmFormDefaults(publication({ ai_reading: null }))).toMatchObject({ days: null, unit: "uteis", title: "" });
  });

  it("comarca a partir do foro do processo", () => {
    expect(comarcaOf("Comarca de Santo André")).toBe("Santo André");
    expect(comarcaOf(null)).toBe("");
  });

  it("mock tem as situações variadas do modo demonstração", () => {
    const s = mockPublications;
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(s.some((p) => !p.process_id && p.status === "para_conferir")).toBe(true);
    expect(s.some((p) => (p.ai_reading?.uncertain.length ?? 0) > 0 && p.ai_reading?.confidence === "baixa")).toBe(true);
    expect(s.some((p) => p.status === "confirmada")).toBe(true);
    expect(s.some((p) => p.status === "descartada" && p.review_note)).toBe(true);
  });
});
