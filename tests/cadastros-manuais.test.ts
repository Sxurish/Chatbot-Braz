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
  failInsert: null as string | null,
  revalidated: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => env.revalidated.push(p) }));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => env.configured,
  hasServiceRole: () => false,
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => env.user }));
vi.mock("@/lib/data/settings", () => ({
  getSettings: async () => ({ privacy_policy_version: "2.1.0" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!env.configured) throw new Error("não deveria tocar no banco no modo demonstração");
    return fakeClient();
  },
}));

/** Converte um padrão ILIKE (com escape \) em RegExp. */
function likeToRegex(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (ch === "%") re += ".*";
    else if (ch === "_") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

function fakeClient() {
  return {
    from(table: string) {
      const rows = (env.tables[table] ??= []);
      const filters: ((r: Row) => boolean)[] = [];
      let mode: "select" | "insert" | "delete" = "select";
      let payload: Row = {};
      let single = false;
      const run = () => {
        if (mode === "insert") {
          if (env.failInsert === table) return { data: null, error: { message: "falhou" } };
          const row = { id: randomUUID(), ...payload };
          rows.push(row);
          return { data: single ? row : [row], error: null };
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === "delete") {
          for (const r of hit) rows.splice(rows.indexOf(r), 1);
          return { data: null, error: null };
        }
        return { data: hit, error: null };
      };
      const q = {
        select: () => q,
        insert(p: Row) {
          mode = "insert";
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
        ilike(c: string, p: string) {
          const re = likeToRegex(p);
          filters.push((r) => typeof r[c] === "string" && re.test(r[c] as string));
          return q;
        },
        in(c: string, vs: unknown[]) {
          filters.push((r) => vs.includes(r[c]));
          return q;
        },
        limit: () => q,
        single() {
          single = true;
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
  env.failInsert = null;
  env.revalidated = [];
});

const rules = await import("@/lib/data/cadastros-rules");
const actions = await import("@/lib/data/cadastros-actions");

// ===========================================================================
// Regras puras
// ===========================================================================
describe("CPF, CNPJ e telefone", () => {
  it("valida CPF e CNPJ pelos dígitos verificadores", () => {
    expect(rules.isValidCpf("529.982.247-25")).toBe(true);
    expect(rules.isValidCpf("52998224725")).toBe(true);
    expect(rules.isValidCpf("529.982.247-24")).toBe(false);
    expect(rules.isValidCpf("111.111.111-11")).toBe(false);
    expect(rules.isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(rules.isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(rules.formatCpfCnpj("52998224725")).toBe("529.982.247-25");
    expect(rules.formatCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("aceita telefone com DDD, com ou sem +55, e formata", () => {
    expect(rules.isValidPhone("(11) 98765-4321")).toBe(true);
    expect(rules.isValidPhone("+55 11 98765-4321")).toBe(true);
    expect(rules.isValidPhone("98765-4321")).toBe(false);
    expect(rules.formatPhone("5511987654321")).toBe("(11) 98765-4321");
    expect(rules.formatPhone("1134567890")).toBe("(11) 3456-7890");
  });

  it("monta o padrão de busca do telefone e escapa ILIKE", () => {
    expect(rules.phoneSearchPattern("(11) 98765-4321")).toBe("%8%7%6%5%4%3%2%1");
    expect(rules.phoneSearchPattern("123")).toBeNull();
    expect(rules.escapeLike("joao_silva%@x.com")).toBe("joao\\_silva\\%@x.com");
  });

  it("acha duplicado por telefone (qualquer formato), e-mail ou documento", () => {
    const rows = [
      { id: "a", full_name: "Ana", phone: "5511987654321", email: null },
      { id: "b", full_name: "Bia", phone: null, email: "Bia@X.com" },
      { id: "c", full_name: "Caio", phone: null, email: null, cpf_cnpj: "52998224725" },
    ];
    expect(rules.findDuplicate("lead", rows, { phone: "(11) 98765-4321" })).toMatchObject({ id: "a", reason: "telefone" });
    expect(rules.findDuplicate("lead", rows, { email: "bia@x.com" })).toMatchObject({ id: "b", reason: "e-mail" });
    expect(rules.findDuplicate("client", rows, { cpf_cnpj: "529.982.247-25" })).toMatchObject({ id: "c", reason: "CPF/CNPJ" });
    expect(rules.findDuplicate("lead", rows, { phone: "(11) 91111-2222" })).toBeNull();
  });
});

describe("formulário de novo lead", () => {
  const base = { full_name: "Maria da Silva", phone: "(11) 98765-4321", source: "indicacao" };

  it("exige nome, contato e origem", () => {
    expect(rules.parseLeadForm(form({ ...base, full_name: "" }), false).success).toBe(false);
    const semContato = rules.parseLeadForm(form({ full_name: "Maria", source: "indicacao" }), false);
    expect(semContato.success).toBe(false);
    if (!semContato.success) expect(rules.firstIssue(semContato.error)).toMatch(/telefone/i);
    const semOrigem = rules.parseLeadForm(form({ ...base, source: "" }), false);
    expect(semOrigem.success).toBe(false);
    expect(rules.parseLeadForm(form({ ...base, source: "chatbot" }), false).success).toBe(false);
  });

  it("recusa valores fora dos ENUMs do banco", () => {
    expect(rules.parseLeadForm(form({ ...base, legal_area: "astrologia" }), false).success).toBe(false);
    expect(rules.parseLeadForm(form({ ...base, urgency: "altissima" }), false).success).toBe(false);
    expect(rules.parseLeadForm(form({ ...base, state: "XX" }), false).success).toBe(false);
    expect(rules.parseLeadForm(form({ ...base, process_number: "123" }), false).success).toBe(false);
    expect(rules.parseLeadForm(form({ ...base, assigned_to: "joao" }), false).success).toBe(false);
  });

  it("monta a linha sem consentimento por padrão (LGPD)", () => {
    const p = rules.parseLeadForm(form({ ...base, email: "Maria@X.com", state: "sp" }), false);
    expect(p.success).toBe(true);
    if (!p.success) return;
    const row = rules.buildLeadRow(p.data, { nowIso: "2026-11-17T12:00:00.000Z", policyVersion: "2.1.0" });
    expect(row).toMatchObject({
      full_name: "Maria da Silva",
      phone: "(11) 98765-4321",
      email: "maria@x.com",
      state: "SP",
      legal_area: "nao_confirmada",
      urgency: "baixa",
      source: "indicacao",
      commercial_status: "novo_lead",
      consent_given: false,
      consent_at: null,
      privacy_policy_version: null,
      has_existing_process: false,
    });
  });

  it("com o consentimento marcado grava data e versão da política", () => {
    const p = rules.parseLeadForm(
      form({ ...base, consent: "on", process_number: "10087654320258260100" }),
      false
    );
    expect(p.success).toBe(true);
    if (!p.success) return;
    const row = rules.buildLeadRow(p.data, { nowIso: "2026-11-17T12:00:00.000Z", policyVersion: "2.1.0" });
    expect(row).toMatchObject({
      consent_given: true,
      consent_at: "2026-11-17T12:00:00.000Z",
      privacy_policy_version: "2.1.0",
      process_number: "1008765-43.2025.8.26.0100",
      has_existing_process: true,
    });
    expect(rules.buildConsentLogRow("x", "2.1.0")).toMatchObject({ channel: "manual", consent_given: true, ip_address: null });
  });
});

describe("formulários de cliente e caso", () => {
  it("cliente: CPF/CNPJ inválido é recusado; válido é formatado", () => {
    expect(rules.parseClientForm(form({ full_name: "João Souza", cpf_cnpj: "123.456.789-00" })).success).toBe(false);
    const p = rules.parseClientForm(form({ full_name: "João Souza", cpf_cnpj: "52998224725" }));
    expect(p.success).toBe(true);
    if (p.success) expect(rules.buildClientRow(p.data)).toMatchObject({ cpf_cnpj: "529.982.247-25", lead_id: null, status: "ativo" });
  });

  it("caso: precisa de título e de cliente ou lead", () => {
    const id = randomUUID();
    expect(rules.parseCaseForm(form({ title: "Revisão" }), false).success).toBe(false);
    expect(rules.parseCaseForm(form({ client_id: id }), false).success).toBe(false);
    expect(rules.parseCaseForm(form({ client_id: id, title: "Revisão", status: "aberto" }), false).success).toBe(false);
    // Ids curtos só valem no modo demonstração.
    expect(rules.parseCaseForm(form({ client_id: "client-001", title: "Revisão" }), false).success).toBe(false);
    expect(rules.parseCaseForm(form({ client_id: "client-001", title: "Revisão" }), true).success).toBe(true);
    const p = rules.parseCaseForm(form({ lead_id: id, title: "Revisão", legal_area: "previdenciario" }), false);
    expect(p.success).toBe(true);
    if (p.success)
      expect(rules.buildCaseRow(p.data)).toMatchObject({ lead_id: id, client_id: null, status: "triagem_inicial", legal_area: "previdenciario" });
  });
});

// ===========================================================================
// Ações
// ===========================================================================
describe("ações: permissão e modo demonstração", () => {
  const leadForm = { full_name: "Maria da Silva", phone: "(11) 98765-4321", source: "telefone" };

  it("visualizador e perfil inativo são recusados", async () => {
    env.user = user("visualizador");
    expect(await actions.createLeadAction({}, form(leadForm))).toEqual({ error: "Seu perfil só pode consultar." });
    expect((await actions.createClientAction({}, form({ full_name: "João Souza" }))).error).toBeTruthy();
    expect((await actions.createCaseAction({}, form({ title: "Caso", client_id: "client-001" }))).error).toBeTruthy();
    env.user = user("advogado", false);
    expect((await actions.createLeadAction({}, form(leadForm))).error).toBe("Perfil inativo.");
  });

  it("modo demonstração: sucesso com aviso, sem tocar no banco", async () => {
    const lead = await actions.createLeadAction({}, form(leadForm));
    expect(lead.ok).toBe(true);
    expect(lead.message).toMatch(/demonstração/);
    expect(lead.id).toBeUndefined();
    expect((await actions.createClientAction({}, form({ full_name: "João Souza" }))).ok).toBe(true);
    expect((await actions.createCaseAction({}, form({ title: "Caso novo", client_id: "client-001" }))).ok).toBe(true);
  });

  it("erro de validação volta como mensagem", async () => {
    expect((await actions.createLeadAction({}, form({ full_name: "Ma" }))).error).toBeTruthy();
  });
});

describe("ações com banco (falso)", () => {
  beforeEach(() => {
    env.configured = true;
    env.user = user("atendente");
  });

  it("novo lead: grava, audita e devolve o id; consentimento vai para consent_logs", async () => {
    const res = await actions.createLeadAction(
      {},
      form({ full_name: "Maria da Silva", phone: "11987654321", source: "indicacao", consent: "on" })
    );
    expect(res.ok).toBe(true);
    expect(res.id).toBeTruthy();
    const lead = env.tables.leads[0];
    expect(lead).toMatchObject({ phone: "(11) 98765-4321", consent_given: true, privacy_policy_version: "2.1.0" });
    expect(env.tables.consent_logs).toEqual([expect.objectContaining({ lead_id: res.id, channel: "manual" })]);
    expect(env.tables.audit_logs[0]).toMatchObject({ action: "create_lead", entity_id: res.id, user_id: env.user.id });
    expect(env.revalidated).toContain("/leads");
  });

  it("novo lead sem consentimento não cria registro em consent_logs", async () => {
    await actions.createLeadAction({}, form({ full_name: "Maria da Silva", email: "m@x.com", source: "outro" }));
    expect(env.tables.leads[0]).toMatchObject({ consent_given: false, consent_at: null });
    expect(env.tables.consent_logs ?? []).toHaveLength(0);
  });

  it("novo lead duplicado: avisa e só grava com 'cadastrar mesmo assim'", async () => {
    env.tables.leads = [{ id: "l1", full_name: "Maria Antiga", phone: "+55 (11) 98765-4321", email: null }];
    const res = await actions.createLeadAction({}, form({ full_name: "Maria Nova", phone: "11 98765 4321", source: "telefone" }));
    expect(res.duplicate).toMatchObject({ kind: "lead", id: "l1", reason: "telefone" });
    expect(env.tables.leads).toHaveLength(1);

    env.tables.leads.push({ id: "l2", full_name: "Joana", phone: null, email: "joana_s@x.com" });
    const byEmail = await actions.createLeadAction({}, form({ full_name: "Joana S", email: "JOANA_S@x.com", source: "site" }));
    expect(byEmail.duplicate).toMatchObject({ id: "l2", reason: "e-mail" });
    // "_" não pode virar curinga: joanaXs não é a mesma pessoa.
    const other = await actions.createLeadAction({}, form({ full_name: "Joana X", email: "joanaxs@x.com", source: "site" }));
    expect(other.ok).toBe(true);

    const forced = await actions.createLeadAction(
      {},
      form({ full_name: "Maria Nova", phone: "11 98765 4321", source: "telefone", allow_duplicate: "1" })
    );
    expect(forced.ok).toBe(true);
  });

  it("se o consentimento não grava, o lead é desfeito", async () => {
    env.failInsert = "consent_logs";
    const res = await actions.createLeadAction({}, form({ full_name: "Maria", phone: "11987654321", source: "telefone", consent: "on" }));
    expect(res.error).toMatch(/consentimento/);
    expect(env.tables.leads).toHaveLength(0);
  });

  it("novo cliente: grava sem lead; acusa cliente ou lead com o mesmo contato", async () => {
    env.tables.clients = [{ id: "c1", full_name: "Paulo", phone: null, email: null, cpf_cnpj: "529.982.247-25" }];
    env.tables.leads = [{ id: "l9", full_name: "Rita", phone: "(11) 3456-7890", email: null }];
    const dupDoc = await actions.createClientAction({}, form({ full_name: "Paulo T", cpf_cnpj: "52998224725" }));
    expect(dupDoc.duplicate).toMatchObject({ kind: "client", id: "c1", reason: "CPF/CNPJ" });
    const dupLead = await actions.createClientAction({}, form({ full_name: "Rita Souza", phone: "1134567890" }));
    expect(dupLead.duplicate).toMatchObject({ kind: "lead", id: "l9" });
    const ok = await actions.createClientAction({}, form({ full_name: "Carlos Lima", cpf_cnpj: "11222333000181", state: "sp" }));
    expect(ok.ok).toBe(true);
    expect(env.tables.clients[1]).toMatchObject({ cpf_cnpj: "11.222.333/0001-81", state: "SP", lead_id: null });
    expect(env.tables.audit_logs.at(-1)).toMatchObject({ action: "create_client" });
    expect(env.revalidated).toContain("/clientes");
  });

  it("novo caso: grava com cliente, responsável e status", async () => {
    const clientId = randomUUID();
    const owner = randomUUID();
    const res = await actions.createCaseAction(
      {},
      form({ client_id: clientId, title: "Ação revisional", status: "em_andamento", assigned_to: owner, legal_area: "bancario" })
    );
    expect(res.ok).toBe(true);
    expect(env.tables.cases[0]).toMatchObject({ client_id: clientId, lead_id: null, assigned_to: owner, status: "em_andamento" });
    expect(env.tables.audit_logs[0]).toMatchObject({ action: "create_case", entity_type: "case" });
    expect(env.revalidated).toContain("/casos");
  });

  it("falha do banco vira mensagem de erro", async () => {
    env.failInsert = "cases";
    const res = await actions.createCaseAction({}, form({ client_id: randomUUID(), title: "Ação" }));
    expect(res.error).toBe("Falha ao criar o caso.");
  });
});
