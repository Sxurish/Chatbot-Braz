import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamUser } from "@/lib/types";

// ---------------------------------------------------------------------------
// Ambiente controlado: usuário atual, Supabase ligado/desligado e banco falso.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

const env = vi.hoisted(() => ({
  configured: false,
  user: null as unknown as TeamUser,
  tables: {} as Record<string, Row[]>,
  revalidated: [] as string[],
  redirected: null as string | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => env.revalidated.push(p) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    env.redirected = url;
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => env.configured,
  hasServiceRole: () => false,
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => env.user }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!env.configured) throw new Error("não deveria tocar no banco no modo demonstração");
    return fakeClient();
  },
}));

function fakeClient() {
  return {
    from(table: string) {
      const rows = (env.tables[table] ??= []);
      const filters: ((r: Row) => boolean)[] = [];
      let mode: "select" | "insert" | "update" | "delete" = "select";
      let payload: Row = {};
      let head = false;
      let one = false;
      const run = () => {
        if (mode === "insert") {
          const row = { id: randomUUID(), ...payload };
          rows.push(row);
          return { data: row, error: null };
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === "update") hit.forEach((r) => Object.assign(r, payload));
        if (mode === "delete") hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
        if (head) return { data: null, count: hit.length, error: null };
        return { data: one ? (hit[0] ?? null) : hit, error: null };
      };
      const q = {
        select(_cols?: string, opts?: { head?: boolean }) {
          if (opts?.head) head = true;
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
        eq(c: string, v: unknown) {
          filters.push((r) => r[c] === v);
          return q;
        },
        or(expr: string) {
          // Só o formato usado: "user_id.is.null,user_id.eq.<id>".
          const id = expr.split("user_id.eq.")[1];
          filters.push((r) => r.user_id === null || r.user_id === id);
          return q;
        },
        maybeSingle() {
          one = true;
          return q;
        },
        then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(ok, ko);
        },
      };
      return q;
    },
  };
}

function user(role: TeamUser["role"], active = true): TeamUser {
  return {
    id: randomUUID(),
    name: "Pessoa",
    email: "p@x.com",
    role,
    active,
    last_login: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  env.configured = false;
  env.user = user("admin");
  env.tables = {};
  env.revalidated = [];
  env.redirected = null;
});

const rules = await import("@/lib/data/edicao-rules");
const actions = await import("@/lib/data/edicao-actions");
const { isoToBrInput, brInputToIso } = await import("@/lib/datetime-br");

const LEAD_FORM = {
  full_name: "Maria da Silva",
  phone: "11987654321",
  legal_area: "previdenciario",
  urgency: "media",
  commercial_status: "negociacao",
  legal_status: "analise_documental",
  financial_status: "consulta_pendente",
};

// ===========================================================================
// Regras puras
// ===========================================================================
describe("quem pode remover", () => {
  it("lead, cliente e caso: só o Admin", () => {
    for (const kind of ["lead", "client", "case"] as const) {
      expect(rules.canRemove("admin", kind)).toBe(true);
      for (const role of ["advogado", "atendente", "financeiro", "visualizador"] as const) {
        expect(rules.canRemove(role, kind)).toBe(false);
      }
    }
  });

  it("tarefa, follow-up e agenda: quem grava (não o Visualizador)", () => {
    for (const kind of ["task", "follow_up", "appointment"] as const) {
      for (const role of ["admin", "advogado", "atendente", "financeiro"] as const) {
        expect(rules.canRemove(role, kind)).toBe(true);
      }
      expect(rules.canRemove("visualizador", kind)).toBe(false);
    }
  });

  it("perfil inativo não remove nada", () => {
    expect(rules.canRemove("admin", "task", false)).toBe(false);
  });
});

describe("vínculos que impedem remover", () => {
  it("sem vínculos pode remover", () => {
    expect(rules.removalBlockReason("client", { cases: 0, contracts: 0 })).toBeNull();
  });

  it("explica o que está ligado e o que fazer", () => {
    expect(rules.removalBlockReason("case", { processes: 2 })).toBe(
      "Não dá para remover: há 2 processos ligados. Mude o status para “Encerrado”."
    );
    expect(rules.removalBlockReason("client", { cases: 1, payments: 3 })).toContain("1 caso e 3 pagamentos ligados");
    expect(rules.removalBlockReason("lead", { clients: 1 })).toContain("1 cliente ligado.");
  });
});

describe("formulários", () => {
  it("lead: exige telefone ou e-mail e valida os status", () => {
    expect(rules.parseLeadEdit(form({ ...LEAD_FORM, phone: "" }), false).success).toBe(false);
    expect(rules.parseLeadEdit(form({ ...LEAD_FORM, commercial_status: "xyz" }), false).success).toBe(false);
    const ok = rules.parseLeadEdit(form(LEAD_FORM), false);
    expect(ok.success).toBe(true);
    if (ok.success) expect(rules.buildLeadPatch(ok.data).phone).toBe("(11) 98765-4321");
  });

  it("agenda: fim depois do início e link com http", () => {
    const base = { title: "Consulta", date: "2026-11-25", start_time: "14:00" };
    expect(rules.parseAppointmentForm(form({ ...base, end_time: "13:00" }), false).success).toBe(false);
    expect(rules.parseAppointmentForm(form({ ...base, meeting_link: "javascript:alert(1)" }), false).success).toBe(false);
    expect(rules.parseAppointmentForm(form({ ...base, end_time: "15:00" }), false).success).toBe(true);
  });

  it("ids: com banco só UUID; no modo demonstração também os curtos", () => {
    expect(rules.isRecordId("task-1", true)).toBe(true);
    expect(rules.isRecordId("task-1", false)).toBe(false);
    expect(rules.isRecordId(randomUUID(), false)).toBe(true);
    expect(rules.isRecordId("1; drop table", true)).toBe(false);
  });

  it("data do banco volta para o campo no horário de Brasília (ida e volta)", () => {
    expect(isoToBrInput("2026-11-20T17:00:00.000Z")).toBe("2026-11-20T14:00");
    expect(isoToBrInput(brInputToIso("2026-11-20T09:30"))).toBe("2026-11-20T09:30");
    expect(isoToBrInput(null)).toBe("");
  });
});

