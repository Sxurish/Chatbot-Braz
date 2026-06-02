import { PageHeader } from "@/components/layout/page-header";
import { listLeads, listTeam } from "@/lib/data/leads";
import {
  buildAreaRanking,
  buildCommercialFunnel,
  buildLegalFunnel,
  buildSourceRanking,
  buildWorkload,
} from "@/lib/metrics-funnel";
import { FunnelCard } from "./funnel-card";
import { RankingCard } from "./ranking-card";
import { WorkloadTable } from "./workload-table";

export default async function Page() {
  const [leads, team] = await Promise.all([listLeads(), listTeam()]);

  const commercial = buildCommercialFunnel(leads);
  const legal = buildLegalFunnel(leads);
  const areas = buildAreaRanking(leads);
  const sources = buildSourceRanking(leads);
  const workload = buildWorkload(leads, team);

  return (
    <>
      <PageHeader
        title="Métricas"
        description="Funil comercial e jurídico detalhados, rankings e distribuição de carga."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelCard
          title="Funil comercial"
          description="Quantos leads chegaram a cada etapa do processo comercial."
          funnel={commercial}
          showLost
        />
        <FunnelCard
          title="Funil jurídico"
          description="Andamento dos leads que entraram no fluxo jurídico."
          funnel={legal}
        />
        <RankingCard
          title="Áreas mais procuradas"
          description="Top áreas jurídicas com mais leads cadastrados."
          items={areas}
        />
        <RankingCard
          title="Origens dos leads"
          description="De onde estão chegando os atendimentos."
          items={sources}
        />
      </div>

      <div className="mt-4">
        <WorkloadTable rows={workload} />
      </div>
    </>
  );
}
