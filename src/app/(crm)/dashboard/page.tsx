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
import { listAppointments, listFollowUps, listTasks } from "@/lib/data/crm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getLiveDigest } from "@/lib/digest/live";
import { DailyDigestCard } from "@/components/dashboard/daily-digest-card";

// O resumo do dia é calculado na hora para quem está logado.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const [leads, user, tasks, appointments, followUps] = await Promise.all([
    listLeads(),
    getCurrentUser(),
    listTasks(),
    listAppointments(),
    listFollowUps(),
  ]);
  const m = getDashboardMetrics(leads, { tasks, appointments, followUps });
  const live = await getLiveDigest(user, now);

  return (
    <>
      <PageHeader
        title="Dashboard geral"
        description="Visão consolidada do atendimento e da operação jurídica do escritório."
      />

      <DailyDigestCard digest={live.digest} error={live.error} todaySend={live.todaySend} now={now} />

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
            <EvolutionChart data={getWeeklyEvolution(leads, now)} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
