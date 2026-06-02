import {
  Users,
  AlertTriangle,
  CalendarClock,
  FileClock,
  Percent,
  ListChecks,
  Repeat,
  UserPlus,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  EvolutionChart,
  LeadsByAreaChart,
  LeadsBySourceChart,
  UrgencyChart,
} from "@/components/dashboard/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDashboardMetrics,
  getLeadsByArea,
  getLeadsBySource,
  getLeadsByUrgency,
  getWeeklyEvolution,
} from "@/lib/metrics";
import { listLeads } from "@/lib/data/leads";

export default async function DashboardPage() {
  const leads = await listLeads();
  const m = getDashboardMetrics(leads);

  return (
    <>
      <PageHeader
        title="Dashboard geral"
        description="Visão consolidada do atendimento e da operação jurídica do escritório."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total de leads" value={m.totalLeads} icon={Users} />
        <StatCard label="Novos hoje" value={m.novosHoje} icon={UserPlus} tone="gold" />
        <StatCard
          label="Atendimentos urgentes"
          value={m.urgentes}
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Consultas agendadas"
          value={m.consultasAgendadas}
          icon={CalendarClock}
          tone="success"
        />
        <StatCard
          label="Aguardando documentos"
          value={m.aguardandoDocs}
          icon={FileClock}
        />
        <StatCard label="Taxa de conversão" value={`${m.taxaConversao}%`} icon={Percent} />
        <StatCard label="Tarefas pendentes" value={m.tarefasPendentes} icon={ListChecks} />
        <StatCard
          label="Follow-ups pendentes"
          value={m.followUpsPendentes}
          icon={Repeat}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads por área jurídica</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadsByAreaChart data={getLeadsByArea(leads)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Origem dos leads</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadsBySourceChart data={getLeadsBySource(leads)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Atendimentos por urgência</CardTitle>
          </CardHeader>
          <CardContent>
            <UrgencyChart data={getLeadsByUrgency(leads)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Evolução semanal</CardTitle>
          </CardHeader>
          <CardContent>
            <EvolutionChart data={getWeeklyEvolution()} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
