import Link from "next/link";
import { Calculator } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listCalculations } from "@/lib/data/prazos";
import { CalculationHistory } from "./calculation-history";

/** Cartão "Prazos calculados" da página do processo. */
export async function ProcessDeadlinesCard({ processId }: { processId: string }) {
  const items = await listCalculations({ processId, limit: 10 });
  return (
    <Card>
      <CardHeader className="gap-3 space-y-0 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Prazos calculados</CardTitle>
          <Link
            href={`/prazos?processo=${encodeURIComponent(processId)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Calculator className="h-4 w-4" /> Calcular
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <CalculationHistory items={items} showProcess={false} emptyText="Nenhum prazo calculado neste processo." />
      </CardContent>
    </Card>
  );
}
