import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { listLeads, getLead, listTeam } from "@/lib/data/leads";
import {
  listAppointments,
  listDocumentsByLead,
  listFollowUps,
  listTasks,
} from "@/lib/data/crm";
import {
  listCases,
  listClients,
  listContracts,
  listPayments,
  listProcesses,
} from "@/lib/data/fase6";
import {
  COMMERCIAL_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  LEGAL_AREA_LABELS,
  LEGAL_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  URGENCY_LABELS,
} from "@/lib/constants";
import type {
  Case,
  Client,
  CommercialStatus,
  ContractStatus,
  LegalArea,
  LegalStatus,
  PaymentStatus,
  TaskStatus,
  TeamUser,
  Urgency,
} from "@/lib/types";

/**
 * Ferramentas do assistente virtual — SOMENTE LEITURA.
 *
 * Todas consultam a camada de dados do CRM, que usa o login de quem está
 * conversando (as regras de RLS do Supabase valem para o assistente também).
 * As ferramentas financeiras nem são oferecidas a quem não é Admin, e o
 * executor confere o papel de novo antes de rodar.
 */

export interface ToolContext {
  user: TeamUser;
  isAdmin: boolean;
  /** "Agora" injetável para testes. */
  now: Date;
  /** Pode preparar rascunhos de cadastro (todos menos Visualizador). */
  canWrite?: boolean;
  /** Conversa atual (os rascunhos ficam ligados a ela). */
  conversationId?: string;
  /** Arquivo anexado à pergunta atual, se houver. */
  attachment?: { id: string; name: string } | null;
  /** Avisa a interface de algo novo (ex.: um rascunho para conferir). */
  emit?: (event: { type: "draft"; draft: unknown }) => void;
}

