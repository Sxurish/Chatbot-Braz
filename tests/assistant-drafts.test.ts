import { describe, expect, it } from "vitest";
import {
  buildInsertPlan,
  cnjDigits,
  formatCnj,
  pickDraftFields,
  toSaoPauloIso,
  validateDraft,
} from "@/lib/assistant/draft-schema";
import {
  findAppointmentConflicts,
  findPersonDuplicates,
  findProcessDuplicates,
} from "@/lib/assistant/duplicates";
import { checkAttachment, detectMime } from "@/lib/assistant/attachment-rules";
import { normalizeDraftInput } from "@/lib/assistant/draft-tools";
import { computeCostUsd } from "@/lib/assistant/cost";
import type { Appointment, Client, Lead, Process } from "@/lib/types";

describe("datas e número CNJ", () => {
  it("formata o número CNJ a partir dos dígitos", () => {
    expect(formatCnj("10023456720268260554")).toBe("1002345-67.2026.8.26.0554");
    expect(formatCnj("1002345-67.2026.8.26.0554")).toBe("1002345-67.2026.8.26.0554");
    expect(cnjDigits("1002345-67.2026.8.26.0554")).toHaveLength(20);
  });

  it("converte datas no horário de Brasília", () => {
    expect(toSaoPauloIso("2026-11-20", true)).toBe("2026-11-21T02:59:00.000Z");
    expect(toSaoPauloIso("2026-11-20T14:30")).toBe("2026-11-20T17:30:00.000Z");
  });
});

describe("validação no Confirmar", () => {
  it("processo precisa de caso existente ou título de caso novo", () => {
    const sem = validateDraft("processo", { process_number: "1002345-67.2026.8.26.0554" });
    expect(sem.ok).toBe(false);
    if (!sem.ok) expect(sem.field).toBe("case_id");
    expect(validateDraft("processo", { new_case_title: "Ação de cobrança" }).ok).toBe(true);
  });

  it("recusa número CNJ incompleto e data inválida", () => {
    const cnj = validateDraft("processo", { case_id: "case-001", process_number: "12345" });
    expect(cnj.ok).toBe(false);
    const data = validateDraft("prazo", { title: "Contestação", due_date: "2026-02-30" });
    expect(data.ok).toBe(false);
  });

  it("lead precisa de nome e de telefone ou e-mail", () => {
    expect(validateDraft("lead", { full_name: "Ana" }).ok).toBe(false);
    expect(validateDraft("lead", { full_name: "Ana Souza", phone: "11 98888-7777" }).ok).toBe(true);
    expect(validateDraft("lead", { full_name: "Ana Souza", email: "nao-e-email" }).ok).toBe(false);
  });

  it("compromisso exige data e horário válidos e link https", () => {
    expect(validateDraft("compromisso", { title: "Audiência", date: "2026-12-01", start_time: "14:00" }).ok).toBe(true);
    expect(validateDraft("compromisso", { title: "Audiência", date: "2026-12-01", start_time: "2pm" }).ok).toBe(false);
    expect(
      validateDraft("compromisso", {
        title: "Reunião",
        date: "2026-12-01",
        start_time: "10:00",
        meeting_link: "javascript:alert(1)",
      }).ok
    ).toBe(false);
  });

  it("documento precisa dizer onde anexar", () => {
    expect(validateDraft("documento", { file_name: "a.pdf", attach_category: "intimacao" }).ok).toBe(false);
    expect(
      validateDraft("documento", { file_name: "a.pdf", attach_category: "intimacao", process_id: "proc-001" }).ok
    ).toBe(true);
  });

  it("só aceita os campos conhecidos vindos do navegador", () => {
    const picked = pickDraftFields("tarefa", {
      title: "Ligar",
      status: "concluida",
      user_id: "outra-pessoa",
      lead_id: "lead-1",
      lead_id_label: "Maria",
    });
    expect(picked).toEqual({ title: "Ligar", lead_id: "lead-1", lead_id_label: "Maria" });
  });
});

