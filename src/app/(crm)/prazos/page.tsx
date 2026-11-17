import Link from "next/link";
import { CalendarDays, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalculationHistory } from "@/components/prazos/calculation-history";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listProcesses } from "@/lib/data/fase6";
import { listCalculations } from "@/lib/data/prazos";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEADLINE_DISCLAIMER } from "@/lib/prazos/types";
import { DeadlineCalculator } from "./deadline-calculator";

export default async function PrazosPage(props: { searchParams: Promise<{ processo?: string }> }) {
  const { processo } = await props.searchParams;
  const [user, processes, history] = await Promise.all([
    getCurrentUser(),
    listProcesses(),
    listCalculations({ limit: 20 }),
  ]);

  const options = processes
    .map((p) => ({ value: p.id, label: p.process_number ?? "Processo sem número", comarca: p.jurisdiction ?? "" }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const initialProcessId = options.some((o) => o.value === processo) ? processo! : "";
  const canWrite = user.active && user.role !== "visualizador";

  return (
    <>
      <PageHeader
        title="Prazos"
        description="Cálculo de prazos do TJSP com a conta passo a passo."
        action={
          <Link href="/prazos/calendario" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <CalendarDays className="h-4 w-4" /> Calendário forense
          </Link>
        }
      />

      <p className="mb-6 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <Info className="h-4 w-4 shrink-0" />
        {DEADLINE_DISCLAIMER}
      </p>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <DeadlineCalculator
            key={initialProcessId}
            processes={options}
            initialProcessId={initialProcessId}
            canWrite={canWrite}
            demo={!isSupabaseConfigured()}
          />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle>Últimos cálculos</CardTitle>
              <p className="text-sm text-slate-500">Quem calculou, quando e o que foi decidido.</p>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <CalculationHistory items={history} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
