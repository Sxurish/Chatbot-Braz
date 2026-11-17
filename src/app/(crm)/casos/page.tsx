import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AreaBadge, LegalStatusBadge } from "@/components/crm/status-badge";
import { listCases } from "@/lib/data/fase6";
import { getTeamNames } from "@/lib/data/team-names";
import { nameOf } from "@/lib/team-names";
import { formatDate } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listClientOptions } from "@/lib/data/fase6-options";
import {
  canWriteRecords,
  listLeadOptions,
  listResponsibleOptions,
} from "@/lib/data/cadastros-options";
import { NewCaseButton } from "./new-case-button";

export default async function CasesPage() {
  const [cases, names, canWrite] = await Promise.all([
    listCases(),
    getTeamNames(),
    canWriteRecords(),
  ]);
  // Opções do formulário: só para quem pode gravar.
  const [clients, leads, team, user] = canWrite
    ? await Promise.all([
        listClientOptions(),
        listLeadOptions(),
        listResponsibleOptions(),
        getCurrentUser(),
      ])
    : [[], [], [], null];

  return (
    <>
      <PageHeader
        title="Casos"
        description="Demandas jurídicas específicas vinculadas a leads ou clientes."
        action={
          canWrite && user ? (
            <NewCaseButton
              clients={clients}
              leads={leads}
              team={team}
              currentUserId={user.id}
            />
          ) : undefined
        }
      />

      {cases.length === 0 ? (
        <EmptyState icon={Briefcase} title="Nenhum caso cadastrado" />
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{c.title}</p>
                  {c.summary && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {c.summary}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {nameOf(names, c.assigned_to)} • Aberto em {formatDate(c.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <AreaBadge area={c.legal_area} />
                  <LegalStatusBadge status={c.status} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
