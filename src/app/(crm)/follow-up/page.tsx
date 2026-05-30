import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getUserName, mockFollowUps } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/utils";

export default function FollowUpPage() {
  return (
    <>
      <PageHeader
        title="Follow-up"
        description="Contatos programados para retorno a leads e clientes."
        action={
          <Button>
            <Plus className="h-4 w-4" /> Novo follow-up
          </Button>
        }
      />
      {mockFollowUps.length === 0 ? (
        <EmptyState title="Nenhum follow-up pendente" />
      ) : (
        <div className="space-y-3">
          {mockFollowUps.map((fu) => (
            <Card key={fu.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-slate-900">{fu.title}</p>
                {fu.description && (
                  <p className="text-sm text-slate-600">{fu.description}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {getUserName(fu.assigned_to)} • {formatDateTime(fu.scheduled_at)}
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
