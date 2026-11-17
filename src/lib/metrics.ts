import { LEGAL_AREA_LABELS } from "./constants";
import type { Appointment, FollowUp, Lead, LegalArea, Task } from "./types";

export interface DashboardSources {
  tasks: Task[];
  appointments: Appointment[];
  followUps: FollowUp[];
}

/**
 * Métricas agregadas para o dashboard geral, calculadas sobre os dados que a
 * página leu (do Supabase, ou os fictícios só no modo demonstração).
 */
export function getDashboardMetrics(leads: Lead[], sources: DashboardSources) {
  const today = new Date().toISOString().slice(0, 10);

  const totalLeads = leads.length;
  const novosHoje = leads.filter((l) => l.created_at.slice(0, 10) === today).length;
  const urgentes = leads.filter((l) => l.urgency === "alta").length;
  const aguardandoDocs = leads.filter(
    (l) => l.commercial_status === "aguardando_documentos"
  ).length;
  const consultasAgendadas = sources.appointments.filter(
    (a) => a.status === "agendada"
  ).length;
  const clientes = leads.filter(
    (l) => l.commercial_status === "cliente_ativo" || l.is_existing_client
  ).length;
  const taxaConversao = totalLeads ? Math.round((clientes / totalLeads) * 100) : 0;
  const tarefasPendentes = sources.tasks.filter(
    (t) => t.status === "pendente" || t.status === "em_andamento"
  ).length;
  const followUpsPendentes = sources.followUps.filter((f) => f.status === "pendente").length;

  return {
    totalLeads,
    novosHoje,
    urgentes,
    aguardandoDocs,
    consultasAgendadas,
    taxaConversao,
    tarefasPendentes,
    followUpsPendentes,
  };
}

/** Distribuição de leads por área jurídica. */
export function getLeadsByArea(leads: Lead[]) {
  const counts = new Map<LegalArea, number>();
  for (const lead of leads) {
    counts.set(lead.legal_area, (counts.get(lead.legal_area) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([area, value]) => ({
    name: LEGAL_AREA_LABELS[area],
    value,
  }));
}

/** Distribuição de leads por origem. */
export function getLeadsBySource(leads: Lead[]) {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
}

/** Distribuição por urgência. */
export function getLeadsByUrgency(leads: Lead[]) {
  return [
    { name: "Alta", value: leads.filter((l) => l.urgency === "alta").length },
    { name: "Média", value: leads.filter((l) => l.urgency === "media").length },
    { name: "Baixa", value: leads.filter((l) => l.urgency === "baixa").length },
  ];
}

/**
 * Evolução das últimas 4 semanas (blocos de 7 dias terminando hoje): leads
 * novos e quantos deles já viraram clientes.
 */
export function getWeeklyEvolution(leads: Lead[], now = new Date()) {
  const DAY = 86_400_000;
  const end = now.getTime();
  const weeks = [3, 2, 1, 0].map((ago) => {
    const to = end - ago * 7 * DAY;
    const from = to - 7 * DAY;
    const label = new Date(from + DAY).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    return { from, to, semana: `Sem. de ${label}`, leads: 0, clientes: 0 };
  });
  for (const lead of leads) {
    const t = Date.parse(lead.created_at);
    const week = weeks.find((w) => t > w.from && t <= w.to);
    if (!week) continue;
    week.leads += 1;
    if (lead.commercial_status === "cliente_ativo" || lead.is_existing_client) week.clientes += 1;
  }
  return weeks.map(({ semana, leads: l, clientes }) => ({ semana, leads: l, clientes }));
}
