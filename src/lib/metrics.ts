import { LEGAL_AREA_LABELS } from "./constants";
import { mockAppointments, mockFollowUps, mockTasks } from "./mock-data";
import type { Lead, LegalArea } from "./types";

/**
 * Métricas agregadas para o dashboard geral.
 * Recebem a lista de leads (real do Supabase ou mockada) para computar os
 * indicadores. Tarefas/agendamentos seguem mockados até a Fase 5.
 */
export function getDashboardMetrics(leads: Lead[]) {
  const today = new Date().toISOString().slice(0, 10);

  const totalLeads = leads.length;
  const novosHoje = leads.filter((l) => l.created_at.slice(0, 10) === today).length;
  const urgentes = leads.filter((l) => l.urgency === "alta").length;
  const aguardandoDocs = leads.filter(
    (l) => l.commercial_status === "aguardando_documentos"
  ).length;
  const consultasAgendadas = mockAppointments.filter(
    (a) => a.status === "agendada"
  ).length;
  const clientes = leads.filter(
    (l) => l.commercial_status === "cliente_ativo" || l.is_existing_client
  ).length;
  const taxaConversao = totalLeads ? Math.round((clientes / totalLeads) * 100) : 0;
  const tarefasPendentes = mockTasks.filter(
    (t) => t.status === "pendente" || t.status === "em_andamento"
  ).length;
  const followUpsPendentes = mockFollowUps.filter((f) => f.status === "pendente").length;

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

/** Evolução semanal (mock estático para demonstração de tendência). */
export function getWeeklyEvolution() {
  return [
    { semana: "Sem 1", leads: 4, clientes: 1 },
    { semana: "Sem 2", leads: 6, clientes: 2 },
    { semana: "Sem 3", leads: 5, clientes: 2 },
    { semana: "Sem 4", leads: 8, clientes: 3 },
  ];
}
