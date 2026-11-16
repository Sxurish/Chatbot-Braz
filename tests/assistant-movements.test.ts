import { describe, expect, it } from "vitest";
import { buildInsertPlan, DRAFT_DEFS, pickDraftFields, validateDraft } from "@/lib/assistant/draft-schema";
import { findMovementDuplicates, findProcessDuplicates } from "@/lib/assistant/duplicates";
import { normalizeDraftInput, DRAFT_TOOLS } from "@/lib/assistant/draft-tools";
import { executeTool, findProcessesByRef, type ToolContext } from "@/lib/assistant/tools";
import { describePage } from "@/lib/assistant/prompt";
import { isSafeInternalHref } from "@/components/assistant/markdown";
import type { Process, ProcessMovement, TeamUser } from "@/lib/types";

const user: TeamUser = {
  id: "demo-u1",
  name: "Atendente Teste",
  email: "atendente@teste.dev",
  role: "atendente",
  active: true,
  last_login: null,
  created_at: "2026-01-01T00:00:00Z",
};
const ctx: ToolContext = { user, isAdmin: false, now: new Date("2026-11-16T12:00:00-03:00") };

type Andamento = { data: string; descricao: string; origem: string; travado: boolean };

describe("andamentos_do_processo (modo demonstração)", () => {
  it("acha pelo número CNJ sem pontuação e traz do mais recente ao mais antigo", async () => {
    const out = await executeTool("andamentos_do_processo", { processo: "10023456720268260554" }, ctx);
    expect(out.ok).toBe(true);
    const r = (out as { result: Record<string, unknown> }).result as {
      encontrado: boolean;
      link: string;
      total: number;
      andamentos: Andamento[];
      ultima_busca_datajud: string;
      aviso_sync: string | null;
    };
    expect(r.encontrado).toBe(true);
    expect(r.link).toBe("/processos/proc-001");
    expect(r.total).toBe(6);
    expect(r.andamentos[0]).toMatchObject({
      data: "14/11/2026",
      origem: "tribunal",
      travado: false,
    });
    expect(r.andamentos[0].descricao).toMatch(/audiência de conciliação/);
    const manual = r.andamentos.find((a) => a.origem === "equipe");
    expect(manual).toMatchObject({ data: "06/06/2026", travado: true });
    expect(r.ultima_busca_datajud).toBe("16/11/2026 06:05");
    expect(r.aviso_sync).toBeNull();
  });

  it("aceita o id, com pontuação e respeita o limite", async () => {
    const byId = await executeTool("andamentos_do_processo", { processo: "proc-001", limite: 2 }, ctx);
    const r = (byId as { result: { mostrando: number; andamentos: unknown[] } }).result;
    expect(r.mostrando).toBe(2);
    expect(r.andamentos).toHaveLength(2);
    const pontuado = await executeTool("andamentos_do_processo", { processo: "1002345-67.2026.8.26.0554" }, ctx);
    expect((pontuado as { result: { encontrado: boolean } }).result.encontrado).toBe(true);
  });

  it("limite máximo é 50 e processo inexistente avisa", async () => {
    expect((await executeTool("andamentos_do_processo", { processo: "proc-001", limite: 51 }, ctx)).ok).toBe(false);
    const out = await executeTool("andamentos_do_processo", { processo: "9999999-99.2026.8.26.0001" }, ctx);
    expect((out as { result: { encontrado: boolean } }).result.encontrado).toBe(false);
  });

  it("acha processo por id ou número, mesmo parcial", () => {
    const ps = [
      { id: "p1", process_number: "1002345-67.2026.8.26.0554" },
      { id: "p2", process_number: "1002345-99.2025.8.26.0100" },
    ] as Process[];
    expect(findProcessesByRef(ps, "p2").map((p) => p.id)).toEqual(["p2"]);
    expect(findProcessesByRef(ps, "10023456720268260554").map((p) => p.id)).toEqual(["p1"]);
    expect(findProcessesByRef(ps, "1002345")).toHaveLength(2);
    expect(findProcessesByRef(ps, "123")).toHaveLength(0);
  });
});

