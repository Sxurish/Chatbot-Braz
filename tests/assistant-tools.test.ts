import { describe, expect, it } from "vitest";
import { executeTool, getToolsFor, toApiTools, type ToolContext } from "@/lib/assistant/tools";
import type { TeamUser } from "@/lib/types";

const base: TeamUser = {
  id: "u2",
  name: "Atendente Teste",
  email: "atendente@teste.dev",
  role: "atendente",
  active: true,
  last_login: null,
  created_at: "2026-01-01T00:00:00Z",
};
const now = new Date("2026-05-30T12:00:00-03:00");
const atendente: ToolContext = { user: base, isAdmin: false, now };
const admin: ToolContext = { user: { ...base, id: "u1", role: "admin" }, isAdmin: true, now };

const FINANCE = ["resumo_financeiro", "buscar_pagamentos", "buscar_contratos"];

describe("permissões das ferramentas", () => {
  it("não oferece ferramentas financeiras a quem não é Admin", () => {
    const names = getToolsFor(false).map((t) => t.name);
    for (const f of FINANCE) expect(names).not.toContain(f);
    expect(names).toContain("buscar_leads");
  });

  it("oferece as ferramentas financeiras ao Admin", () => {
    const names = getToolsFor(true).map((t) => t.name);
    for (const f of FINANCE) expect(names).toContain(f);
  });

  it.each(FINANCE)("nega %s para atendente mesmo se chamada direto", async (name) => {
    const out = await executeTool(name, {}, atendente);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/Acesso negado/);
  });

  it("Admin recebe o resumo financeiro", async () => {
    const out = await executeTool("resumo_financeiro", {}, admin);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result).toMatchObject({ link: "/financeiro", moeda: "BRL" });
  });

  it("esconde a situação financeira do lead para quem não é Admin", async () => {
    const forAtendente = await executeTool("ver_lead", { lead_id: "lead-002" }, atendente);
    const forAdmin = await executeTool("ver_lead", { lead_id: "lead-002" }, admin);
    expect(forAtendente.ok && forAdmin.ok).toBe(true);
    if (forAtendente.ok) expect(forAtendente.result).not.toHaveProperty("status_financeiro");
    if (forAdmin.ok) expect(forAdmin.result).toHaveProperty("status_financeiro");
  });

  it("recusa ferramenta desconhecida e parâmetros inválidos", async () => {
    expect((await executeTool("apagar_tudo", {}, admin)).ok).toBe(false);
    const bad = await executeTool("buscar_leads", { limite: 999 }, admin);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/Parâmetros inválidos/);
  });
});

describe("consultas", () => {
  it("busca lead por nome sem acento e devolve o link da ficha", async () => {
    const out = await executeTool("buscar_leads", { texto: "fernanda" }, atendente);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const result = out.result as { total: number; itens: { nome: string; link: string }[] };
    expect(result.total).toBe(1);
    expect(result.itens[0]).toMatchObject({ nome: "Fernanda Lima", link: "/leads/lead-002" });
  });

  it("filtra leads urgentes dos últimos dias", async () => {
    const out = await executeTool("buscar_leads", { urgencia: "alta", ultimos_dias: 7 }, atendente);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const result = out.result as { itens: { urgencia: string; criado_em: string }[] };
    expect(result.itens.length).toBeGreaterThan(0);
    for (const l of result.itens) {
      expect(l.urgencia).toBe("Alta");
      expect(l.criado_em >= "2026-05-23").toBe(true);
    }
  });

  it("acha processo pelo número sem pontuação", async () => {
    const out = await executeTool("buscar_processos", { numero: "10023456720268260554" }, atendente);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const result = out.result as { total: number; itens: { numero: string; cliente: string | null }[] };
    expect(result.total).toBe(1);
    expect(result.itens[0].numero).toBe("1002345-67.2026.8.26.0554");
  });

  it("lista prazos em ordem de data dentro da janela", async () => {
    const out = await executeTool("listar_prazos", { dias: 15 }, atendente);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const result = out.result as { hoje: string; ate: string; itens: { data: string; tipo: string }[] };
    expect(result.hoje).toBe("2026-05-30");
    expect(result.ate).toBe("2026-06-14");
    const dates = result.itens.map((i) => i.data);
    expect(dates).toEqual([...dates].sort());
    expect(result.itens.some((i) => i.tipo === "prazo de processo")).toBe(true);
    expect(dates.every((d) => d <= "2026-06-14")).toBe(true);
  });

  it("'minhas tarefas' usa o id de quem pergunta", async () => {
    const out = await executeTool("listar_tarefas", { somente_minhas: true }, atendente);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const result = out.result as { itens: { responsavel: string | null }[] };
    expect(result.itens.length).toBeGreaterThan(0);
  });

  it("gera esquemas válidos para a API", () => {
    for (const tool of toApiTools(getToolsFor(true))) {
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema).not.toHaveProperty("$schema");
      // parâmetros com valor padrão não são obrigatórios
      expect((tool.input_schema.required as string[] | undefined) ?? []).not.toContain("limite");
    }
  });
});
