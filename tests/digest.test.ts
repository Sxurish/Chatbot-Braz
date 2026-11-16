import { describe, expect, it, vi } from "vitest";
import {
  buildDailyDigest,
  computeDailyDigest,
  digestSummaryLine,
  digestToWhatsappText,
  digestWindows,
  firstName,
  type DigestSourceData,
} from "@/lib/digest/build";
import { nextDigestRun } from "@/lib/digest/dates";
import { buildDigestTemplatePayload, sendDigestTemplate } from "@/lib/digest/whatsapp-template";
import { NO_WHATSAPP_NUMBER, runDailyDigests } from "@/lib/digest/run";

// ---------------------------------------------------------------------------
// Cliente falso do Supabase: guarda as tabelas em memória e aplica os filtros
// usados pelo resumo (eq, neq, gte, lt, lte, in, not is/in, order, limit).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
const TS = /^\d{4}-\d{2}-\d{2}T/;

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string" && TS.test(a) && TS.test(b)) return Date.parse(a) - Date.parse(b);
  return String(a).localeCompare(String(b));
}

function fakeSupabase(tables: Record<string, Row[]>) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "upsert" = "select";
    let payload: Row | null = null;
    let limit = Infinity;
    let single = false;

    const run = () => {
      const data = tables[table] ?? (tables[table] = []);
      if (op === "upsert") {
        const p = payload!;
        const i = data.findIndex((r) => r.digest_date === p.digest_date && r.user_id === p.user_id);
        if (i >= 0) data[i] = { ...data[i], ...p };
        else data.push({ id: `row-${data.length + 1}`, ...p });
        return { data: null, error: null };
      }
      const matched = data.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, payload);
        return { data: null, error: null };
      }
      const rows = matched.slice(0, limit);
      return { data: single ? rows[0] ?? null : rows, error: null };
    };

    const q = {
      select() {
        calls.push({ table, op: "select" });
        return q;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      gte: (c: string, v: unknown) => (filters.push((r) => r[c] != null && cmp(r[c], v) >= 0), q),
      lt: (c: string, v: unknown) => (filters.push((r) => r[c] != null && cmp(r[c], v) < 0), q),
      lte: (c: string, v: unknown) => (filters.push((r) => r[c] != null && cmp(r[c], v) <= 0), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      not: (c: string, operator: string, v: unknown) => {
        if (operator === "is") filters.push((r) => r[c] != null);
        else if (operator === "in") {
          const list = String(v).replace(/[()]/g, "").split(",");
          filters.push((r) => !list.includes(String(r[c])));
        } else throw new Error(`operador não suportado no fake: ${operator}`);
        return q;
      },
      order: () => q,
      limit: (n: number) => ((limit = n), q),
      maybeSingle: () => ((single = true), q),
      upsert(p: Row) {
        op = "upsert";
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
      then<T>(resolve: (v: { data: unknown; error: null }) => T, reject?: (e: unknown) => T) {
        try {
          return Promise.resolve(resolve(run()));
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
        }
      },
    };
    return q;
  }

  return { client: { from } as never, tables, calls };
}

// ---------------------------------------------------------------------------
// Dados de exemplo. "Agora": terça, 17/11/2026, 10h em São Paulo.
// ---------------------------------------------------------------------------

const TUESDAY = new Date("2026-11-17T10:00:00-03:00");
const MONDAY = new Date("2026-11-16T10:00:00-03:00");

function sample(): DigestSourceData & Record<string, Row[]> {
  return {
    processes: [
      { id: "p1", process_number: "1002345-67.2026.8.26.0554", subject: "Contestação", status: "em_andamento", next_deadline: "2026-11-18T18:00:00Z" },
      { id: "p2", process_number: "5000001-11.2026.8.26.0100", subject: null, status: "em_andamento", next_deadline: "2026-11-10T18:00:00Z" },
      { id: "p3", process_number: "5000002-22.2026.8.26.0100", subject: "Encerrado", status: "encerrado", next_deadline: "2026-11-19T18:00:00Z" },
      { id: "p4", process_number: "5000003-33.2026.8.26.0100", subject: "Longe", status: "em_andamento", next_deadline: "2026-12-30T18:00:00Z" },
    ],
    tasks: [
      // 01:30 UTC do dia 18 = 22:30 do dia 17 em São Paulo: vence hoje.
      { id: "t1", title: "Ligar para o cliente", due_date: "2026-11-18T01:30:00Z", status: "pendente", priority: "media", lead_id: null, process_id: null },
      { id: "t2", title: "Revisar petição", due_date: "2026-11-20T15:00:00Z", status: "em_andamento", priority: "alta", lead_id: null, process_id: null },
      { id: "t3", title: "Protocolar recurso", due_date: "2026-11-16T15:00:00Z", status: "pendente", priority: "alta", lead_id: null, process_id: null },
      { id: "t4", title: "Já feita", due_date: "2026-11-10T15:00:00Z", status: "concluida", priority: "baixa", lead_id: null, process_id: null },
      { id: "t5", title: "Cancelada", due_date: "2026-11-19T15:00:00Z", status: "cancelada", priority: "baixa", lead_id: null, process_id: null },
    ],
    appointments: [
      { id: "a1", title: "Audiência de conciliação", date: "2026-11-24", start_time: "14:00:00", status: "agendada", modality: "presencial", lead_id: null },
      { id: "a2", title: "Fora da janela", date: "2026-11-25", start_time: "10:00:00", status: "agendada", modality: "online", lead_id: null },
      { id: "a3", title: "Cancelado", date: "2026-11-18", start_time: "10:00:00", status: "cancelada", modality: "online", lead_id: null },
    ],
    leads: [
      // Segunda 16/11 às 9h (SP) é o corte numa terça.
      { id: "l1", full_name: "Ana Nova", legal_area: "civil", urgency: "media", urgency_reason: null, commercial_status: "novo_lead", created_at: "2026-11-16T15:00:00Z" },
      { id: "l2", full_name: "Bruno Urgente", legal_area: "penal", urgency: "alta", urgency_reason: "Prisão em flagrante", commercial_status: "novo_lead", created_at: "2026-11-17T11:00:00Z" },
      { id: "l3", full_name: "Carla Antiga Urgente", legal_area: "bancario", urgency: "alta", urgency_reason: "Busca e apreensão", commercial_status: "em_qualificacao", created_at: "2026-11-01T12:00:00Z" },
      { id: "l4", full_name: "Davi Cliente", legal_area: "penal", urgency: "alta", urgency_reason: null, commercial_status: "cliente_ativo", created_at: "2026-11-02T12:00:00Z" },
      { id: "l5", full_name: "Eva Sábado", legal_area: "familia", urgency: "baixa", urgency_reason: null, commercial_status: "novo_lead", created_at: "2026-11-14T15:00:00Z" },
      { id: "l6", full_name: "Fábio Sexta Cedo", legal_area: "familia", urgency: "baixa", urgency_reason: null, commercial_status: "novo_lead", created_at: "2026-11-13T11:00:00Z" },
    ],
    movements: [
      { id: "m1", process_id: "p1", occurred_at: "2026-11-16T18:00:00Z", description: "Juntada de petição", hidden: false, created_at: "2026-11-17T09:05:00Z" },
      { id: "m2", process_id: "p1", occurred_at: "2026-11-17T12:00:00Z", description: "Conclusão para despacho", hidden: false, created_at: "2026-11-17T12:30:00Z" },
      { id: "m3", process_id: "p2", occurred_at: "2026-11-16T20:00:00Z", description: "Oculto", hidden: true, created_at: "2026-11-16T20:00:00Z" },
      { id: "m4", process_id: "p2", occurred_at: "2025-01-10T12:00:00Z", description: "Histórico antigo", hidden: false, created_at: "2026-11-17T09:05:00Z" },
      { id: "m5", process_id: "p4", occurred_at: "2026-11-14T13:00:00Z", description: "Designada audiência", hidden: false, created_at: "2026-11-14T13:10:00Z" },
    ],
    payments: [
      { id: "pay1", description: "Parcela 2/5", amount: 1000, due_date: "2026-11-20T03:00:00Z", status: "pendente", client_id: "c1" },
      { id: "pay2", description: "Entrada", amount: 500, due_date: "2026-11-01T03:00:00Z", status: "pendente", client_id: "c1" },
      { id: "pay3", description: "Honorários", amount: 750.5, due_date: "2026-10-01T03:00:00Z", status: "atrasado", client_id: null },
      { id: "pay4", description: "Pago", amount: 999, due_date: "2026-11-19T03:00:00Z", status: "pago", client_id: null },
    ],
    clients: [{ id: "c1", full_name: "Cliente Um" }],
  } as never;
}

/** Dados de exemplo com os nomes das tabelas do banco. */
function asTables(): Record<string, Row[]> {
  const { movements, ...rest } = structuredClone(sample()) as unknown as Record<string, Row[]>;
  return { ...rest, process_movements: movements };
}

describe("janelas de data (São Paulo)", () => {
  it("terça: corte na segunda às 9h; segunda: corte na sexta às 9h", () => {
    expect(digestWindows(TUESDAY).since).toBe("2026-11-16T12:00:00.000Z");
    expect(digestWindows(MONDAY).since).toBe("2026-11-13T12:00:00.000Z");
    expect(digestWindows(TUESDAY).today).toBe("2026-11-17");
    expect(digestWindows(TUESDAY).windowEnd).toBe("2026-11-24");
    // 01h UTC de quarta ainda é terça em São Paulo.
    expect(digestWindows(new Date("2026-11-18T01:00:00Z")).today).toBe("2026-11-17");
  });

  it("próximo resumo automático: dia útil às 9h", () => {
    expect(nextDigestRun(new Date("2026-11-16T08:00:00-03:00")).label).toBe("hoje, às 9h");
    expect(nextDigestRun(new Date("2026-11-16T09:30:00-03:00")).label).toBe("amanhã, às 9h");
    expect(nextDigestRun(new Date("2026-11-20T10:00:00-03:00")).label).toBe("segunda, 23/11, às 9h");
    expect(nextDigestRun(new Date("2026-11-21T08:00:00-03:00")).date).toBe("2026-11-23");
  });
});

describe("computeDailyDigest", () => {
  const d = computeDailyDigest(sample(), { now: TUESDAY, includeFinance: false });

  it("prazos dos próximos 7 dias, com hoje/amanhã e vencidos primeiro", () => {
    const ids = d.prazos.items.map((p) => `${p.kind}:${p.id}`);
    expect(ids).toEqual(["processo:p2", "tarefa:t1", "processo:p1", "tarefa:t2", "compromisso:a1"]);
    expect(d.prazos.upcoming).toBe(4);
    expect(d.prazos.today).toBe(1);
    expect(d.prazos.tomorrow).toBe(1);
    expect(d.prazos.overdue).toBe(1);
    const p1 = d.prazos.items.find((p) => p.id === "p1")!;
    expect(p1).toMatchObject({ when: "amanhã", href: "/processos/p1", overdue: false });
    expect(d.prazos.items[0]).toMatchObject({ overdue: true, when: "venceu há 7 dias", href: "/processos/p2" });
    expect(d.prazos.items.find((p) => p.id === "a1")).toMatchObject({ time: "14:00", href: "/agenda" });
    expect(d.prazos.items.find((p) => p.id === "t1")).toMatchObject({ when: "hoje", href: "/tarefas" });
  });

  it("leads novos desde o dia útil anterior às 9h e urgentes em aberto", () => {
    expect(d.leads.novos.items.map((l) => l.id)).toEqual(["l2", "l1"]);
    expect(d.leads.urgentes.items.map((l) => l.id)).toEqual(["l2", "l3"]);
    expect(d.leads.urgentes.items[1]).toMatchObject({ href: "/leads/l3", area: "Direito Bancário", urgent: true });
  });

  it("na segunda, os leads novos cobrem o fim de semana", () => {
    const monday = computeDailyDigest(sample(), { now: MONDAY, includeFinance: false });
    // Sábado entra; sexta às 8h (antes do corte) não.
    expect(monday.leads.novos.items.map((l) => l.id)).toContain("l5");
    expect(monday.leads.novos.items.map((l) => l.id)).not.toContain("l6");
    // Andamento de sábado entra na segunda (o de terça, nos dados, ainda nem existia).
    expect(monday.andamentos.processos.map((g) => g.processId)).toContain("p4");
  });

  it("andamentos novos agrupados por processo, sem ocultos nem histórico antigo", () => {
    expect(d.andamentos.total).toBe(2);
    expect(d.andamentos.processos).toHaveLength(1);
    expect(d.andamentos.processos[0]).toMatchObject({
      processId: "p1",
      label: "Processo 1002345-67.2026.8.26.0554",
      href: "/processos/p1",
      total: 2,
    });
    expect(d.andamentos.processos[0].items[0].description).toBe("Conclusão para despacho");
  });

  it("tarefas atrasadas: abertas com vencimento antes de hoje", () => {
    expect(d.tarefasAtrasadas.items.map((t) => t.id)).toEqual(["t3"]);
    expect(d.tarefasAtrasadas.items[0]).toMatchObject({ daysLate: 1, href: "/tarefas" });
  });

  it("financeiro só com includeFinance", () => {
    expect(d.financeiro).toBeNull();
    const admin = computeDailyDigest(sample(), { now: TUESDAY, includeFinance: true });
    expect(admin.financeiro!.aReceber).toMatchObject({ total: 1, amount: 1000 });
    expect(admin.financeiro!.aReceber.items[0]).toMatchObject({ client: "Cliente Um", href: "/financeiro" });
    expect(admin.financeiro!.atrasados).toMatchObject({ total: 2, amount: 1250.5 });
  });
});

describe("buildDailyDigest com o banco (cliente falso)", () => {
  it("dá o mesmo resultado que o cálculo puro", async () => {
    const { client } = fakeSupabase(asTables());
    const built = await buildDailyDigest(client, { now: TUESDAY, includeFinance: true });
    const pure = computeDailyDigest(sample(), { now: TUESDAY, includeFinance: true });
    expect(built).toEqual(pure);
  });

  it("não consulta pagamentos sem includeFinance", async () => {
    const { client, calls } = fakeSupabase(asTables());
    const built = await buildDailyDigest(client, { now: TUESDAY, includeFinance: false });
    expect(built.financeiro).toBeNull();
    expect(calls.some((c) => c.table === "payments")).toBe(false);
  });
});

describe("textos", () => {
  const admin = computeDailyDigest(sample(), { now: TUESDAY, includeFinance: true });

  it("linha do resumo: uma linha, sem financeiro, < 900 caracteres", () => {
    const line = digestSummaryLine(admin);
    expect(line).toBe(
      "4 prazos nos próximos 7 dias (1 hoje, 1 amanhã) · 1 prazo vencido · 2 leads novos · 2 leads urgentes · 2 andamentos novos · 1 tarefa atrasada"
    );
    expect(line).not.toMatch(/[\n\r\t]/);
    expect(line).not.toMatch(/R\$|receber|atraso/i);
    expect(line.length).toBeLessThan(900);
  });

  it("linha do resumo sem pendências", () => {
    const empty = computeDailyDigest(
      { processes: [], tasks: [], appointments: [], leads: [], movements: [] },
      { now: TUESDAY, includeFinance: false }
    );
    expect(digestSummaryLine(empty)).toMatch(/^nada pendente/);
  });

  it("primeiro nome sem título", () => {
    expect(firstName("Dr. Jean Braz")).toBe("Jean");
    expect(firstName("Marina Alves")).toBe("Marina");
    expect(firstName("")).toBe("equipe");
  });

  it("WhatsApp: links absolutos, negrito com um asterisco e sem financeiro", () => {
    const text = digestToWhatsappText(admin, "https://crm.exemplo.com.br/");
    expect(text).toContain("*Resumo do CRM — terça, 17/11*");
    expect(text).toContain("https://crm.exemplo.com.br/processos/p1");
    expect(text).toContain("https://crm.exemplo.com.br/leads/l2");
    expect(text).toContain("https://crm.exemplo.com.br/agenda");
    expect(text).toContain("https://crm.exemplo.com.br/tarefas");
    expect(text).not.toContain("**");
    expect(text).not.toMatch(/R\$|financeiro|1\.000|1000/i);
    // Lead urgente que também é novo não se repete.
    expect(text.match(/Bruno Urgente/g)).toHaveLength(1);
  });

  it("WhatsApp: encurta listas grandes com 'e mais N' e fica em até 3500 caracteres", () => {
    const big = sample();
    big.tasks = Array.from({ length: 80 }, (_, i) => ({
      id: `late-${i}`,
      title: `Tarefa atrasada número ${i} com um título bem comprido para ocupar espaço *negrito* indevido`,
      due_date: "2026-11-02T15:00:00Z",
      status: "pendente" as const,
      priority: "media" as const,
      lead_id: null,
      process_id: null,
    }));
    big.leads = Array.from({ length: 60 }, (_, i) => ({
      id: `lead-${i}`,
      full_name: `Pessoa ${i} com nome bastante longo para testar`,
      legal_area: "civil" as const,
      urgency: "alta" as const,
      urgency_reason: "Motivo urgente e detalhado do atendimento",
      commercial_status: "novo_lead" as const,
      created_at: "2026-11-17T11:00:00Z",
    }));
    const d = computeDailyDigest(big, { now: TUESDAY, includeFinance: false });
    const text = digestToWhatsappText(d, "https://crm.exemplo.com.br");
    expect(text.length).toBeLessThanOrEqual(3500);
    expect(text).toMatch(/_e mais \d+_/);
    expect(text).toContain("_e mais 75_");
    expect(text).not.toContain("*negrito*");
  });
});

describe("envio pelo modelo do WhatsApp", () => {
  const env = { WHATSAPP_ACCESS_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "123456" };

  it("monta o payload do Graph API com {{1}} e {{2}}", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 })
    );
    const out = await sendDigestTemplate(
      { to: "+55 (11) 99999-7777", firstName: "Jean", summaryLine: "3 prazos\nnos próximos 7 dias" },
      { fetchImpl: fetchImpl as never, env: { ...env, WHATSAPP_DIGEST_TEMPLATE: "meu_resumo" } }
    );
    expect(out).toEqual({ ok: true, messageId: "wamid.1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/123456/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511999997777",
      type: "template",
      template: {
        name: "meu_resumo",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Jean" },
              { type: "text", text: "3 prazos nos próximos 7 dias" },
            ],
          },
        ],
      },
    });
  });

  it("padrões: resumo_diario e pt_BR", () => {
    const p = buildDigestTemplatePayload({ to: "1", firstName: "A", summaryLine: "B", name: "resumo_diario", lang: "pt_BR" });
    expect(p.template.name).toBe("resumo_diario");
  });

  it("sem configuração: avisa e não chama a Meta", async () => {
    const fetchImpl = vi.fn();
    const out = await sendDigestTemplate(
      { to: "5511999997777", firstName: "Jean", summaryLine: "x" },
      { fetchImpl: fetchImpl as never, env: {} }
    );
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toMatch(/WhatsApp ainda não configurado/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("explica erro de modelo não aprovado e erro de rede, sem lançar", async () => {
    const notApproved = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 132001, message: "Template name does not exist" } }), { status: 404 })
    );
    const a = await sendDigestTemplate(
      { to: "5511999997777", firstName: "Jean", summaryLine: "x" },
      { fetchImpl: notApproved as never, env }
    );
    expect(!a.ok && a.error).toMatch(/modelo "resumo_diario".*aprovado/);

    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const b = await sendDigestTemplate(
      { to: "5511999997777", firstName: "Jean", summaryLine: "x" },
      { fetchImpl: down as never, env }
    );
    expect(b).toEqual({ ok: false, error: expect.stringMatching(/rede/) });
  });
});

