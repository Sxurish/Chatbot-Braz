import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickCreate } from "@/components/crm/quick-create";
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
  const [all, names] = await Promise.all([listFollowUps(), getTeamNames()]);
  const view = parseFollowUpView(sp, names);
  const followUps = sortFollowUps(filterFollowUps(all, view), view.ordem);
  return (
    <>
      <PageHeader
        title="Follow-up"
        description="Contatos programados para retorno a leads e clientes."
        action={<QuickCreate kind="followup" buttonLabel="Novo follow-up" />}
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
            <Card key={fu.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-slate-900">{fu.title}</p>
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
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
