import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftRow } from "@/lib/assistant/drafts";
import type { TeamUser, UserRole } from "@/lib/types";

// Supabase "ligado", com rascunhos, banco e geração falsos: confere que o
// Confirmar chama a mesma função de geração do botão da ficha do lead.
const env = vi.hoisted(() => ({
  drafts: new Map<string, DraftRow>(),
  audit: [] as Record<string, unknown>[],
  generateCalls: [] as Record<string, unknown>[],
  generateResult: null as unknown,
  writer: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, hasServiceRole: () => false }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table === "audit_logs") env.audit.push(row);
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/assistant/drafts", () => ({
  getDraft: async (userId: string, id: string) => {
    const d = env.drafts.get(id);
    return d && d.user_id === userId ? d : null;
  },
  claimDraft: async (userId: string, id: string, data: DraftRow["data"]) => {
    const d = env.drafts.get(id);
    if (!d || d.user_id !== userId || d.status !== "pendente") return false;
    d.status = "confirmando";
    d.data = data;
    return true;
  },
  finishDraft: async (userId: string, id: string, r: { status: DraftRow["status"]; link?: string }) => {
    const d = env.drafts.get(id);
    if (d && d.user_id === userId) {
      d.status = r.status;
      d.result_link = r.link ?? null;
    }
  },
  discardDraft: async () => true,
}));
vi.mock("@/lib/assistant/attachments", () => ({ getAttachment: async () => null }));
vi.mock("@/lib/data/templates-generate", () => ({
  TEMPLATE_DEMO_NOTICE: "demo",
  generateDocumentFromTemplate: vi.fn(async (input: Record<string, unknown>) => {
    env.generateCalls.push(input);
    return env.generateResult;
  }),
}));
vi.mock("@/lib/auth/require-admin", () => ({
  requireWriterAction: async () => env.writer,
  requireAdminAction: async () => ({ ok: false, error: "não" }),
}));

const { confirmDraft } = await import("@/lib/assistant/confirm-draft");
const { generateDocumentAction } = await import("@/lib/data/templates-actions");

function user(role: UserRole): TeamUser {
  return { id: `u-${role}`, name: role, email: `${role}@ex.com`, role, active: true, last_login: null, created_at: "" };
}

const LEAD_ID = "11111111-2222-4333-8444-555555555555";
const TPL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function seed(id: string, owner: TeamUser) {
  env.drafts.set(id, {
    id,
    user_id: owner.id,
    conversation_id: "conv",
    kind: "modelo",
    data: {
      template_id: TPL_ID,
      template_id_label: "Procuração",
      lead_id: LEAD_ID,
      lead_id_label: "Maria",
      "auto.cliente.nome": "Maria",
      "campo.cpf": "123",
      "campo.estado_civil": "",
    },
    uncertain: ["campo.estado_civil"],
    duplicates: [],
    attachment_id: null,
    attachment_name: null,
    status: "pendente",
    result_link: null,
  });
}

beforeEach(() => {
  env.drafts.clear();
  env.audit.length = 0;
  env.generateCalls.length = 0;
  env.generateResult = {
    ok: true,
    documentId: "doc-1",
    fileName: "Procuracao_1.docx",
    url: "https://storage.exemplo/assinado",
    link: `/leads/${LEAD_ID}`,
  };
});

describe("Confirmar rascunho de modelo", () => {
  it("gera pelo mesmo caminho do botão, com os campos editados no cartão", async () => {
    const adv = user("advogado");
    seed("d1", adv);
    const r = await confirmDraft({ user: adv, isAdmin: false }, "d1", {
      ...env.drafts.get("d1")!.data,
      "campo.estado_civil": "casada",
      "auto.cliente.nome": "valor forjado no navegador",
    });
    expect(r).toMatchObject({ ok: true, link: `/leads/${LEAD_ID}`, downloadUrl: "https://storage.exemplo/assinado" });
    expect(env.generateCalls).toHaveLength(1);
    expect(env.generateCalls[0]).toMatchObject({
      templateId: TPL_ID,
      leadId: LEAD_ID,
      // Automáticos nunca vêm do navegador: a geração refaz a partir do banco.
      overrides: { cpf: "123", estado_civil: "casada" },
      user: { id: adv.id, role: "advogado" },
      channel: "painel",
    });
    expect(env.drafts.get("d1")!.status).toBe("confirmado");
    expect(env.audit).toContainEqual(
      expect.objectContaining({ action: "assistant_confirm", entity_type: "documents", entity_id: "doc-1" })
    );
    // Segundo clique não gera de novo.
    const again = await confirmDraft({ user: adv, isAdmin: false }, "d1", {});
    expect(again.ok).toBe(false);
    expect(env.generateCalls).toHaveLength(1);
  });

  it("pelo WhatsApp passa o canal e não devolve link de download", async () => {
    const admin = user("admin");
    seed("d2", admin);
    const r = await confirmDraft({ user: admin, isAdmin: true }, "d2", env.drafts.get("d2")!.data, { channel: "whatsapp" });
    expect(r.ok).toBe(true);
    expect(r).not.toHaveProperty("downloadUrl");
    expect(env.generateCalls[0]).toMatchObject({ channel: "whatsapp" });
  });

  it("falha na geração (ex.: contrato pelo WhatsApp) devolve o rascunho para pendente", async () => {
    const admin = user("admin");
    seed("d3", admin);
    env.generateResult = { ok: false, error: "Contratos e honorários não são gerados pelo WhatsApp." };
    const r = await confirmDraft({ user: admin, isAdmin: true }, "d3", env.drafts.get("d3")!.data, { channel: "whatsapp" });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/WhatsApp/) });
    expect(env.drafts.get("d3")!.status).toBe("pendente");
  });

  it("atendente e financeiro não geram (nem chegam na geração)", async () => {
    for (const role of ["atendente", "financeiro"] as const) {
      const u = user(role);
      seed(`d-${role}`, u);
      const r = await confirmDraft({ user: u, isAdmin: false }, `d-${role}`, env.drafts.get(`d-${role}`)!.data);
      expect(r).toMatchObject({ ok: false, status: 403 });
    }
    expect(env.generateCalls).toHaveLength(0);
  });
});

describe("botão Gerar documento da ficha do lead", () => {
  function form(extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("template_id", TPL_ID);
    fd.set("lead_id", LEAD_ID);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  it("atendente é recusado no servidor", async () => {
    env.writer = { ok: true, user: user("atendente") };
    const r = await generateDocumentAction({}, form());
    expect(r.error).toMatch(/Advogado\(a\) e Admin/);
    expect(env.generateCalls).toHaveLength(0);
  });

  it("advogado gera com os campos manuais pela função compartilhada", async () => {
    env.writer = { ok: true, user: user("advogado") };
    const r = await generateDocumentAction({}, form({ override_cpf: "123", override_vazio: "  " }));
    expect(r).toEqual({ ok: true, url: "https://storage.exemplo/assinado", documentId: "doc-1" });
    expect(env.generateCalls[0]).toMatchObject({
      templateId: TPL_ID,
      leadId: LEAD_ID,
      overrides: { cpf: "123" },
      user: { id: "u-advogado", role: "advogado" },
      channel: "painel",
    });
  });
});
