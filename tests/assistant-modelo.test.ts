import { describe, expect, it, vi } from "vitest";
import type { DocumentTemplate } from "@/lib/data/templates-types";
import type { TemplatePreview } from "@/lib/data/templates-generate";
import type { Lead, TeamUser, UserRole } from "@/lib/types";

// Modo demonstração (sem Supabase): só a leitura do modelo + lead é falsa.
const env = vi.hoisted(() => ({ templates: [] as unknown[], previews: new Map<string, unknown>() }));

vi.mock("@/lib/data/templates-generate", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data/templates-generate")>();
  return {
    ...original,
    loadTemplatePreview: vi.fn(async (templateId: string, leadId: string) => {
      const p = env.previews.get(`${templateId}|${leadId}`);
      return p ? { ok: true, preview: p } : { ok: false, error: "Template não encontrado." };
    }),
  };
});
vi.mock("@/lib/data/templates-read", () => ({
  listTemplates: async () => env.templates,
  getTemplate: async (id: string) => (env.templates as DocumentTemplate[]).find((t) => t.id === id) ?? null,
}));

const {
  MODELO_AUTO_PREFIX,
  MODELO_FIELD_PREFIX,
  modeloOverrides,
  pickDraftFields,
  validateDraft,
  buildInsertPlan,
  DRAFT_KINDS,
} = await import("@/lib/assistant/draft-schema");
const { buildModeloDraftData, DRAFT_TOOLS } = await import("@/lib/assistant/draft-tools");
const { executeTool, ALL_TOOLS } = await import("@/lib/assistant/tools");
const { getWhatsappTools } = await import("@/lib/assistant/whatsapp");
const { buildDraftFooter } = await import("@/lib/assistant/whatsapp-format");
const { getDraft } = await import("@/lib/assistant/drafts");
const { confirmDraft } = await import("@/lib/assistant/confirm-draft");
const { canGenerateFromTemplates, checkTemplateGeneration, isContractTemplate } = await import(
  "@/lib/data/templates-permissions"
);

