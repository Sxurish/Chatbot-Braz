import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamUser } from "@/lib/types";

// ---------------------------------------------------------------------------
// Ambiente controlado: usuário atual, Supabase ligado e um banco falso que
// guarda o que cada formulário mandaria gravar.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; select?: string };

const env = vi.hoisted(() => ({
  configured: true,
  user: null as unknown as TeamUser,
  tables: {} as Record<string, Row[]>,
  calls: [] as { table: string; op: string; payload?: unknown; select?: string }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => env.configured,
  hasServiceRole: () => false,
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => env.user }));
vi.mock("@/lib/data/settings", () => ({
  getSettings: async () => ({
    office_name: "Escritório",
    privacy_policy_version: "1.0.0",
    ai_provider: "mock",
    ai_model: null,
    office: {},
    ai: {},
    assistant: { enabled: true, monthly_limit_usd: 20 },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));

function fakeClient() {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let op = "select";
      let payload: unknown;
      let select: string | undefined;
      const rows = () =>
        (env.tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
      const result = () => {
        if (op === "select") return { data: rows(), error: null, count: rows().length };
        return { data: [{ id: "99999999-9999-4999-8999-999999999999" }], error: null };
      };
      const b = {
        select(cols?: string) {
          select = cols;
          if (op === "select") env.calls.push({ table, op, select: cols });
          return b;
        },
        insert(p: unknown) {
          op = "insert";
          payload = p;
          env.calls.push({ table, op, payload: p });
          return b;
        },
        update(p: unknown) {
          op = "update";
          payload = p;
          env.calls.push({ table, op, payload: p });
          return b;
        },
        upsert(p: unknown) {
          op = "upsert";
          payload = p;
          env.calls.push({ table, op, payload: p });
          return b;
        },
        delete() {
          op = "delete";
          env.calls.push({ table, op });
          return b;
        },
        eq(k: string, v: unknown) {
          filters.push([k, v]);
          return b;
        },
        order: () => b,
        limit: () => b,
        range: () => b,
        is: () => b,
        not: () => b,
        ilike: () => b,
        async maybeSingle() {
          if (op === "select") return { data: rows()[0] ?? null, error: null };
          return { data: { id: "99999999-9999-4999-8999-999999999999" }, error: null };
        },
        async single() {
          return this.maybeSingle();
        },
        then(resolve: (v: unknown) => void) {
          void payload;
          void select;
          resolve(result());
        },
      };
      return b;
    },
  };
}

function person(role: TeamUser["role"]): TeamUser {
  return {
    id: "10000000-0000-4000-8000-00000000000" + (role === "admin" ? "1" : "3"),
    name: role,
    email: `${role}@x`,
    role,
    active: true,
    last_login: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function inserted(table: string): Row | undefined {
  return env.calls.find((c: Call) => c.table === table && c.op === "insert")?.payload as Row | undefined;
}

const LEAD = "20000000-0000-4000-8000-000000000001";
const CASE = "30000000-0000-4000-8000-000000000001";

beforeEach(() => {
  env.configured = true;
  env.user = person("atendente");
  env.tables = {};
  env.calls = [];
});

// ---------------------------------------------------------------------------
describe("datas digitadas nos formulários (horário de Brasília)", () => {
  it("converte data e hora sem depender do fuso do servidor", async () => {
    const { brInputToIso } = await import("@/lib/datetime-br");
    expect(brInputToIso("2026-11-20T14:00")).toBe("2026-11-20T17:00:00.000Z");
    expect(brInputToIso("2026-11-20T14:00:30")).toBe("2026-11-20T17:00:30.000Z");
    // Só a data: meio-dia em Brasília, para o dia não mudar na tela.
    expect(brInputToIso("2026-11-20")).toBe("2026-11-20T15:00:00.000Z");
    expect(brInputToIso("2026-11-20T10:00:00Z")).toBe("2026-11-20T10:00:00.000Z");
    expect(brInputToIso("")).toBeNull();
    expect(brInputToIso(undefined)).toBeNull();
    expect(brInputToIso("amanhã")).toBeNull();
  });
});

describe("tarefa, follow-up e agendamento", () => {
  it("tarefa grava o prazo no horário de Brasília", async () => {
    const { createTaskAction } = await import("@/lib/data/actions");
    const out = await createTaskAction(
      {},
      form({ title: "Protocolar defesa", due_date: "2026-11-20T14:00", priority: "alta", lead_id: LEAD })
    );
    expect(out).toEqual({ ok: true });
    expect(inserted("tasks")).toMatchObject({
      title: "Protocolar defesa",
      due_date: "2026-11-20T17:00:00.000Z",
      priority: "alta",
      status: "pendente",
      lead_id: LEAD,
    });
  });

  it("visualizador não cria tarefa, follow-up, agendamento nem caso", async () => {
    env.user = person("visualizador");
    const a = await import("@/lib/data/actions");
    const results = await Promise.all([
      a.createTaskAction({}, form({ title: "Tarefa" })),
      a.createFollowUpAction({}, form({ title: "Retorno", scheduled_at: "2026-11-20T10:00" })),
      a.createAppointmentAction({}, form({ title: "Consulta", date: "2026-11-20", start_time: "10:00" })),
      a.createCaseFromLeadAction({}, form({ lead_id: LEAD, title: "Caso" })),
      a.convertLeadToClientAction({}, form({ lead_id: LEAD })),
    ]);
    for (const r of results) expect(r.error).toBe("Seu perfil só pode consultar.");
    expect(env.calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("follow-up grava a data no horário de Brasília", async () => {
    const { createFollowUpAction } = await import("@/lib/data/actions");
    const out = await createFollowUpAction({}, form({ title: "Retornar", scheduled_at: "2026-11-20T09:30" }));
    expect(out.ok).toBe(true);
    expect(inserted("follow_ups")).toMatchObject({ scheduled_at: "2026-11-20T12:30:00.000Z", lead_id: null });
  });

  it("agendamento recusa fim antes do início", async () => {
    const { createAppointmentAction } = await import("@/lib/data/actions");
    const out = await createAppointmentAction(
      {},
      form({ title: "Consulta", date: "2026-11-20", start_time: "15:00", end_time: "14:00" })
    );
    expect(out.error).toBe("O fim precisa ser depois do início.");
    expect(inserted("appointments")).toBeUndefined();
  });

  it("caso criado a partir de lead já convertido nasce ligado ao cliente", async () => {
    env.tables = {
      leads: [{ id: LEAD, legal_area: "civil", subarea: null, case_summary: "x", assigned_to: null }],
      clients: [{ id: "40000000-0000-4000-8000-000000000001", lead_id: LEAD }],
    };
    const { createCaseFromLeadAction } = await import("@/lib/data/actions");
    const out = await createCaseFromLeadAction({}, form({ lead_id: LEAD, title: "Ação de cobrança" }));
    expect(out.ok).toBe(true);
    expect(inserted("cases")).toMatchObject({
      lead_id: LEAD,
      client_id: "40000000-0000-4000-8000-000000000001",
      legal_area: "civil",
      status: "triagem_inicial",
    });
  });
});

describe("processos, contratos e pagamentos", () => {
  it("data do processo não volta um dia (meio-dia em Brasília)", async () => {
    const { createProcessAction } = await import("@/lib/data/fase6-actions");
    const out = await createProcessAction(
      {},
      form({ case_id: CASE, process_number: "1002345-67.2026.8.26.0554", status: "em_andamento", next_deadline: "2026-11-20" })
    );
    expect(out.ok).toBe(true);
    expect(inserted("processes")).toMatchObject({ next_deadline: "2026-11-20T15:00:00.000Z" });
  });

  it("visualizador não cria nem edita processo", async () => {
    env.user = person("visualizador");
    const { createProcessAction, updateProcessAction } = await import("@/lib/data/fase6-actions");
    const c = await createProcessAction({}, form({ case_id: CASE }));
    const u = await updateProcessAction({}, form({ id: "50000000-0000-4000-8000-000000000001", case_id: CASE }));
    expect(c.error).toBe("Seu perfil só pode consultar.");
    expect(u.error).toBe("Seu perfil só pode consultar.");
    expect(env.calls).toHaveLength(0);
  });

  it("pagamento grava vencimento e pagamento sem mudar o dia", async () => {
    env.user = person("admin");
    const { createPaymentAction } = await import("@/lib/data/fase6-actions");
    const out = await createPaymentAction(
      {},
      form({ amount: "1500.50", due_date: "2026-12-01", paid_at: "2026-11-30", status: "pago" })
    );
    expect(out.ok).toBe(true);
    expect(inserted("payments")).toMatchObject({
      amount: 1500.5,
      due_date: "2026-12-01T15:00:00.000Z",
      paid_at: "2026-11-30T15:00:00.000Z",
      contract_id: null,
      client_id: null,
    });
  });

  it("modo demonstração aceita os ids de exemplo (case-001)", async () => {
    env.configured = false;
    const { createProcessAction } = await import("@/lib/data/fase6-actions");
    const out = await createProcessAction({}, form({ case_id: "case-001" }));
    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/demonstração/);
  });
});

describe("leituras e auditoria", () => {
  it("lista de documentos pede a coluna certa do processo (process_number)", async () => {
    env.tables = {
      documents: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          file_name: "a.pdf",
          processes: { process_number: "1002345-67.2026.8.26.0554" },
        },
      ],
    };
    const { listDocuments } = await import("@/lib/data/documents-read");
    const out = await listDocuments();
    const sel = env.calls.find((c) => c.table === "documents" && c.op === "select")?.select ?? "";
    expect(sel).toContain("processes(process_number)");
    expect(sel).not.toMatch(/processes\(number\)/);
    expect(out.rows[0]?.process_number).toBe("1002345-67.2026.8.26.0554");
  });

  it("mudança nas configurações fica na auditoria (entity_id não é '1')", async () => {
    env.user = person("admin");
    const { updateAssistantAction } = await import("@/lib/data/settings-actions");
    const out = await updateAssistantAction({}, form({ enabled: "on", monthly_limit_usd: "30" }));
    expect(out.ok).toBe(true);
    const log = inserted("audit_logs");
    expect(log).toMatchObject({ action: "update_assistant", entity_type: "settings", entity_id: null });
  });

  it("SQL de correção cria a coluna de follow_ups e as regras do bucket de templates", () => {
    const sql = readFileSync("supabase/correcao-cadastros.sql", "utf8");
    expect(sql).toMatch(/alter table public\.follow_ups\s+add column if not exists updated_at/);
    expect(sql).toContain("'document_templates'");
    for (const p of ["team_read", "admin_insert", "admin_update", "admin_delete"]) {
      expect(sql).toContain(`"${p}_document_templates"`);
    }
  });
});

describe('arquivos "use server"', () => {
  it("só exportam funções async (senão todas as ações da página caem com erro 500)", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk("src");
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!/^\s*["']use server["'];?/.test(src)) continue;
      for (const line of src.split("\n")) {
        if (/^export\s+(const|let|var|class|enum|default)\b/.test(line)) bad.push(`${f}: ${line.trim()}`);
        if (/^export\s+function\b/.test(line)) bad.push(`${f}: ${line.trim()}`);
        if (/^export\s*\{/.test(line)) bad.push(`${f}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
