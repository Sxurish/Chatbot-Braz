import { Plus, Scale, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LegalStatusBadge } from "@/components/crm/status-badge";
import { listProcesses } from "@/lib/data/fase6";
import { formatDate } from "@/lib/utils";

export default async function ProcessesPage() {
  const processes = await listProcesses();

  return (
    <>
      <PageHeader
        title="Processos"
        description="Processos judiciais e administrativos com acompanhamento de prazos."
        action={
          <Button>
            <Plus className="h-4 w-4" /> Novo processo
          </Button>
        }
      />

      {processes.length === 0 ? (
        <EmptyState icon={Scale} title="Nenhum processo cadastrado" />
      ) : (
        <div className="space-y-3">
          {processes.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-slate-900">
                    {p.process_number ?? "Sem número"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {[p.court, p.jurisdiction].filter(Boolean).join(" • ") || "—"}
                  </p>
                  {p.class && (
                    <p className="text-xs text-slate-500">{p.class}</p>
                  )}
                  {p.next_deadline && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      <CalendarClock className="h-3 w-3" /> Próximo prazo:{" "}
                      {formatDate(p.next_deadline)}
                    </p>
                  )}
                </div>
                <LegalStatusBadge status={p.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