function template(id: string, category: string, name: string, placeholders: string[]): DocumentTemplate {
  return {
    id,
    name,
    description: null,
    category,
    storage_path: `${id}.docx`,
    placeholders,
    active: true,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
}

const PROCURACAO = template("tpl-proc", "procuracao", "Procuração ad judicia", [
  "cliente.nome",
  "cliente.email",
  "cpf",
  "data.hoje",
  "estado_civil",
]);
const CONTRATO = template("tpl-contr", "contrato", "Contrato de honorários", ["cliente.nome", "valor"]);
env.templates = [PROCURACAO, CONTRATO];

const LEAD = { id: "lead-001", full_name: "Maria Souza" } as Lead;

function preview(t: DocumentTemplate): TemplatePreview {
  return {
    template: t,
    lead: LEAD,
    autoData: { "cliente.nome": "Maria Souza", "cliente.email": "", "data.hoje": "21/11/2026" },
    manualFields: t.placeholders.filter((p) => !p.includes(".")).sort(),
  };
}
env.previews.set("tpl-proc|lead-001", preview(PROCURACAO));
env.previews.set("tpl-contr|lead-001", preview(CONTRATO));
// client-001 (dados de exemplo) é ligado ao lead-008.
env.previews.set("tpl-proc|lead-008", { ...preview(PROCURACAO), lead: { id: "lead-008", full_name: "Cliente" } });

function user(role: UserRole): TeamUser {
  return { id: `demo-${role}`, name: role, email: `${role}@ex.com`, role, active: true, last_login: null, created_at: "" };
}
const ctx = (role: UserRole, channel: "painel" | "whatsapp" = "painel") => ({
  user: user(role),
  isAdmin: role === "admin",
  now: new Date("2026-11-21T12:00:00Z"),
  canWrite: role !== "visualizador",
  channel,
  conversationId: `conv-${role}-${channel}`,
});

describe("permissões dos modelos", () => {
  it("só Advogado(a) e Admin geram", () => {
    expect(canGenerateFromTemplates("admin")).toBe(true);
    expect(canGenerateFromTemplates("advogado")).toBe(true);
    for (const r of ["atendente", "financeiro", "visualizador"] as const) {
      expect(canGenerateFromTemplates(r)).toBe(false);
      expect(checkTemplateGeneration(r, PROCURACAO).ok).toBe(false);
    }
  });

  it("contrato: Advogado e Admin no painel; ninguém pelo WhatsApp", () => {
    expect(checkTemplateGeneration("advogado", CONTRATO).ok).toBe(true);
    expect(checkTemplateGeneration("admin", CONTRATO).ok).toBe(true);
    expect(checkTemplateGeneration("admin", CONTRATO, "whatsapp").ok).toBe(false);
    expect(checkTemplateGeneration("advogado", PROCURACAO, "whatsapp").ok).toBe(true);
  });

  it("reconhece contrato pela categoria ou pelo nome", () => {
    expect(isContractTemplate({ category: "contrato" })).toBe(true);
    expect(isContractTemplate({ category: "honorarios" })).toBe(true);
    expect(isContractTemplate({ category: "outros", name: "Termo de honorários advocatícios" })).toBe(true);
    expect(isContractTemplate({ category: "procuracao", name: "Procuração ad judicia" })).toBe(false);
  });
});

describe("rascunho de modelo: schema", () => {
  it("existe o tipo modelo e não vira linha direta no banco", () => {
    expect(DRAFT_KINDS).toContain("modelo");
    expect(() => buildInsertPlan("modelo", { template_id: "a", lead_id: "b" } as never)).toThrow();
  });

  it("exige modelo e lead", () => {
    expect(validateDraft("modelo", { lead_id: "lead-001" }).ok).toBe(false);
    const semLead = validateDraft("modelo", { template_id: "tpl-proc" });
    expect(semLead.ok).toBe(false);
    if (!semLead.ok) expect(semLead.field).toBe("lead_id");
    expect(validateDraft("modelo", { template_id: "tpl-proc", lead_id: "lead-001", "campo.cpf": "123" }).ok).toBe(true);
  });

  it("do navegador só passam os campos do modelo com nomes válidos", () => {
    const picked = pickDraftFields("modelo", {
      template_id: "tpl-proc",
      template_id_label: "Procuração",
      lead_id: "lead-001",
      "campo.cpf": "123.456.789-00",
      "campo.<script>": "x",
      "auto.cliente.nome": "Maria",
      user_id: "outra-pessoa",
      storage_path: "../../segredo",
      "campo.numero": 5,
    });
    expect(picked).toEqual({
      template_id: "tpl-proc",
      template_id_label: "Procuração",
      lead_id: "lead-001",
      "campo.cpf": "123.456.789-00",
      "auto.cliente.nome": "Maria",
    });
    expect(modeloOverrides({ ...picked, "campo.vazio": "  " })).toEqual({ cpf: "123.456.789-00" });
  });

  it("prévia dos automáticos, manuais editáveis e vazios como incertos", () => {
    const { data, uncertain, ignored } = buildModeloDraftData(preview(PROCURACAO), { cpf: "123", inventado: "x" }, [
      "estado_civil",
    ]);
    expect(data[`${MODELO_AUTO_PREFIX}cliente.nome`]).toBe("Maria Souza");
    expect(data[`${MODELO_FIELD_PREFIX}cpf`]).toBe("123");
    expect(data[`${MODELO_FIELD_PREFIX}estado_civil`]).toBe("");
    expect(data.template_id_label).toBe("Procuração ad judicia");
    expect(data.lead_id_label).toBe("Maria Souza");
    expect(uncertain.sort()).toEqual(["auto.cliente.email", "campo.estado_civil"]);
    expect(ignored).toEqual(["inventado"]);
  });
});

describe("ferramentas de modelo", () => {
  it("listar_modelos traz campos automáticos e se pode gerar", async () => {
    expect(ALL_TOOLS.map((t) => t.name)).toContain("listar_modelos");
    const out = await executeTool("listar_modelos", {}, ctx("atendente"));
    expect(out.ok).toBe(true);
    const r = (out as { result: { modelos: { id: string; campos: { nome: string; automatico: boolean }[]; pode_gerar: boolean }[] } })
      .result;
    const proc = r.modelos.find((m) => m.id === "tpl-proc")!;
    expect(proc.campos).toContainEqual({ nome: "cpf", automatico: false });
    expect(proc.campos).toContainEqual({ nome: "cliente.nome", automatico: true });
    expect(proc.pode_gerar).toBe(false);
  });

  it("visualizador não prepara", async () => {
    const out = await executeTool("preparar_modelo", { template_id: "tpl-proc", lead_id: "lead-001" }, ctx("visualizador"), DRAFT_TOOLS);
    expect(out.ok).toBe(false);
  });

  it("atendente e financeiro recebem recusa educada", async () => {
    for (const role of ["atendente", "financeiro"] as const) {
      const out = await executeTool("preparar_modelo", { template_id: "tpl-proc", lead_id: "lead-001" }, ctx(role), DRAFT_TOOLS);
      expect(out.ok && (out.result as { erro?: string }).erro).toMatch(/Advogado\(a\) e Admin/);
    }
  });

  it("advogado prepara procuração e contrato no painel", async () => {
    const events: unknown[] = [];
    const out = await executeTool(
      "preparar_modelo",
      { template_id: "tpl-proc", lead_id: "lead-001", campos: { cpf: "123.456.789-00" } },
      { ...ctx("advogado"), emit: (e) => events.push(e) },
      DRAFT_TOOLS
    );
    expect(out.ok).toBe(true);
    const r = (out as { result: { rascunho_id: string; incertos: string[] } }).result;
    expect(r.incertos).toContain("campo.estado_civil");
    expect(events).toHaveLength(1);
    const saved = await getDraft("demo-advogado", r.rascunho_id);
    expect(saved?.kind).toBe("modelo");
    expect(saved?.data["campo.cpf"]).toBe("123.456.789-00");

    const contrato = await executeTool("preparar_modelo", { template_id: "tpl-contr", lead_id: "lead-001" }, ctx("advogado"), DRAFT_TOOLS);
    expect(contrato.ok && (contrato.result as { rascunho_id?: string }).rascunho_id).toBeTruthy();
  });

  it("cliente citado usa o lead vinculado", async () => {
    const out = await executeTool("preparar_modelo", { template_id: "tpl-proc", client_id: "client-001" }, ctx("admin"), DRAFT_TOOLS);
    const r = (out as { result: { dados: Record<string, unknown> } }).result;
    expect(r.dados.lead_id).toBe("lead-008");
  });

  it("modelo inexistente aponta a tela Templates", async () => {
    const out = await executeTool("preparar_modelo", { template_id: "nao-existe", lead_id: "lead-001" }, ctx("admin"), DRAFT_TOOLS);
    expect(out.ok && (out.result as { erro?: string }).erro).toMatch(/\/templates/);
  });

  it("confirmar no modo demonstração não gera nada e aponta a ficha", async () => {
    const out = await executeTool("preparar_modelo", { template_id: "tpl-proc", lead_id: "lead-001" }, ctx("admin"), DRAFT_TOOLS);
    const id = (out as { result: { rascunho_id: string } }).result.rascunho_id;
    const saved = await getDraft("demo-admin", id);
    const session = { user: user("admin"), isAdmin: true };
    const r = await confirmDraft(session, id, saved!.data);
    expect(r).toMatchObject({ ok: true, link: "/leads/lead-001" });
  });

  it("atendente não confirma rascunho de modelo", async () => {
    const out = await executeTool("preparar_modelo", { template_id: "tpl-proc", lead_id: "lead-001" }, ctx("admin"), DRAFT_TOOLS);
    const id = (out as { result: { rascunho_id: string } }).result.rascunho_id;
    // Mesmo id de usuário, papel rebaixado depois de preparar.
    const r = await confirmDraft({ user: { ...user("atendente"), id: "demo-admin" }, isAdmin: false }, id, {
      template_id: "tpl-proc",
      lead_id: "lead-001",
    });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe("modelos pelo WhatsApp", () => {
  it("preparar_modelo só para Advogado(a) e Admin", () => {
    expect(getWhatsappTools({ role: "advogado" }).map((t) => t.name)).toContain("preparar_modelo");
    expect(getWhatsappTools({ role: "admin" }).map((t) => t.name)).toContain("preparar_modelo");
    expect(getWhatsappTools({ role: "atendente" }).map((t) => t.name)).not.toContain("preparar_modelo");
    expect(getWhatsappTools({ role: "financeiro" }).map((t) => t.name)).not.toContain("preparar_modelo");
    expect(getWhatsappTools({ role: "atendente" }).map((t) => t.name)).toContain("preparar_tarefa");
  });

  it("contrato não é preparado pelo WhatsApp, nem para Admin", async () => {
    const out = await executeTool("preparar_modelo", { template_id: "tpl-contr", lead_id: "lead-001" }, ctx("admin", "whatsapp"), DRAFT_TOOLS);
    expect(out.ok && (out.result as { erro?: string }).erro).toMatch(/WhatsApp/);
    const ok = await executeTool("preparar_modelo", { template_id: "tpl-proc", lead_id: "lead-001" }, ctx("advogado", "whatsapp"), DRAFT_TOOLS);
    expect(ok.ok && (ok.result as { rascunho_id?: string }).rascunho_id).toBeTruthy();
  });

  it("resumo do rascunho mostra modelo, pessoa, automáticos e campos a preencher", async () => {
    const out = await executeTool(
      "preparar_modelo",
      { template_id: "tpl-proc", lead_id: "lead-001", campos: { cpf: "123" } },
      ctx("advogado", "whatsapp"),
      DRAFT_TOOLS
    );
    const id = (out as { result: { rascunho_id: string } }).result.rascunho_id;
    const { toView } = await import("@/lib/assistant/drafts");
    const view = toView((await getDraft("demo-advogado", id))!);
    const text = buildDraftFooter([view], "https://crm.exemplo");
    expect(text).toContain("Gerar documento do modelo");
    expect(text).toContain("Modelo: Procuração ad judicia");
    expect(text).toContain("Para quem (lead): Maria Souza");
    expect(text).toContain("cliente.nome: Maria Souza");
    expect(text).toContain("cpf: 123");
    expect(text).toMatch(/estado_civil: \(vazio\) _\(conferir\)_/);
    expect(text).toContain("*OK*");
  });
});
