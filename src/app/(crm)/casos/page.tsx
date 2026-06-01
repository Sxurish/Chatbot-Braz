import { Plus, Briefcase } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AreaBadge, LegalStatusBadge } from "@/components/crm/status-badge";
import { listCases } from "@/lib/data/fase6";
import { getUserName } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

export default async function CasesPage() {
  const cases = await listCases();

  return (
    <>
      <PageHeader
        title="Casos"
        description="Demandas jurídicas específicas vinculadas a leads ou clientes."
        action={
          <Button>
            <Plus className="h-4 w-4" /> Novo caso
          </Button>
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
                    {getUserName(c.assigned_to)} • Aberto em {formatDate(c.created_at)}
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
