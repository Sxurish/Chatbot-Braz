import { ShieldAlert, ShieldCheck, FileWarning, Inbox } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { checkAdmin } from "@/lib/auth/require-admin";
import {
  getLgpdMetrics,
  listConsents,
  listDsrRequests,
} from "@/lib/data/lgpd";
import type { DsrStatus } from "@/lib/data/lgpd-types";
import { LgpdTabs } from "./tabs";
import { ConsentList } from "./consent-list";
import { DsrList } from "./dsr-list";

const BASE = "/lgpd";

interface SearchParams {
  searchParams: {
    tab?: string;
    page?: string;
    channel?: string;
    decision?: string;
    status?: string;
  };
}

export default async function Page({ searchParams }: SearchParams) {
  const admin = await checkAdmin();

  if (!admin.ok) {
    return (
      <>
        <PageHeader
          title="Políticas e consentimentos"
          description="Consentimentos LGPD e solicitações de titulares."
        />
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={ShieldAlert}
              title="Acesso restrito"
              description="Apenas administradores podem gerenciar consentimentos e solicitações LGPD."
            />
          </CardContent>
        </Card>
      </>
    );
  }

  const tab = searchParams.tab === "dsr" ? "dsr" : "consents";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const metrics = await getLgpdMetrics();

  return (
    <>
      <PageHeader
        title="Políticas e consentimentos"
        description="Visão centralizada dos consentimentos LGPD e das solicitações de titulares."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Consentimentos"
          value={metrics.totalConsents}
          icon={ShieldCheck}
        />
        <StatCard
          label="Taxa de aceite"
          value={`${metrics.acceptanceRate}%`}
          icon={ShieldCheck}
          tone="success"
        />
        <StatCard
          label="Solicitações em aberto"
          value={metrics.openDsrs}
          icon={FileWarning}
          tone={metrics.openDsrs > 0 ? "danger" : "default"}
        />
      </div>

      <Card className="mt-6">
        <CardContent className="space-y-4 py-6">
          <LgpdTabs
            current={tab}
            basePath={BASE}
            tabs={[
              { key: "consents", label: "Consentimentos" },
              {
                key: "dsr",
                label: "Solicitações",
                count: metrics.openDsrs,
              },
            ]}
          />

          {tab === "consents" ? (
            <ConsentsSection page={page} searchParams={searchParams} />
          ) : (
            <DsrSection page={page} searchParams={searchParams} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function ConsentsSection({
  page,
  searchParams,
}: {
  page: number;
  searchParams: SearchParams["searchParams"];
}) {
  const channel = searchParams.channel || null;
  const decision =
    searchParams.decision === "accepted"
      ? "accepted"
      : searchParams.decision === "denied"
        ? "denied"
        : null;

  const result = await listConsents({ channel, decision, page });

  if (result.total === 0 && !channel && !decision) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nenhum consentimento registrado"
        description="Os registros aparecerão aqui quando os usuários começarem a aceitar a política via chatbot."
      />
    );
  }

  return (
    <ConsentList
      rows={result.rows}
      total={result.total}
      page={result.page}
      totalPages={result.totalPages}
      pageSize={result.pageSize}
      basePath={BASE}
    />
  );
}

async function DsrSection({
  page,
  searchParams,
}: {
  page: number;
  searchParams: SearchParams["searchParams"];
}) {
  const validStatuses: DsrStatus[] = [
    "recebida",
    "em_analise",
    "concluida",
    "negada",
  ];
  const status = validStatuses.includes(searchParams.status as DsrStatus)
    ? (searchParams.status as DsrStatus)
    : null;

  const result = await listDsrRequests({ status, page });

  return (
    <DsrList
      rows={result.rows}
      total={result.total}
      page={result.page}
      totalPages={result.totalPages}
      pageSize={result.pageSize}
      basePath={BASE}
      canEdit
    />
  );
}
