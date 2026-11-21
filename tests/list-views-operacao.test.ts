import { describe, expect, it } from "vitest";
import {
  assigneeOptions,
  dateParam,
  dayOf,
  inPeriod,
  matchesAssignee,
  NO_ASSIGNEE,
} from "@/lib/list-views/common";
import {
  filterTasks,
  isTaskOverdue,
  isTaskViewFiltered,
  parseTaskView,
  sortTasks,
} from "@/lib/list-views/tarefas";
import {
  filterFollowUps,
  isFollowUpViewFiltered,
  parseFollowUpView,
  sortFollowUps,
} from "@/lib/list-views/follow-ups";
import {
  filterNotifications,
  isNotificationViewFiltered,
  parseNotificationView,
  sortNotifications,
} from "@/lib/list-views/notificacoes";
import {
  filterTemplates,
  isTemplateViewFiltered,
  parseTemplateView,
  sortTemplates,
  templateCategoryOptions,
} from "@/lib/list-views/templates";
import {
  filterAppointments,
  isAppointmentViewFiltered,
  parseAppointmentView,
  sortAppointments,
} from "@/lib/list-views/agenda";
import type { DocumentTemplate } from "@/lib/data/templates-types";
import type { AppNotification, Appointment, FollowUp, Task } from "@/lib/types";

const names = { u1: "Ana", u2: "Bruno" };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    lead_id: null,
    client_id: null,
    case_id: null,
    process_id: null,
    title: `Tarefa ${id}`,
    description: null,
    assigned_to: null,
    due_date: null,
    priority: "media",
    status: "pendente",
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...over,
  };
}

function followUp(id: string, over: Partial<FollowUp> = {}): FollowUp {
  return {
    id,
    lead_id: null,
    client_id: null,
    title: `Retorno ${id}`,
    description: null,
    scheduled_at: "2026-03-10T15:00:00Z",
    status: "pendente",
    assigned_to: null,
    created_at: "2026-01-01T12:00:00Z",
    ...over,
  };
}

function notif(id: string, over: Partial<AppNotification> = {}): AppNotification {
  return {
    id,
    user_id: null,
    type: "novo_lead",
    title: `Aviso ${id}`,
    body: null,
    read: false,
    entity_type: null,
    entity_id: null,
    created_at: "2026-01-01T12:00:00Z",
    ...over,
  };
}

function tpl(id: string, over: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id,
    name: `Modelo ${id}`,
    description: null,
    category: "outros",
    storage_path: `${id}.docx`,
    placeholders: [],
    active: true,
    created_by: null,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...over,
  };
}

function appt(id: string, over: Partial<Appointment> = {}): Appointment {
  return {
    id,
    lead_id: null,
    client_id: null,
    assigned_to: null,
    title: `Consulta ${id}`,
    date: "2026-03-10",
    start_time: "10:00",
    end_time: null,
    modality: "online",
    meeting_link: null,
    status: "agendada",
    notes: null,
    created_at: "2026-01-01T12:00:00Z",
    ...over,
  };
}

describe("ajudantes comuns", () => {
  it("aceita só datas AAAA-MM-DD reais", () => {
    expect(dateParam({ de: "2026-02-28" }, "de")).toBe("2026-02-28");
    expect(dateParam({ de: "2026-02-30" }, "de")).toBeNull();
    expect(dateParam({ de: "28/02/2026" }, "de")).toBeNull();
    expect(dateParam({}, "de")).toBeNull();
  });

  it("converte horário ISO para o dia em São Paulo", () => {
    expect(dayOf("2026-03-11T02:00:00Z")).toBe("2026-03-10");
    expect(dayOf("2026-03-10")).toBe("2026-03-10");
    expect(dayOf(null)).toBeNull();
  });

  it("período com limites inclusivos", () => {
    expect(inPeriod("2026-03-10", "2026-03-10", "2026-03-10")).toBe(true);
    expect(inPeriod("2026-03-09", "2026-03-10", null)).toBe(false);
    expect(inPeriod(null, null, null)).toBe(true);
    expect(inPeriod(null, "2026-03-10", null)).toBe(false);
  });

  it("responsável: id, sem responsável ou nada", () => {
    expect(matchesAssignee("u1", "u1")).toBe(true);
    expect(matchesAssignee("u2", "u1")).toBe(false);
    expect(matchesAssignee(null, NO_ASSIGNEE)).toBe(true);
    expect(matchesAssignee("u1", NO_ASSIGNEE)).toBe(false);
    expect(assigneeOptions({ b: "Bruno", a: "Ana" }).map((o) => o.label)).toEqual(["Ana", "Bruno", "Sem responsável"]);
  });
});

