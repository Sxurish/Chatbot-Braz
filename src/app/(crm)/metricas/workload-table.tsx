import { AlertTriangle, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  STALE_THRESHOLD_DAYS,
  type WorkloadRow,
} from "@/lib/metrics-funnel";

export function WorkloadTable({ rows }: { rows: WorkloadRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Carga por responsável</CardTitle>
        <CardDescription>
          Distribuição atual dos leads atribuídos. Leads parados há mais de{" "}
          {STALE_THRESHOLD_DAYS} dias em etapas iniciais merecem follow-up.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <EmptyState
            title="Sem leads atribuídos"
            description="A distribuição aparecerá conforme os leads forem direcionados à equipe."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Responsável</th>
                  <th className="py-2 pr-3 text-right font-medium">Leads</th>
                  <th className="py-2 pr-3 text-right font-medium">Urgentes</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Parados +{STALE_THRESHOLD_DAYS}d
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.userId ?? "none"}>
                    <td className="py-2.5 pr-3 font-medium text-slate-800">
                      {r.userId ? (
                        r.name
                      ) : (
                        <span className="text-slate-500">{r.name}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">
                      {r.total}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {r.urgent > 0 ? (
                        <span className="inline-flex items-center justify-end gap-1 text-red-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {r.urgent}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {r.stale > 0 ? (
                        <span className="inline-flex items-center justify-end gap-1 text-amber-600">
                          <Clock className="h-3.5 w-3.5" />
                          {r.stale}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
