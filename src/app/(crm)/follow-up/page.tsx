import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickCreate } from "@/components/crm/quick-create";
import { getTeamNames } from "@/lib/data/team-names";
import { nameOf } from "@/lib/team-names";
import { listFollowUps } from "@/lib/data/crm";
import { formatDateTime } from "@/lib/utils";

export default async function FollowUpPage() {
  const [followUps, names] = await Promise.all([listFollowUps(), getTeamNames()]);
  return (
    <>
      <PageHeader
        title="Follow-up"
        description="Contatos programados para retorno a leads e clientes."
        action={<QuickCreate kind="followup" buttonLabel="Novo follow-up" />}
      />
      {followUps.length === 0 ? (
        <EmptyState title="Nenhum follow-up pendente" />
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
