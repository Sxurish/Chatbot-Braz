import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LegalStatusBadge } from "@/components/crm/status-badge";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProcess, listMovements } from "@/lib/data/movements";
import { listCaseOptions } from "@/lib/data/fase6-options";
import { tribunalFromCnj } from "@/lib/datajud/tribunals";
import { brDate } from "../format";
import { MovementsPanel } from "./movements-panel";

export default async function ProcessDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const process = await getProcess(id);
  if (!process) notFound();

  const [user, movements, cases] = await Promise.all([
    getCurrentUser(),
    listMovements(process.id),
    process.case_id ? listCaseOptions() : Promise.resolve([]),
  ]);

  const canEdit = user.active && user.role !== "visualizador";
  const tribunal = tribunalFromCnj(process.process_number);
  const caseLabel = process.case_id ? cases.find((c) => c.id === process.case_id)?.label ?? "Ver caso" : null;

  return (
    <>
      <Link
        href="/processos"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Processos
      </Link>

      <PageHeader
        title={process.process_number ?? "Processo sem número"}
        description={process.class ?? "Processo judicial"}
        action={<LegalStatusBadge status={process.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <MovementsPanel
            processId={process.id}
            movements={movements}
            canEdit={canEdit}
            hasTribunal={Boolean(tribunal)}
            syncEnabled={process.sync_enabled ?? true}
            lastSyncedAt={process.last_synced_at ?? null}
            syncError={process.sync_error ?? null}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle>Dados do processo</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <dl className="space-y-3 text-sm">
                <Row label="Tribunal" value={tribunal?.label ?? process.court} />
                <Row label="Comarca / vara" value={process.jurisdiction} />
                <Row label="Classe" value={process.class} />
                <Row label="Assunto" value={process.subject} />
              </dl>

              {process.next_deadline && (
                <p className="mt-4 flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  Próximo prazo: <span className="font-medium">{brDate(process.next_deadline)}</span>
                </p>
              )}

              {caseLabel && (
                <Link
                  href="/casos"
                  className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-brand-primary/40 hover:text-brand-primary"
                >
                  <Briefcase className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 truncate">
                    <span className="text-slate-500">Caso: </span>
                    {caseLabel}
                  </span>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words text-slate-900">{value || "—"}</dd>
    </div>
  );
}
