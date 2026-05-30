import { LEGAL_AREA_LABELS } from "./constants";
import {
  mockAppointments,
  mockFollowUps,
  mockLeads,
  mockTasks,
} from "./mock-data";
import type { LegalArea } from "./types";

/** Métricas agregadas para o dashboard geral (a partir dos dados mockados). */
export function getDashboardMetrics() {
  const today = new Date().toISOString().slice(0, 10);

  const totalLeads = mockLeads.length;
  const novosHoje = mockLeads.filter((l) => l.created_at.slice(0, 10) === today).length;
  const urgentes = mockLeads.filter((l) => l.urgency === "alta").length;
  const aguardandoDocs = mockLeads.filter(
    (l) => l.commercial_status === "aguardando_documentos"
  ).length;
  const consultasAgendadas = mockAppointments.filter(
    (a) => a.status === "agendada"
  ).length;
  const clientes = mockLeads.filter(
    (l) => l.commercial_status === "cliente_ativo" || l.is_existing_client
  ).length;
  const taxaConversao = totalLeads
    ? Math.round((clientes / totalLeads) * 100)
    : 0;
  const tarefasPendentes = mockTasks.filter(
    (t) => t.status === "pendente" || t.status === "em_andamento"
  ).length;
  const followUpsPendentes = mockFollowUps.filter(
    (f) => f.status === "pendente"
  ).length;

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
export function getLeadsByArea() {
  const counts = new Map<LegalArea, number>();
  for (const lead of mockLeads) {
    counts.set(lead.legal_area, (counts.get(lead.legal_area) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([area, value]) => ({
    name: LEGAL_AREA_LABELS[area],
    value,
  }));
}

/** Distribuição de leads por origem. */
export function getLeadsBySource() {
  const counts = new Map<string, number>();
  for (const lead of mockLeads) {
    counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
}

/** Distribuição por urgência. */
export function getLeadsByUrgency() {
  return [
    {
      name: "Alta",
      value: mockLeads.filter((l) => l.urgency === "alta").length,
    },
    {
      name: "Média",
      value: mockLeads.filter((l) => l.urgency === "media").length,
    },
    {
      name: "Baixa",
      value: mockLeads.filter((l) => l.urgency === "baixa").length,
    },
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