describe("Tarefas", () => {
  it("lê a URL e ignora valores inválidos", () => {
    const v = parseTaskView(
      { q: " prazo ", status: "xx", prioridade: "alta", responsavel: "u9", atrasadas: "1", minhas: "0", ordem: "zzz" },
      names
    );
    expect(v).toEqual({
      q: "prazo",
      status: null,
      prioridade: "alta",
      responsavel: null,
      atrasadas: true,
      minhas: false,
      ordem: "prazo",
    });
    expect(parseTaskView({ responsavel: "u1", status: "em_andamento" }, names)).toMatchObject({
      responsavel: "u1",
      status: "em_andamento",
    });
    expect(isTaskViewFiltered(parseTaskView({}, names))).toBe(false);
    expect(isTaskViewFiltered(parseTaskView({ ordem: "recentes" }, names))).toBe(true);
  });

  const today = "2026-03-10";
  const tasks = [
    task("a", { title: "Protocolar petição", due_date: "2026-03-05T12:00:00Z", assigned_to: "u1", priority: "baixa" }),
    task("b", { description: "Ligar para o cliente", due_date: "2026-03-20T12:00:00Z", assigned_to: "u2", priority: "alta" }),
    task("c", { status: "concluida", due_date: "2026-03-01T12:00:00Z", assigned_to: "u1" }),
    task("d", { status: "atrasada", priority: "alta", created_at: "2026-02-01T12:00:00Z" }),
  ];

  it("atrasada: marcada assim ou aberta com prazo vencido", () => {
    expect(tasks.map((t) => isTaskOverdue(t, today))).toEqual([true, false, false, true]);
  });

  it("filtra por busca, status, prioridade, responsável, atrasadas e minhas", () => {
    const base = parseTaskView({}, names);
    const ctx = { today, userId: "u1" };
    expect(ids(filterTasks(tasks, { ...base, q: "peticao" }, ctx))).toEqual(["a"]);
    expect(ids(filterTasks(tasks, { ...base, q: "cliente" }, ctx))).toEqual(["b"]);
    expect(ids(filterTasks(tasks, { ...base, status: "concluida" }, ctx))).toEqual(["c"]);
    expect(ids(filterTasks(tasks, { ...base, prioridade: "alta" }, ctx))).toEqual(["b", "d"]);
    expect(ids(filterTasks(tasks, { ...base, responsavel: NO_ASSIGNEE }, ctx))).toEqual(["d"]);
    expect(ids(filterTasks(tasks, { ...base, atrasadas: true }, ctx))).toEqual(["a", "d"]);
    expect(ids(filterTasks(tasks, { ...base, minhas: true }, ctx))).toEqual(["a", "c"]);
    expect(ids(filterTasks(tasks, { ...base, minhas: true }, { today, userId: null }))).toEqual([]);
  });

  it("ordena por prazo (vazios no fim), prioridade e mais recentes", () => {
    expect(ids(sortTasks(tasks, "prazo"))).toEqual(["c", "a", "b", "d"]);
    expect(ids(sortTasks(tasks, "prioridade"))).toEqual(["b", "d", "c", "a"]);
    expect(ids(sortTasks(tasks, "recentes"))[0]).toBe("d");
    expect(ids(tasks)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("Follow-up", () => {
  it("lê a URL e ignora valores inválidos", () => {
    const v = parseFollowUpView({ status: "concluido", de: "2026-13-01", ate: "2026-03-31", ordem: "recentes" }, names);
    expect(v).toMatchObject({ status: "concluido", de: null, ate: "2026-03-31", ordem: "recentes" });
    expect(parseFollowUpView({ status: "feito", ordem: "x" }, names)).toMatchObject({ status: null, ordem: "agendada" });
    expect(isFollowUpViewFiltered(parseFollowUpView({}, names))).toBe(false);
  });

  const items = [
    followUp("a", { scheduled_at: "2026-03-12T15:00:00Z", assigned_to: "u1", title: "Cobrar documentos" }),
    followUp("b", { scheduled_at: "2026-03-01T15:00:00Z", status: "concluido", created_at: "2026-02-01T00:00:00Z" }),
    followUp("c", { scheduled_at: "2026-03-20T15:00:00Z", description: "Retornar sobre a proposta" }),
  ];

  it("filtra por status, responsável, período e busca", () => {
    const base = parseFollowUpView({}, names);
    expect(ids(filterFollowUps(items, { ...base, status: "pendente" }))).toEqual(["a", "c"]);
    expect(ids(filterFollowUps(items, { ...base, responsavel: "u1" }))).toEqual(["a"]);
    expect(ids(filterFollowUps(items, { ...base, de: "2026-03-10", ate: "2026-03-15" }))).toEqual(["a"]);
    expect(ids(filterFollowUps(items, { ...base, q: "proposta" }))).toEqual(["c"]);
  });

  it("ordena por data agendada nos dois sentidos e mais recentes", () => {
    expect(ids(sortFollowUps(items, "agendada"))).toEqual(["b", "a", "c"]);
    expect(ids(sortFollowUps(items, "agendada_desc"))).toEqual(["c", "a", "b"]);
    expect(ids(sortFollowUps(items, "recentes"))[0]).toBe("b");
  });
});

describe("Notificações", () => {
  it("lê a URL e ignora valores inválidos", () => {
    expect(parseNotificationView({ leitura: "nao_lidas", tipo: "lead_urgente", ordem: "antigas" })).toEqual({
      q: null,
      leitura: "nao_lidas",
      tipo: "lead_urgente",
      ordem: "antigas",
    });
    expect(parseNotificationView({ leitura: "todas", tipo: "outro", ordem: "x" })).toMatchObject({
      leitura: null,
      tipo: null,
      ordem: "recentes",
    });
    expect(isNotificationViewFiltered(parseNotificationView({}))).toBe(false);
  });

  const items = [
    notif("a", { created_at: "2026-03-03T00:00:00Z", read: true, title: "Contrato assinado", type: "contrato_assinado" }),
    notif("b", { created_at: "2026-03-01T00:00:00Z", body: "Lead aguardando resposta" }),
    notif("c", { created_at: "2026-03-02T00:00:00Z", type: "lead_urgente" }),
  ];

  it("filtra por leitura, tipo e busca", () => {
    const base = parseNotificationView({});
    expect(ids(filterNotifications(items, { ...base, leitura: "lidas" }))).toEqual(["a"]);
    expect(ids(filterNotifications(items, { ...base, leitura: "nao_lidas" }))).toEqual(["b", "c"]);
    expect(ids(filterNotifications(items, { ...base, tipo: "lead_urgente" }))).toEqual(["c"]);
    expect(ids(filterNotifications(items, { ...base, q: "aguardando" }))).toEqual(["b"]);
  });

  it("ordena das mais recentes ou das mais antigas", () => {
    expect(ids(sortNotifications(items, "recentes"))).toEqual(["a", "c", "b"]);
    expect(ids(sortNotifications(items, "antigas"))).toEqual(["b", "c", "a"]);
  });
});

describe("Templates de documentos", () => {
  it("lê a URL e ignora valores inválidos", () => {
    expect(parseTemplateView({ q: "proc", categoria: "contrato", situacao: "inativos", ordem: "categoria" })).toEqual({
      q: "proc",
      categoria: "contrato",
      situacao: "inativos",
      ordem: "categoria",
    });
    expect(parseTemplateView({ situacao: "todos", ordem: "x" })).toMatchObject({ situacao: null, ordem: "nome" });
    expect(isTemplateViewFiltered(parseTemplateView({}))).toBe(false);
  });

  const items = [
    tpl("a", { name: "Procuração ad judicia", category: "procuracao" }),
    tpl("b", { name: "Contrato de honorários", category: "contrato", active: false, created_at: "2026-03-01T00:00:00Z" }),
    tpl("c", { name: "Anexo especial", category: "minha_categoria", description: "Uso interno" }),
  ];

  it("filtra por busca, categoria e situação", () => {
    const base = parseTemplateView({});
    expect(ids(filterTemplates(items, { ...base, q: "procuracao" }))).toEqual(["a"]);
    expect(ids(filterTemplates(items, { ...base, q: "interno" }))).toEqual(["c"]);
    expect(ids(filterTemplates(items, { ...base, categoria: "contrato" }))).toEqual(["b"]);
    expect(ids(filterTemplates(items, { ...base, situacao: "ativos" }))).toEqual(["a", "c"]);
    expect(ids(filterTemplates(items, { ...base, situacao: "inativos" }))).toEqual(["b"]);
  });

  it("ordena por nome, categoria e mais recentes", () => {
    expect(ids(sortTemplates(items, "nome"))).toEqual(["c", "b", "a"]);
    expect(ids(sortTemplates(items, "categoria"))).toEqual(["b", "c", "a"]);
    expect(ids(sortTemplates(items, "recentes"))[0]).toBe("b");
  });

  it("opções de categoria incluem as conhecidas e as cadastradas", () => {
    const values = templateCategoryOptions(items).map((o) => o.value);
    expect(values).toContain("procuracao");
    expect(values).toContain("minha_categoria");
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("Agenda", () => {
  it("lê a URL e ignora valores inválidos", () => {
    expect(
      parseAppointmentView({ modalidade: "presencial", situacao: "remarcada", responsavel: "u2", de: "2026-03-01" }, names)
    ).toMatchObject({ modalidade: "presencial", situacao: "remarcada", responsavel: "u2", de: "2026-03-01", ordem: "data" });
    expect(parseAppointmentView({ modalidade: "video", situacao: "x", ordem: "y" }, names)).toMatchObject({
      modalidade: null,
      situacao: null,
      ordem: "data",
    });
    expect(isAppointmentViewFiltered(parseAppointmentView({}, names))).toBe(false);
  });

  const items = [
    appt("a", { date: "2026-03-10", start_time: "14:00", modality: "presencial", assigned_to: "u1" }),
    appt("b", { date: "2026-03-10", start_time: "09:00", notes: "Trazer RG", created_at: "2026-02-01T00:00:00Z" }),
    appt("c", { date: "2026-03-02", status: "cancelada" }),
  ];

  it("filtra por tipo, situação, responsável, período e busca", () => {
    const base = parseAppointmentView({}, names);
    expect(ids(filterAppointments(items, { ...base, modalidade: "presencial" }))).toEqual(["a"]);
    expect(ids(filterAppointments(items, { ...base, situacao: "cancelada" }))).toEqual(["c"]);
    expect(ids(filterAppointments(items, { ...base, responsavel: "u1" }))).toEqual(["a"]);
    expect(ids(filterAppointments(items, { ...base, de: "2026-03-05" }))).toEqual(["a", "b"]);
    expect(ids(filterAppointments(items, { ...base, q: "rg" }))).toEqual(["b"]);
  });

  it("ordena por data e hora nos dois sentidos e por cadastro", () => {
    expect(ids(sortAppointments(items, "data"))).toEqual(["c", "b", "a"]);
    expect(ids(sortAppointments(items, "data_desc"))).toEqual(["a", "b", "c"]);
    expect(ids(sortAppointments(items, "recentes"))[0]).toBe("b");
  });
});