describe("andamentos_recentes (modo demonstração)", () => {
  it("agrupa os andamentos dos últimos 7 dias por processo, com link", async () => {
    const out = await executeTool("andamentos_recentes", {}, ctx);
    expect(out.ok).toBe(true);
    const r = (out as { result: { total_andamentos: number; processos: { numero: string; link: string; andamentos: Andamento[] }[] } }).result;
    expect(r.total_andamentos).toBe(2);
    expect(r.processos).toHaveLength(1);
    expect(r.processos[0]).toMatchObject({ numero: "1002345-67.2026.8.26.0554", link: "/processos/proc-001" });
    expect(r.processos[0].andamentos.map((a) => a.data)).toEqual(["14/11/2026", "12/11/2026"]);
  });

  it("filtra pelo nome do cliente (processo → caso → cliente)", async () => {
    const roberto = await executeTool("andamentos_recentes", { cliente: "Roberto Carlos", dias: 30 }, ctx);
    expect((roberto as { result: { total_andamentos: number } }).result.total_andamentos).toBe(2);
    const paulo = await executeTool("andamentos_recentes", { cliente: "Paulo Tavares" }, ctx);
    expect((paulo as { result: { encontrado: boolean } }).result.encontrado).toBe(false);
  });

  it("período sem andamento lista os processos sem novidade", async () => {
    const out = await executeTool(
      "andamentos_recentes",
      { cliente: "Roberto", dias: 1 },
      { ...ctx, now: new Date("2026-11-30T12:00:00-03:00") }
    );
    const r = (out as { result: { total_andamentos: number; processos_sem_andamento_no_periodo: { link: string }[] } }).result;
    expect(r.total_andamentos).toBe(0);
    expect(r.processos_sem_andamento_no_periodo[0].link).toBe("/processos/proc-001");
  });

  it("aceita no máximo 60 dias", async () => {
    expect((await executeTool("andamentos_recentes", { dias: 61 }, ctx)).ok).toBe(false);
  });
});

describe("rascunho de andamento", () => {
  it("aparece como preparar_andamento com os campos obrigatórios", () => {
    expect(DRAFT_TOOLS.map((t) => t.name)).toContain("preparar_andamento");
    expect(DRAFT_DEFS.andamento.fields.filter((f) => f.required).map((f) => f.key)).toEqual([
      "process_id",
      "occurred_at",
      "description",
    ]);
  });

  it("valida processo, data e descrição", () => {
    expect(validateDraft("andamento", { occurred_at: "2026-11-10", description: "Réplica protocolada" }).ok).toBe(false);
    const semData = validateDraft("andamento", { process_id: "proc-001", description: "Réplica protocolada" });
    expect(semData.ok).toBe(false);
    if (!semData.ok) expect(semData.field).toBe("occurred_at");
    expect(
      validateDraft("andamento", { process_id: "proc-001", occurred_at: "2026-02-30", description: "Réplica" }).ok
    ).toBe(false);
    expect(
      validateDraft("andamento", { process_id: "proc-001", occurred_at: "2999-01-01", description: "Réplica" }).ok
    ).toBe(false);
    const longo = validateDraft("andamento", {
      process_id: "proc-001",
      occurred_at: "2026-11-10",
      description: "x".repeat(2001),
    });
    expect(longo.ok).toBe(false);
  });

  it("vira linha manual em process_movements no horário de Brasília", () => {
    const v = validateDraft("andamento", {
      process_id: "proc-001",
      occurred_at: "2026-11-10",
      description: "  Protocolada a réplica.  ",
    });
    if (!v.ok) throw new Error(v.error);
    const plan = buildInsertPlan("andamento", v.data);
    expect(plan.table).toBe("process_movements");
    expect(plan.row).toEqual({
      process_id: "proc-001",
      occurred_at: "2026-11-10T15:00:00.000Z",
      description: "Protocolada a réplica.",
      source: "manual",
    });
    expect(plan.link).toBe("/processos/proc-001");
    expect(plan.attach).toBeUndefined();

    const comHora = validateDraft("andamento", {
      process_id: "proc-001",
      occurred_at: "2026-11-10T09:30",
      description: "Audiência realizada",
    });
    if (!comHora.ok) throw new Error(comHora.error);
    expect(buildInsertPlan("andamento", comHora.data).row.occurred_at).toBe("2026-11-10T12:30:00.000Z");
  });

  it("só os campos do andamento seguem do navegador (nada de source ou locked)", () => {
    const picked = pickDraftFields("andamento", {
      process_id: "proc-001",
      process_id_label: "1002345-67.2026.8.26.0554",
      occurred_at: "2026-11-10",
      description: "Réplica",
      source: "datajud",
      locked: false,
    });
    expect(Object.keys(picked).sort()).toEqual(["description", "occurred_at", "process_id", "process_id_label"]);
  });

  it("normaliza o que a IA mandou, sem anexar o arquivo ao andamento", async () => {
    const resolve = async (_e: string, id: string) => (id === "proc-001" ? "1002345-67.2026.8.26.0554" : null);
    const { data, uncertain } = await normalizeDraftInput(
      "andamento",
      { process_id: "proc-001", occurred_at: "10/11/2026", description: "Intimação para réplica" },
      { id: "att-1", name: "intimacao.pdf" },
      resolve
    );
    expect(data).toEqual({
      process_id: "proc-001",
      process_id_label: "1002345-67.2026.8.26.0554",
      description: "Intimação para réplica",
    });
    expect(uncertain).toEqual(["occurred_at"]);

    const inventado = await normalizeDraftInput(
      "andamento",
      { process_id: "proc-inventado", occurred_at: "2026-11-10T14:00", description: "Réplica" },
      null,
      resolve
    );
    expect(inventado.data.process_id).toBeUndefined();
    expect(inventado.data.occurred_at).toBe("2026-11-10T14:00");
    expect(inventado.uncertain).toEqual(["process_id"]);
  });

  it("prepara o rascunho e avisa andamento igual no mesmo dia", async () => {
    const out = await executeTool(
      "preparar_andamento",
      { process_id: "proc-001", occurred_at: "2026-11-14", description: "Designada audiência de conciliação" },
      { ...ctx, canWrite: true, conversationId: "conv-mov" },
      DRAFT_TOOLS
    );
    expect(out.ok).toBe(true);
    const r = (out as { result: { tipo: string; duplicados: { link: string; reason: string }[] } }).result;
    expect(r.tipo).toBe("Registrar andamento");
    expect(r.duplicados).toHaveLength(1);
    expect(r.duplicados[0]).toMatchObject({ link: "/processos/proc-001", reason: "Andamento do tribunal no mesmo dia" });
  });
});