// ===========================================================================
// Ações (com banco falso)
// ===========================================================================
describe("permissões nas ações", () => {
  it("Visualizador não edita nem conclui", async () => {
    env.configured = true;
    env.user = user("visualizador");
    const id = randomUUID();
    const r1 = await actions.updateLeadAction({}, form({ id, ...LEAD_FORM }));
    const r2 = await actions.setStatusAction({}, form({ kind: "task", id, status: "concluida" }));
    expect(r1.error).toBe("Seu perfil só pode consultar.");
    expect(r2.error).toBe("Seu perfil só pode consultar.");
  });

  it("Atendente edita lead mas não remove", async () => {
    env.configured = true;
    env.user = user("atendente");
    const id = randomUUID();
    env.tables.leads = [{ id, full_name: "Antigo", phone: null }];
    expect((await actions.updateLeadAction({}, form({ id, ...LEAD_FORM }))).ok).toBe(true);
    expect(env.tables.leads[0]).toMatchObject({ full_name: "Maria da Silva", commercial_status: "negociacao" });
    const del = await actions.deleteLeadAction({}, form({ id }));
    expect(del.error).toBe("Só o Admin pode remover este cadastro.");
    expect(env.tables.leads).toHaveLength(1);
  });

  it("modo demonstração não grava nada", async () => {
    const r = await actions.setStatusAction({}, form({ kind: "task", id: "task-1", status: "concluida" }));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("Modo demonstração");
  });
});

describe("remover com vínculos", () => {
  it("Admin não remove cliente com caso ligado", async () => {
    env.configured = true;
    const id = randomUUID();
    env.tables.clients = [{ id, full_name: "Cliente" }];
    env.tables.cases = [{ id: randomUUID(), client_id: id }];
    const r = await actions.deleteClientAction({}, form({ id }));
    expect(r.error).toContain("1 caso ligado");
    expect(env.tables.clients).toHaveLength(1);
  });

  it("Admin remove caso sem processo e fica na Auditoria", async () => {
    env.configured = true;
    const id = randomUUID();
    env.tables.cases = [{ id, title: "Caso X" }];
    await expect(actions.deleteCaseAction({}, form({ id }))).rejects.toThrow("NEXT_REDIRECT");
    expect(env.redirected).toBe("/casos");
    expect(env.tables.cases).toHaveLength(0);
    expect(env.tables.audit_logs[0]).toMatchObject({ action: "delete_case", entity_id: id });
  });
});

describe("tarefas, follow-ups e agenda", () => {
  it("concluir tarefa grava o status e a auditoria", async () => {
    env.configured = true;
    const id = randomUUID();
    env.tables.tasks = [{ id, title: "Ligar", status: "pendente" }];
    const r = await actions.setStatusAction({}, form({ kind: "task", id, status: "concluida" }));
    expect(r.ok).toBe(true);
    expect(env.tables.tasks[0].status).toBe("concluida");
    expect(env.tables.audit_logs[0]).toMatchObject({ action: "set_status", entity_type: "task" });
  });

  it("status que não existe é recusado", async () => {
    env.configured = true;
    const r = await actions.setStatusAction({}, form({ kind: "task", id: randomUUID(), status: "apagada" }));
    expect(r.error).toBe("Status inválido.");
  });

  it("editar sem o campo Responsável não apaga quem já era o responsável", async () => {
    env.configured = true;
    const id = randomUUID();
    const owner = randomUUID();
    env.tables.follow_ups = [{ id, title: "Antes", status: "pendente", assigned_to: owner }];
    const r = await actions.updateFollowUpAction(
      {},
      form({ id, title: "Depois", scheduled_at: "2026-11-25T10:00" })
    );
    expect(r.ok).toBe(true);
    expect(env.tables.follow_ups[0]).toMatchObject({ title: "Depois", assigned_to: owner, status: "pendente" });
  });

  it("atendente remove compromisso da agenda", async () => {
    env.configured = true;
    env.user = user("atendente");
    const id = randomUUID();
    env.tables.appointments = [{ id, title: "Consulta", lead_id: null }];
    const r = await actions.deleteOperationAction({}, form({ kind: "appointment", id }));
    expect(r.ok).toBe(true);
    expect(env.tables.appointments).toHaveLength(0);
  });
});

describe("notificações", () => {
  it("marcar todas como lidas só mexe nas gerais e nas da própria pessoa", async () => {
    env.configured = true;
    env.user = user("visualizador");
    const other = randomUUID();
    env.tables.notifications = [
      { id: randomUUID(), user_id: null, read: false },
      { id: randomUUID(), user_id: env.user.id, read: false },
      { id: randomUUID(), user_id: other, read: false },
    ];
    const r = await actions.markNotificationReadAction({}, form({ all: "1" }));
    expect(r.ok).toBe(true);
    expect(env.tables.notifications.map((n) => n.read)).toEqual([true, true, false]);
  });
});