describe("rotina diária", () => {
  function setup() {
    const tables = asTables();
    tables.users = [
      { id: "u1", name: "Dr. Jean Braz", role: "admin", active: true, daily_digest: true, whatsapp_number: "5511999997777" },
      { id: "u2", name: "Marina Alves", role: "advogado", active: true, daily_digest: true, whatsapp_number: null },
      { id: "u3", name: "Rafael", role: "atendente", active: true, daily_digest: false, whatsapp_number: "5511988887777" },
      { id: "u4", name: "Inativo", role: "admin", active: false, daily_digest: true, whatsapp_number: "5511977776666" },
    ];
    tables.daily_digests = [];
    return fakeSupabase(tables);
  }

  it("grava para cada pessoa marcada, envia a quem tem número e não reenvia", async () => {
    const { client, tables } = setup();
    const send = vi.fn(async () => ({ ok: true as const, messageId: "wamid.1" }));
    const first = await runDailyDigests(client, { now: TUESDAY, send });

    expect(first.results).toEqual([
      { userId: "u1", status: "enviado" },
      { userId: "u2", status: "salvo_sem_whatsapp", error: NO_WHATSAPP_NUMBER },
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    const sent = (send.mock.calls[0] as unknown as [{ to: string; firstName: string; summaryLine: string }])[0];
    expect(sent.to).toBe("5511999997777");
    expect(sent.firstName).toBe("Jean");
    expect(sent.summaryLine).not.toMatch(/R\$|receber/);

    const rows = tables.daily_digests;
    expect(rows).toHaveLength(2);
    const jean = rows.find((r) => r.user_id === "u1")!;
    expect(jean.digest_date).toBe("2026-11-17");
    expect(jean.whatsapp_sent_at).toBeTruthy();
    expect((jean.content as { financeiro: unknown }).financeiro).not.toBeNull();
    const marina = rows.find((r) => r.user_id === "u2")!;
    expect((marina.content as { financeiro: unknown }).financeiro).toBeNull();
    expect(marina.whatsapp_error).toBe(NO_WHATSAPP_NUMBER);

    const again = await runDailyDigests(client, { now: TUESDAY, send });
    expect(again.results[0]).toEqual({ userId: "u1", status: "ja_enviado" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(tables.daily_digests).toHaveLength(2);
  });

  it("guarda o erro do WhatsApp", async () => {
    const { client, tables } = setup();
    const send = vi.fn(async () => ({ ok: false as const, error: "WhatsApp ainda não configurado." }));
    const out = await runDailyDigests(client, { now: TUESDAY, send });
    expect(out.results[0]).toMatchObject({ userId: "u1", status: "falha_whatsapp" });
    const jean = tables.daily_digests.find((r) => r.user_id === "u1")!;
    expect(jean.whatsapp_sent_at).toBeNull();
    expect(jean.whatsapp_error).toBe("WhatsApp ainda não configurado.");
  });

  it("não roda no fim de semana", async () => {
    const { client } = setup();
    const send = vi.fn();
    const out = await runDailyDigests(client, { now: new Date("2026-11-21T09:00:00-03:00"), send: send as never });
    expect(out.skipped).toMatch(/Fim de semana/);
    expect(send).not.toHaveBeenCalled();
  });
});