describe("duplicados de andamento", () => {
  const base = { process_id: "p1", source: "manual", occurred_at: "2026-11-10T15:00:00.000Z" } as ProcessMovement;
  const movements = [
    { ...base, description: "Protocolada a réplica." },
    // 23h30 de 10/11 em São Paulo (já é dia 11 em UTC).
    { ...base, occurred_at: "2026-11-11T02:30:00.000Z", description: "Juntada de petição" },
  ];

  it("compara o dia em São Paulo e o texto sem acentos e pontuação", () => {
    expect(findMovementDuplicates({ process_id: "p1", occurred_at: "2026-11-10", description: "protocolada a REPLICA" }, movements)).toHaveLength(1);
    expect(findMovementDuplicates({ process_id: "p1", occurred_at: "2026-11-10T20:00", description: "Juntada de petição (réplica)" }, movements)).toHaveLength(1);
    expect(findMovementDuplicates({ process_id: "p1", occurred_at: "2026-11-11", description: "Protocolada a réplica" }, movements)).toHaveLength(0);
    expect(findMovementDuplicates({ process_id: "p2", occurred_at: "2026-11-10", description: "Protocolada a réplica" }, movements)).toHaveLength(0);
    expect(findMovementDuplicates({ process_id: "p1", occurred_at: "2026-11-10", description: "Audiência realizada" }, movements)).toHaveLength(0);
  });
});

describe("links para a página do processo", () => {
  it("buscar_processos e listar_prazos levam a /processos/{id}", async () => {
    const busca = await executeTool("buscar_processos", { numero: "1002345" }, ctx);
    const itens = (busca as { result: { itens: { link: string }[] } }).result.itens;
    expect(itens[0].link).toBe("/processos/proc-001");
    const prazos = await executeTool("listar_prazos", { dias: 7 }, { ...ctx, now: new Date("2026-06-08T12:00:00-03:00") });
    const proc = (prazos as { result: { itens: { tipo: string; link: string }[] } }).result.itens.find(
      (i) => i.tipo === "prazo de processo"
    );
    expect(proc?.link).toBe("/processos/proc-001");
  });

  it("duplicado de processo e processo novo apontam para a página do processo", () => {
    const dup = findProcessDuplicates("10023456720268260554", [
      { id: "p1", process_number: "1002345-67.2026.8.26.0554" } as Process,
    ]);
    expect(dup[0].link).toBe("/processos/p1");
    const v = validateDraft("processo", { new_case_title: "Cobrança" });
    if (!v.ok) throw new Error(v.error);
    expect(buildInsertPlan("processo", v.data).link).toBe("/processos/{id}");
  });

  it("o link é aceito nas respostas e a tela do processo é reconhecida", () => {
    expect(isSafeInternalHref("/processos/proc-001")).toBe(true);
    expect(isSafeInternalHref("/processos/3f1c2a9e-0b6d-4c1e-9a7f-2d5e8b4c6a10")).toBe(true);
    expect(describePage("/processos/proc-001")).toContain('processo de id "proc-001"');
  });
});