export interface AssistantTool<S extends z.ZodType = z.ZodType> {
  name: string;
  /** Rótulo curto exibido na interface enquanto a ferramenta roda. */
  label: string;
  description: string;
  schema: S;
  adminOnly?: boolean;
  /** Prepara rascunho de cadastro (nunca grava): não é oferecida a quem só visualiza. */
  writeOnly?: boolean;
  run: (input: z.output<S>, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodType>(tool: AssistantTool<S>): AssistantTool {
  return tool as unknown as AssistantTool;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

const TZ = "America/Sao_Paulo";

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export function isoDateInSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Normaliza texto para busca: minúsculas e sem acentos. */
export function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function matchesText(query: string | undefined, ...fields: (string | null | undefined)[]) {
  if (!query) return true;
  const q = normalize(query);
  const qDigits = digits(query);
  return fields.some((f) => {
    if (!f) return false;
    if (normalize(f).includes(q)) return true;
    // Números (processo, telefone, CPF) comparados só pelos dígitos.
    return qDigits.length >= 4 && digits(f).includes(qDigits);
  });
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 10 ? isoDateInSaoPaulo(new Date(value)) : value;
}

const limitSchema = z.number().int().min(1).max(25).default(10);

function paginate<T>(items: T[], limit: number) {
  return { total: items.length, mostrando: Math.min(items.length, limit), itens: items.slice(0, limit) };
}

async function teamNames(): Promise<(id: string | null) => string | null> {
  const team = await listTeam();
  const map = new Map(team.map((u) => [u.id, u.name]));
  return (id) => (id ? map.get(id) ?? null : null);
}

function enumValues<T extends string>(labels: Record<T, string>) {
  return Object.keys(labels) as [T, ...T[]];
}

const urgencyEnum = z.enum(enumValues<Urgency>(URGENCY_LABELS));
const commercialEnum = z.enum(enumValues<CommercialStatus>(COMMERCIAL_STATUS_LABELS));
const legalStatusEnum = z.enum(enumValues<LegalStatus>(LEGAL_STATUS_LABELS));
const areaEnum = z.enum(enumValues<LegalArea>(LEGAL_AREA_LABELS));
const contractStatusEnum = z.enum(enumValues<ContractStatus>(CONTRACT_STATUS_LABELS));
const paymentStatusEnum = z.enum(enumValues<PaymentStatus>(PAYMENT_STATUS_LABELS));
const taskStatusEnum = z.enum([
  "pendente",
  "em_andamento",
  "concluida",
  "cancelada",
  "atrasada",
] as [TaskStatus, ...TaskStatus[]]);

function clientLabel(clients: Client[], id: string | null) {
  return id ? clients.find((c) => c.id === id)?.full_name ?? null : null;
}

function caseLabel(cases: Case[], id: string | null) {
  return id ? cases.find((c) => c.id === id)?.title ?? null : null;
}

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

const buscarLeads = defineTool({
  name: "buscar_leads",
  label: "Buscando leads",
  description:
    "Busca leads (pessoas que procuraram o escritório) por nome, telefone, e-mail, cidade, número de processo ou resumo do caso, com filtros de urgência, status comercial, área e período. Use para perguntas como 'leads urgentes desta semana' ou 'tem algum lead chamado Fernanda?'.",
  schema: z.object({
    texto: z.string().max(120).optional().describe("Trecho de nome, telefone, e-mail, cidade, número de processo ou assunto."),
    urgencia: urgencyEnum.optional(),
    status_comercial: commercialEnum.optional(),
    area: areaEnum.optional().describe("Área jurídica."),
    ultimos_dias: z.number().int().min(1).max(365).optional().describe("Só leads criados nos últimos N dias."),
    limite: limitSchema,
  }),
  async run(input, ctx) {
    const [leads, nameOf] = await Promise.all([listLeads(), teamNames()]);
    const since = input.ultimos_dias ? addDays(isoDateInSaoPaulo(ctx.now), -input.ultimos_dias) : null;
    const filtered = leads.filter(
      (l) =>
        matchesText(input.texto, l.full_name, l.phone, l.email, l.city, l.process_number, l.case_summary, l.case_type) &&
        (!input.urgencia || l.urgency === input.urgencia) &&
        (!input.status_comercial || l.commercial_status === input.status_comercial) &&
        (!input.area || l.legal_area === input.area) &&
        (!since || (dateOnly(l.created_at) ?? "") >= since)
    );
    return paginate(
      filtered.map((l) => ({
        id: l.id,
        nome: l.full_name,
        area: LEGAL_AREA_LABELS[l.legal_area] ?? l.legal_area,
        urgencia: URGENCY_LABELS[l.urgency] ?? l.urgency,
        status_comercial: COMMERCIAL_STATUS_LABELS[l.commercial_status] ?? l.commercial_status,
        cidade: [l.city, l.state].filter(Boolean).join("/") || null,
        responsavel: nameOf(l.assigned_to),
        proxima_acao: l.next_action,
        criado_em: l.created_at,
        link: `/leads/${l.id}`,
      })),
      input.limite
    );
  },
});

const verLead = defineTool({
  name: "ver_lead",
  label: "Abrindo o lead",
  description:
    "Mostra a ficha completa de um lead pelo id: dados de contato, resumo do caso, status, tarefas, compromissos, follow-ups e documentos. Use quando a pessoa estiver na página de um lead e pedir 'resuma este lead', ou depois de achar o id com buscar_leads.",
  schema: z.object({ lead_id: z.string().min(1).max(100) }),
  async run(input, ctx) {
    const lead = await getLead(input.lead_id);
    if (!lead) return { encontrado: false, mensagem: "Lead não encontrado." };
    const [nameOf, tasks, appts, follows, docs] = await Promise.all([
      teamNames(),
      listTasks(),
      listAppointments(),
      listFollowUps(),
      listDocumentsByLead(lead.id),
    ]);
    return {
      encontrado: true,
      link: `/leads/${lead.id}`,
      nome: lead.full_name,
      telefone: lead.phone,
      email: lead.email,
      cidade: [lead.city, lead.state].filter(Boolean).join("/") || null,
      area: LEGAL_AREA_LABELS[lead.legal_area] ?? lead.legal_area,
      subarea: lead.subarea,
      tipo_de_caso: lead.case_type,
      resumo_do_caso: lead.case_summary,
      urgencia: URGENCY_LABELS[lead.urgency] ?? lead.urgency,
      motivo_urgencia: lead.urgency_reason,
      status_comercial: COMMERCIAL_STATUS_LABELS[lead.commercial_status] ?? lead.commercial_status,
      status_juridico: LEGAL_STATUS_LABELS[lead.legal_status] ?? lead.legal_status,
      // Situação financeira do lead: só para Admin.
      ...(ctx.isAdmin
        ? { status_financeiro: FINANCIAL_STATUS_LABELS[lead.financial_status] ?? lead.financial_status }
        : {}),
      origem: lead.source,
      responsavel: nameOf(lead.assigned_to),
      numero_processo: lead.process_number,
      ja_e_cliente: lead.is_existing_client,
      melhor_horario: lead.preferred_contact_time,
      proxima_acao: lead.next_action,
      criado_em: lead.created_at,
      tarefas: tasks
        .filter((t) => t.lead_id === lead.id)
        .map((t) => ({ titulo: t.title, status: t.status, vence_em: t.due_date, responsavel: nameOf(t.assigned_to) })),
      compromissos: appts
        .filter((a) => a.lead_id === lead.id)
        .map((a) => ({ titulo: a.title, data: a.date, inicio: a.start_time, modalidade: a.modality, status: a.status })),
      follow_ups: follows
        .filter((f) => f.lead_id === lead.id)
        .map((f) => ({ titulo: f.title, agendado_para: f.scheduled_at, status: f.status })),
      documentos: docs.map((d) => ({ arquivo: d.file_name, categoria: d.category, revisao: d.review_status })),
    };
  },
});

const buscarClientes = defineTool({
  name: "buscar_clientes",
  label: "Buscando clientes",
  description:
    "Busca clientes (já contratados) por nome, telefone, e-mail, CPF/CNPJ ou cidade e mostra os casos de cada um.",
  schema: z.object({
    texto: z.string().max(120).optional(),
    status: z.enum(["ativo", "inativo"]).optional(),
    limite: limitSchema,
  }),
  async run(input) {
    const [clients, cases] = await Promise.all([listClients(), listCases()]);
    const filtered = clients.filter(
      (c) =>
        matchesText(input.texto, c.full_name, c.phone, c.email, c.cpf_cnpj, c.city) &&
        (!input.status || c.status === input.status)
    );
    return paginate(
      filtered.map((c) => ({
        id: c.id,
        nome: c.full_name,
        telefone: c.phone,
        email: c.email,
        cidade: [c.city, c.state].filter(Boolean).join("/") || null,
        status: c.status,
        casos: cases.filter((k) => k.client_id === c.id).map((k) => k.title),
        lead_de_origem: c.lead_id ? `/leads/${c.lead_id}` : null,
        link: "/clientes",
      })),
      input.limite
    );
  },
});

const buscarCasos = defineTool({
  name: "buscar_casos",
  label: "Buscando casos",
  description:
    "Busca casos (demandas jurídicas) por título, resumo ou nome do cliente, com filtro de status e área. Mostra os processos ligados a cada caso.",
  schema: z.object({
    texto: z.string().max(120).optional(),
    status: legalStatusEnum.optional(),
    area: areaEnum.optional(),
    limite: limitSchema,
  }),
  async run(input) {
    const [cases, clients, processes, nameOf] = await Promise.all([
      listCases(),
      listClients(),
      listProcesses(),
      teamNames(),
    ]);
    const filtered = cases.filter(
      (k) =>
        matchesText(input.texto, k.title, k.summary, k.subarea, clientLabel(clients, k.client_id)) &&
        (!input.status || k.status === input.status) &&
        (!input.area || k.legal_area === input.area)
    );
    return paginate(
      filtered.map((k) => ({
        id: k.id,
        titulo: k.title,
        cliente: clientLabel(clients, k.client_id),
        area: LEGAL_AREA_LABELS[k.legal_area] ?? k.legal_area,
        status: LEGAL_STATUS_LABELS[k.status] ?? k.status,
        responsavel: nameOf(k.assigned_to),
        resumo: k.summary,
        processos: processes
          .filter((p) => p.case_id === k.id)
          .map((p) => ({ numero: p.process_number, proximo_prazo: p.next_deadline })),
        link: "/casos",
      })),
      input.limite
    );
  },
});

const buscarProcessos = defineTool({
  name: "buscar_processos",
  label: "Buscando processos",
  description:
    "Busca processos judiciais pelo número CNJ (com ou sem pontuação), vara, comarca, classe, assunto, título do caso ou nome do cliente. Traz o próximo prazo cadastrado. Ainda não há andamentos dos tribunais no CRM.",
  schema: z.object({
    numero: z.string().max(40).optional().describe("Número do processo, completo ou parcial."),
    texto: z.string().max(120).optional(),
    status: legalStatusEnum.optional(),
    limite: limitSchema,
  }),
  async run(input) {
    const [processes, cases, clients] = await Promise.all([listProcesses(), listCases(), listClients()]);
    const numberDigits = digits(input.numero);
    const filtered = processes.filter((p) => {
      const kase = cases.find((k) => k.id === p.case_id);
      return (
        (!numberDigits || digits(p.process_number).includes(numberDigits)) &&
        matchesText(
          input.texto,
          p.court,
          p.jurisdiction,
          p.class,
          p.subject,
          kase?.title,
          clientLabel(clients, kase?.client_id ?? null)
        ) &&
        (!input.status || p.status === input.status)
      );
    });
    return paginate(
      filtered.map((p) => {
        const kase = cases.find((k) => k.id === p.case_id);
        return {
          id: p.id,
          numero: p.process_number,
          vara: p.court,
          comarca: p.jurisdiction,
          classe: p.class,
          assunto: p.subject,
          status: LEGAL_STATUS_LABELS[p.status] ?? p.status,
          proximo_prazo: p.next_deadline,
          caso: caseLabel(cases, p.case_id),
          cliente: clientLabel(clients, kase?.client_id ?? null),
          link: "/processos",
        };
      }),
      input.limite
    );
  },
});

const listarPrazos = defineTool({
  name: "listar_prazos",
  label: "Conferindo prazos",
  description:
    "Lista o que vence nos próximos N dias, em ordem de data: prazos de processos, tarefas abertas e compromissos da agenda. Pode incluir o que já venceu e não foi concluído.",
  schema: z.object({
    dias: z.number().int().min(0).max(90).default(7).describe("Janela a partir de hoje (0 = só hoje)."),
    incluir_vencidos: z.boolean().default(true),
  }),
  async run(input, ctx) {
    const today = isoDateInSaoPaulo(ctx.now);
    const end = addDays(today, input.dias);
    const [processes, cases, tasks, appts, nameOf] = await Promise.all([
      listProcesses(),
      listCases(),
      listTasks(),
      listAppointments(),
      teamNames(),
    ]);
    const inWindow = (d: string | null) =>
      !!d && d <= end && (input.incluir_vencidos || d >= today);

    const itens = [
      ...processes
        .filter((p) => p.status !== "encerrado" && inWindow(dateOnly(p.next_deadline)))
        .map((p) => ({
          tipo: "prazo de processo",
          data: dateOnly(p.next_deadline)!,
          vencido: dateOnly(p.next_deadline)! < today,
          descricao: `Processo ${p.process_number ?? "sem número"}${p.subject ? ` (${p.subject})` : ""}`,
          caso: caseLabel(cases, p.case_id),
          link: "/processos",
        })),
      ...tasks
        .filter((t) => t.status !== "concluida" && t.status !== "cancelada" && inWindow(dateOnly(t.due_date)))
        .map((t) => ({
          tipo: "tarefa",
          data: dateOnly(t.due_date)!,
          vencido: dateOnly(t.due_date)! < today,
          descricao: t.title,
          responsavel: nameOf(t.assigned_to),
          link: t.lead_id ? `/leads/${t.lead_id}` : "/tarefas",
        })),
      ...appts
        .filter((a) => a.status === "agendada" || a.status === "remarcada")
        .filter((a) => a.date >= today && a.date <= end)
        .map((a) => ({
          tipo: "compromisso",
          data: a.date,
          vencido: false,
          descricao: `${a.title} às ${a.start_time.slice(0, 5)} (${a.modality})`,
          responsavel: nameOf(a.assigned_to),
          link: "/agenda",
        })),
    ].sort((a, b) => a.data.localeCompare(b.data));

    return { hoje: today, ate: end, total: itens.length, itens: itens.slice(0, 40) };
  },
});

const listarTarefas = defineTool({
  name: "listar_tarefas",
  label: "Listando tarefas",
  description:
    "Lista tarefas da equipe com filtros: só as minhas, por status, atrasadas, ou que vencem nos próximos N dias.",
  schema: z.object({
    somente_minhas: z.boolean().default(false).describe("Só as tarefas de quem está perguntando."),
    responsavel: z.string().max(80).optional().describe("Nome de alguém da equipe."),
    status: taskStatusEnum.optional(),
    atrasadas: z.boolean().default(false),
    vencendo_em_dias: z.number().int().min(0).max(90).optional(),
    limite: limitSchema,
  }),
  async run(input, ctx) {
    const today = isoDateInSaoPaulo(ctx.now);
    const [tasks, team] = await Promise.all([listTasks(), listTeam()]);
    const nameOf = (id: string | null) => (id ? team.find((u) => u.id === id)?.name ?? null : null);
    const responsavelIds = input.responsavel
      ? team.filter((u) => matchesText(input.responsavel, u.name)).map((u) => u.id)
      : null;
    const open = (s: TaskStatus) => s !== "concluida" && s !== "cancelada";
    const filtered = tasks.filter((t) => {
      const due = dateOnly(t.due_date);
      if (input.somente_minhas && t.assigned_to !== ctx.user.id) return false;
      if (responsavelIds && !responsavelIds.includes(t.assigned_to ?? "")) return false;
      if (input.status && t.status !== input.status) return false;
      if (input.atrasadas && !(open(t.status) && due && due < today)) return false;
      if (input.vencendo_em_dias !== undefined) {
        const end = addDays(today, input.vencendo_em_dias);
        if (!(open(t.status) && due && due >= today && due <= end)) return false;
      }
      return true;
    });
    return paginate(
      filtered.map((t) => ({
        titulo: t.title,
        descricao: t.description,
        status: t.status,
        prioridade: t.priority,
        vence_em: t.due_date,
        atrasada: open(t.status) && !!dateOnly(t.due_date) && dateOnly(t.due_date)! < today,
        responsavel: nameOf(t.assigned_to),
        link: t.lead_id ? `/leads/${t.lead_id}` : "/tarefas",
      })),
      input.limite
    );
  },
});

const listarAgenda = defineTool({
  name: "listar_agenda",
  label: "Abrindo a agenda",
  description: "Lista compromissos da agenda entre duas datas (padrão: hoje até daqui a 7 dias).",
  schema: z.object({
    de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD"),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD"),
    somente_meus: z.boolean().default(false),
  }),
  async run(input, ctx) {
    const today = isoDateInSaoPaulo(ctx.now);
    const from = input.de ?? today;
    const to = input.ate ?? addDays(from, 7);
    const [appts, nameOf] = await Promise.all([listAppointments(), teamNames()]);
    const itens = appts
      .filter((a) => a.date >= from && a.date <= to)
      .filter((a) => !input.somente_meus || a.assigned_to === ctx.user.id)
      .sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
      .map((a) => ({
        titulo: a.title,
        data: a.date,
        inicio: a.start_time.slice(0, 5),
        fim: a.end_time?.slice(0, 5) ?? null,
        modalidade: a.modality,
        status: a.status,
        responsavel: nameOf(a.assigned_to),
        lead: a.lead_id ? `/leads/${a.lead_id}` : null,
        link: "/agenda",
      }));
    return { de: from, ate: to, total: itens.length, itens: itens.slice(0, 40) };
  },
});

const listarFollowUps = defineTool({
  name: "listar_follow_ups",
  label: "Listando follow-ups",
  description: "Lista os follow-ups (retornos agendados para leads e clientes), por padrão só os pendentes.",
  schema: z.object({
    somente_pendentes: z.boolean().default(true),
    limite: limitSchema,
  }),
  async run(input) {
    const [follows, nameOf] = await Promise.all([listFollowUps(), teamNames()]);
    const filtered = follows
      .filter((f) => !input.somente_pendentes || f.status === "pendente")
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return paginate(
      filtered.map((f) => ({
        titulo: f.title,
        descricao: f.description,
        agendado_para: f.scheduled_at,
        status: f.status,
        responsavel: nameOf(f.assigned_to),
        link: f.lead_id ? `/leads/${f.lead_id}` : "/follow-up",
      })),
      input.limite
    );
  },
});

const resumoDoEscritorio = defineTool({
  name: "resumo_do_escritorio",
  label: "Montando o resumo",
  description:
    "Números gerais do escritório agora: leads novos (7 e 30 dias), leads urgentes em aberto, casos e processos ativos, tarefas atrasadas e compromissos de hoje.",
  schema: z.object({}),
  async run(_input, ctx) {
    const today = isoDateInSaoPaulo(ctx.now);
    const [leads, cases, processes, tasks, appts] = await Promise.all([
      listLeads(),
      listCases(),
      listProcesses(),
      listTasks(),
      listAppointments(),
    ]);
    const since = (days: number) => addDays(today, -days);
    const closed: CommercialStatus[] = [
      "contrato_assinado",
      "cliente_ativo",
      "perdido",
      "nao_qualificado",
    ];
    return {
      hoje: today,
      leads_novos_7_dias: leads.filter((l) => (dateOnly(l.created_at) ?? "") >= since(7)).length,
      leads_novos_30_dias: leads.filter((l) => (dateOnly(l.created_at) ?? "") >= since(30)).length,
      leads_urgentes_em_aberto: leads.filter(
        (l) => l.urgency === "alta" && !closed.includes(l.commercial_status)
      ).length,
      casos_ativos: cases.filter((k) => k.status !== "encerrado").length,
      processos_ativos: processes.filter((p) => p.status !== "encerrado").length,
      tarefas_atrasadas: tasks.filter(
        (t) =>
          t.status !== "concluida" &&
          t.status !== "cancelada" &&
          !!dateOnly(t.due_date) &&
          dateOnly(t.due_date)! < today
      ).length,
      compromissos_hoje: appts.filter((a) => a.date === today && a.status !== "cancelada").length,
      links: { leads: "/leads", casos: "/casos", processos: "/processos", tarefas: "/tarefas", agenda: "/agenda" },
    };
  },
});

const listarEquipe = defineTool({
  name: "listar_equipe",
  label: "Consultando a equipe",
  description: "Lista as pessoas da equipe do escritório com papel e se estão ativas.",
  schema: z.object({}),
  async run() {
    const team = await listTeam();
    return team.map((u) => ({ nome: u.name, papel: u.role, ativo: u.active }));
  },
});

// ---------------------------------------------------------------------------
// Financeiro — só Admin
// ---------------------------------------------------------------------------

const resumoFinanceiro = defineTool({
  name: "resumo_financeiro",
  label: "Somando o financeiro",
  adminOnly: true,
  description:
    "SÓ ADMIN. Totais do financeiro: recebido, a receber, em atraso e receita prevista dos contratos. Pode filtrar um mês (AAAA-MM) pelo vencimento.",
  schema: z.object({
    mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("AAAA-MM; sem mês = tudo."),
  }),
  async run(input) {
    const [payments, contracts] = await Promise.all([listPayments(), listContracts()]);
    const inMonth = (d: string | null) => !input.mes || (d ?? "").startsWith(input.mes);
    const sum = (status: PaymentStatus, field: "due_date" | "paid_at" = "due_date") =>
      payments
        .filter((p) => p.status === status && inMonth(p[field]))
        .reduce((s, p) => s + Number(p.amount || 0), 0);
    return {
      mes: input.mes ?? "todos",
      recebido: sum("pago", "paid_at"),
      a_receber: sum("pendente"),
      em_atraso: sum("atrasado"),
      receita_prevista_contratos: contracts
        .filter((c) => c.status === "assinado" || c.status === "enviado")
        .reduce((s, c) => s + Number(c.value ?? 0), 0),
      moeda: "BRL",
      link: "/financeiro",
    };
  },
});

const buscarPagamentos = defineTool({
  name: "buscar_pagamentos",
  label: "Buscando pagamentos",
  adminOnly: true,
  description: "SÓ ADMIN. Lista pagamentos por status e/ou nome do cliente.",
  schema: z.object({
    status: paymentStatusEnum.optional(),
    cliente: z.string().max(120).optional(),
    limite: limitSchema,
  }),
  async run(input) {
    const [payments, clients] = await Promise.all([listPayments(), listClients()]);
    const filtered = payments.filter(
      (p) =>
        (!input.status || p.status === input.status) &&
        matchesText(input.cliente, clientLabel(clients, p.client_id))
    );
    return paginate(
      filtered.map((p) => ({
        descricao: p.description,
        cliente: clientLabel(clients, p.client_id),
        valor: Number(p.amount),
        vencimento: p.due_date,
        pago_em: p.paid_at,
        status: PAYMENT_STATUS_LABELS[p.status] ?? p.status,
        link: "/financeiro",
      })),
      input.limite
    );
  },
});

const buscarContratos = defineTool({
  name: "buscar_contratos",
  label: "Buscando contratos",
  adminOnly: true,
  description: "SÓ ADMIN. Lista contratos de honorários por status e/ou nome do cliente, com valor e condições.",
  schema: z.object({
    status: contractStatusEnum.optional(),
    cliente: z.string().max(120).optional(),
    limite: limitSchema,
  }),
  async run(input) {
    const [contracts, clients, cases] = await Promise.all([listContracts(), listClients(), listCases()]);
    const filtered = contracts.filter(
      (c) =>
        (!input.status || c.status === input.status) &&
        matchesText(input.cliente, clientLabel(clients, c.client_id))
    );
    return paginate(
      filtered.map((c) => ({
        tipo: c.contract_type,
        cliente: clientLabel(clients, c.client_id),
        caso: caseLabel(cases, c.case_id),
        valor: c.value,
        condicoes: c.payment_terms,
        status: CONTRACT_STATUS_LABELS[c.status] ?? c.status,
        assinado_em: c.signed_at,
        link: "/contratos",
      })),
      input.limite
    );
  },
});

export const ALL_TOOLS: AssistantTool[] = [
  buscarLeads,
  verLead,
  buscarClientes,
  buscarCasos,
  buscarProcessos,
  listarPrazos,
  listarTarefas,
  listarAgenda,
  listarFollowUps,
  resumoDoEscritorio,
  listarEquipe,
  resumoFinanceiro,
  buscarPagamentos,
  buscarContratos,
];

/** Ferramentas que esta pessoa pode usar (financeiro só para Admin). */
export function getToolsFor(isAdmin: boolean): AssistantTool[] {
  return ALL_TOOLS.filter((t) => !t.adminOnly || isAdmin);
}

/** Definições no formato da API da Anthropic. */
export function toApiTools(tools: AssistantTool[]): Anthropic.Tool[] {
  return tools.map((t) => {
    const schema = z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: t.name,
      description: t.description,
      input_schema: schema as Anthropic.Tool.InputSchema,
    };
  });
}

export type ToolOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/** Executa uma ferramenta validando a entrada e conferindo a permissão. */
export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
  tools: AssistantTool[] = ALL_TOOLS
): Promise<ToolOutcome> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `Ferramenta desconhecida: ${name}` };
  if (tool.adminOnly && !ctx.isAdmin) {
    return { ok: false, error: "Acesso negado: dados financeiros são só para administradores." };
  }
  if (tool.writeOnly && !ctx.canWrite) {
    return { ok: false, error: "Acesso negado: seu papel na equipe é só de visualização." };
  }
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Parâmetros inválidos${issue ? ` em "${issue.path.join(".")}": ${issue.message}` : ""}.`,
    };
  }
  try {
    return { ok: true, result: await tool.run(parsed.data, ctx) };
  } catch (err) {
    console.error(`[assistente] falha na ferramenta ${name}`, err);
    return {
      ok: false,
      error: tool.writeOnly
        ? "Não consegui preparar o rascunho agora."
        : "Não consegui consultar essa informação agora.",
    };
  }
}
