import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EditOperationButton, QuickCreate } from "@/components/crm/quick-create";
import { ConfirmDeleteButton, StatusButton } from "@/components/crm/record-actions";
import { canWriteRecords, listResponsibleOptions } from "@/lib/data/cadastros-options";
import { Badge } from "@/components/ui/badge";
import { Check, RotateCcw } from "lucide-react";
import { getTeamNames } from "@/lib/data/team-names";
import { nameOf } from "@/lib/team-names";
import { listFollowUps } from "@/lib/data/crm";
import { ListToolbar } from "@/components/crm/list-toolbar";
import type { RawParams } from "@/lib/list-params";
import { assigneeOptions, optionsOf } from "@/lib/list-views/common";
import {
  FOLLOW_UP_SORT_LABELS,
  FOLLOW_UP_SORTS,
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_STATUS_LABELS,
  filterFollowUps,
  isFollowUpViewFiltered,
  parseFollowUpView,
  sortFollowUps,
} from "@/lib/list-views/follow-ups";
import { formatDateTime } from "@/lib/utils";

export default async function FollowUpPage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  const [all, names, canWrite, assignees] = await Promise.all([
    listFollowUps(),
    getTeamNames(),
    canWriteRecords(),
    listResponsibleOptions(),
  ]);
  const view = parseFollowUpView(sp, names);
  const followUps = sortFollowUps(filterFollowUps(all, view), view.ordem);
  return (
    <>
      <PageHeader
        title="Follow-up"
        description="Contatos programados para retorno a leads e clientes."
        action={
          canWrite ? <QuickCreate kind="followup" buttonLabel="Novo follow-up" assignees={assignees} /> : undefined
        }
      />
      {all.length > 0 && (
        <ListToolbar
          path="/follow-up"
          search={{ value: view.q, placeholder: "Buscar por título ou descrição" }}
          selects={[
            {
              name: "status",
              label: "Status",
              value: view.status,
              options: optionsOf(FOLLOW_UP_STATUSES, FOLLOW_UP_STATUS_LABELS),
            },
            {
              name: "responsavel",
              label: "Responsável",
              value: view.responsavel,
              options: assigneeOptions(names),
            },
          ]}
          dates={[
            { name: "de", label: "Agendado de", value: view.de },
            { name: "ate", label: "até", value: view.ate },
          ]}
          sort={{ value: view.ordem, options: optionsOf(FOLLOW_UP_SORTS, FOLLOW_UP_SORT_LABELS) }}
          active={isFollowUpViewFiltered(view)}
          count={{ shown: followUps.length, total: all.length, singular: "follow-up", plural: "follow-ups" }}
        />
      )}
      {followUps.length === 0 ? (
        <EmptyState
          title={all.length > 0 ? "Nenhum follow-up encontrado" : "Nenhum follow-up pendente"}
          description={all.length > 0 ? "Mude ou limpe os filtros para ver outros follow-ups." : undefined}
        />
      ) : (
        <div className="space-y-3">
          {followUps.map((fu) => (
            <Card
              key={fu.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p
                  className={
                    fu.status === "pendente" ? "font-medium text-slate-900" : "font-medium text-slate-400 line-through"
                  }
                >
                  {fu.title}
                </p>
                {fu.description && (
                  <p className="text-sm text-slate-600">{fu.description}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {nameOf(names, fu.assigned_to)} • {formatDateTime(fu.scheduled_at)}
                  {fu.lead_id && (
                    <>
                      {" • "}
                      <Link
                        href={`/leads/${fu.lead_id}`}
                        className="text-brand-primary hover:underline"
                      >
                        ver lead
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-slate-100 pt-2 sm:border-0 sm:pt-0">
                <Badge className="mr-1 border-slate-200 bg-slate-50 text-slate-600">
                  {FOLLOW_UP_STATUS_LABELS[fu.status]}
                </Badge>
                {canWrite && (
                  <>
                    {fu.status === "pendente" ? (
                      <StatusButton
                        kind="follow_up"
                        id={fu.id}
                        status="concluido"
                        label="Feito"
                        tone="primary"
                        icon={<Check className="h-3.5 w-3.5" />}
                      />
                    ) : (
                      <StatusButton
                        kind="follow_up"
                        id={fu.id}
                        status="pendente"
                        label="Reabrir"
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                      />
                    )}
                    <EditOperationButton kind="followup" record={fu} assignees={assignees} />
                    <ConfirmDeleteButton fields={{ kind: "follow_up", id: fu.id }} question="Remover o follow-up?" />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
