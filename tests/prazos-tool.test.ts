import { describe, expect, it } from "vitest";
import { executeTool, getToolsFor, toApiTools, type ToolContext } from "@/lib/assistant/tools";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import type { TeamUser } from "@/lib/types";

const viewer: TeamUser = {
  id: "u9",
  name: "Visualizador Teste",
  email: "vis@teste.dev",
  role: "visualizador",
  active: true,
  last_login: null,
  created_at: "2026-01-01T00:00:00Z",
};
const ctx: ToolContext = { user: viewer, isAdmin: false, now: new Date("2026-11-17T12:00:00-03:00"), canWrite: false };

describe("ferramenta calcular_prazo", () => {
  it("é oferecida a todos (só leitura) e tem esquema válido", () => {
    const tools = getToolsFor(false);
    const tool = tools.find((t) => t.name === "calcular_prazo");
    expect(tool).toBeDefined();
    expect(tool?.writeOnly).toBeFalsy();
    const api = toApiTools([tool!])[0];
    expect(api.input_schema.required).toEqual(expect.arrayContaining(["inicio", "data", "dias"]));
  });

  it("responde 'quando vence 15 dias úteis da intimação disponibilizada em 16/11?'", async () => {
    // 16/11/2026 (seg) disponibilizada → publicada 17/11 → começa 18/11; 20/11 é feriado → vence 09/12/2026.
    const out = await executeTool("calcular_prazo", { inicio: "disponibilizacao", data: "2026-11-16", dias: 15 }, ctx);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.result as Record<string, unknown>;
    expect(r.data_final).toBe("09/12/2026");
    expect(r.publicacao).toBe("17/11/2026");
    expect(r.inicio_da_contagem).toBe("18/11/2026");
    expect((r.dias_pulados as string[]).some((d) => d.startsWith("20/11/2026") && d.includes("Lei 14.759/2023"))).toBe(true);
    expect(r.aviso).toMatch(/incerta/);
    expect(r.link).toBe("/prazos");
  });

  it("usa os dias do calendário (modo demonstração: Carnaval de 2027)", async () => {
    // Intimação sex 05/02/2027 → [06-07 fds, 08-09 Carnaval] começa qua 10/02(1) 11(2) 12(3).
    const out = await executeTool("calcular_prazo", { inicio: "intimacao", data: "2027-02-05", dias: 3 }, ctx);
    expect(out.ok).toBe(true);
    if (out.ok) expect((out.result as { data_final: string }).data_final).toBe("12/02/2027");
  });

  it("recusa data inválida", async () => {
    const out = await executeTool("calcular_prazo", { inicio: "intimacao", data: "2026-02-30", dias: 3 }, ctx);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result).toEqual({ erro: "Data inválida." });
    const bad = await executeTool("calcular_prazo", { inicio: "intimacao", data: "16/11/2026", dias: 3 }, ctx);
    expect(bad.ok).toBe(false);
  });

  it("a regra 7 manda usar calcular_prazo e marcar a data como incerta", () => {
    const text = buildSystemPrompt(viewer, false, new Date())[0].text;
    expect(text).toContain("use calcular_prazo");
    expect(text).toContain('marcada em "incertos"');
  });
});