describe("rascunho → linhas do banco", () => {
  it("processo com caso novo cria o caso e formata o número", () => {
    const v = validateDraft("processo", {
      new_case_title: "Cobrança — Carlos",
      process_number: "10023456720268260554",
      next_deadline: "2026-12-10",
      attach_file: true,
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const plan = buildInsertPlan("processo", v.data);
    expect(plan.newCase).toMatchObject({ title: "Cobrança — Carlos", legal_area: "nao_confirmada" });
    expect(plan.row).toMatchObject({ case_id: null, process_number: "1002345-67.2026.8.26.0554", status: "em_andamento" });
    expect(plan.attach?.category).toBe("processo");
  });

  it("prazo vira tarefa de prioridade alta e atualiza o processo quando marcado", () => {
    const v = validateDraft("prazo", {
      title: "Contestação",
      due_date: "2026-12-05",
      process_id: "proc-001",
      update_process_deadline: true,
    });
    if (!v.ok) throw new Error(v.error);
    const plan = buildInsertPlan("prazo", v.data);
    expect(plan.table).toBe("tasks");
    expect(plan.row).toMatchObject({ title: "Prazo: Contestação", priority: "alta", process_id: "proc-001" });
    expect(plan.processDeadline).toEqual({ processId: "proc-001", deadline: "2026-12-06T02:59:00.000Z" });
  });

  it("lead novo nunca nasce com consentimento marcado", () => {
    const v = validateDraft("lead", { full_name: "Ana Souza", email: "ANA@EX.COM", state: "sp" });
    if (!v.ok) throw new Error(v.error);
    const plan = buildInsertPlan("lead", v.data);
    expect(plan.row).toMatchObject({ email: "ana@ex.com", state: "SP", consent_given: false });
    expect(plan.link).toBe("/leads/{id}");
  });
});

describe("duplicados", () => {
  const processes = [{ id: "p1", process_number: "1002345-67.2026.8.26.0554" }] as Process[];
  it("acha processo com o mesmo número, com ou sem pontuação", () => {
    expect(findProcessDuplicates("10023456720268260554", processes)).toHaveLength(1);
    expect(findProcessDuplicates("0000000-00.2026.8.26.0554", processes)).toHaveLength(0);
  });

  it("acha pessoa pelo telefone, e-mail ou nome", () => {
    const leads = [{ id: "l1", full_name: "José da Silva", phone: "+55 (11) 98888-7777", email: null }] as Lead[];
    const clients = [{ id: "c1", full_name: "Maria Lima", phone: null, email: "maria@ex.com" }] as Client[];
    expect(findPersonDuplicates({ phone: "11988887777" }, leads, clients)[0].reason).toBe("Mesmo telefone");
    expect(findPersonDuplicates({ email: "MARIA@ex.com" }, leads, clients)[0].label).toBe("Cliente Maria Lima");
    expect(findPersonDuplicates({ full_name: "jose da silva" }, leads, clients)[0].reason).toBe("Mesmo nome");
    expect(findPersonDuplicates({ full_name: "Outra Pessoa", phone: "1133334444" }, leads, clients)).toHaveLength(0);
  });

  it("acha compromisso no mesmo horário", () => {
    const appts = [
      { id: "a1", title: "Reunião", date: "2026-12-01", start_time: "14:00:00", end_time: "15:00:00", status: "agendada" },
      { id: "a2", title: "Cancelada", date: "2026-12-01", start_time: "14:00:00", end_time: null, status: "cancelada" },
    ] as Appointment[];
    expect(findAppointmentConflicts({ date: "2026-12-01", start_time: "14:30" }, appts)).toHaveLength(1);
    expect(findAppointmentConflicts({ date: "2026-12-01", start_time: "15:00" }, appts)).toHaveLength(0);
  });
});

describe("o que a IA manda vira rascunho conferível", () => {
  const resolve = async (_e: string, id: string) => (id === "case-001" ? "Caso do Carlos" : null);

  it("valores fora do formato e ids inexistentes viram campos incertos", async () => {
    const { data, uncertain } = await normalizeDraftInput(
      "processo",
      {
        process_number: "10023456720268260554",
        next_deadline: "10/12/2026",
        status: "Em andamento",
        case_id: "case-inventado",
        incertos: ["court", "campo_que_nao_existe"],
      },
      null,
      resolve
    );
    expect(data.process_number).toBe("1002345-67.2026.8.26.0554");
    expect(data.status).toBe("em_andamento");
    expect(data.case_id).toBeUndefined();
    expect(uncertain.sort()).toEqual(["case_id", "court", "next_deadline"]);
  });

  it("vínculo existente ganha o nome para o cartão e o anexo vem marcado", async () => {
    const { data } = await normalizeDraftInput(
      "prazo",
      { title: "Contestação", due_date: "2026-12-05" },
      { id: "att-1", name: "intimacao.pdf" },
      resolve
    );
    expect(data).toMatchObject({ priority: "alta", attach_file: true, attach_category: "intimacao" });
    const linked = await normalizeDraftInput("processo", { case_id: "case-001" }, null, resolve);
    expect(linked.data).toMatchObject({ case_id: "case-001", case_id_label: "Caso do Carlos" });
    expect(linked.data.attach_file).toBeUndefined();
  });
});

describe("anexos", () => {
  it("reconhece o tipo pelo conteúdo, não pelo nome", () => {
    expect(detectMime(new TextEncoder().encode("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(detectMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectMime(new TextEncoder().encode("<html>"))).toBeNull();
  });

  it("recusa tipos e tamanhos fora do limite", () => {
    expect(checkAttachment({ name: "a.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(checkAttachment({ name: "a.heic", type: "image/heic", size: 1000 })).toMatch(/HEIC/);
    expect(checkAttachment({ name: "a.pdf", type: "application/pdf", size: 16 * 1024 * 1024 })).toMatch(/15 MB/);
  });

  it("leitura de documento usa o preço do Sonnet", () => {
    const usage = { input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 };
    expect(computeCostUsd("claude-sonnet-5-5", usage)).toBe(3);
  });
});

describe("ferramentas de rascunho", async () => {
  const { executeTool } = await import("@/lib/assistant/tools");
  const { DRAFT_TOOLS } = await import("@/lib/assistant/draft-tools");
  const { getDraft } = await import("@/lib/assistant/drafts");
  const base = {
    user: { id: "demo-u1", name: "Teste", email: "t@ex.com", role: "atendente" as const, active: true, last_login: null, created_at: "" },
    isAdmin: false,
    now: new Date("2026-11-16T12:00:00Z"),
  };

  it("quem só visualiza não prepara rascunho", async () => {
    const out = await executeTool("preparar_tarefa", { title: "Ligar" }, { ...base, canWrite: false }, DRAFT_TOOLS);
    expect(out.ok).toBe(false);
  });

  it("prepara o rascunho, avisa a interface e não grava nada", async () => {
    const events: unknown[] = [];
    const out = await executeTool(
      "preparar_tarefa",
      { title: "Ligar para o cliente", priority: "urgente", incertos: ["due_date"] },
      { ...base, canWrite: true, conversationId: "conv-1", emit: (e) => events.push(e) },
      DRAFT_TOOLS
    );
    expect(out.ok).toBe(true);
    const result = (out as { result: { rascunho_id: string; incertos: string[] } }).result;
    expect(result.incertos.sort()).toEqual(["due_date", "priority"]);
    expect(events).toHaveLength(1);
    const saved = await getDraft("demo-u1", result.rascunho_id);
    expect(saved?.status).toBe("pendente");
    expect(await getDraft("outra-pessoa", result.rascunho_id)).toBeNull();
  });

  it("anexar documento sem arquivo devolve orientação", async () => {
    const out = await executeTool("preparar_documento", {}, { ...base, canWrite: true }, DRAFT_TOOLS);
    expect(out.ok && (out.result as { erro?: string }).erro).toMatch(/anexar/);
  });
});
