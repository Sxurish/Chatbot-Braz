import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { FunnelResult } from "@/lib/metrics-funnel";

interface FunnelCardProps {
  title: string;
  description: string;
  funnel: FunnelResult;
  /** Mostra a linha "perdidos" ao lado do total. */
  showLost?: boolean;
}

export function FunnelCard({
  title,
  description,
  funnel,
  showLost,
}: FunnelCardProps) {
  const max = funnel.steps[0]?.count ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-slate-900">
              {funnel.total}
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Total
            </p>
            {showLost && funnel.lost > 0 && (
              <p className="mt-1 text-xs text-red-600">
                {funnel.lost} perdidos / não qualificados
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {funnel.total === 0 ? (
          <EmptyState
            title="Sem dados ainda"
            description="O funil aparecerá conforme os leads forem progredindo nas etapas."
          />
        ) : (
          <ul className="space-y-3">
            {funnel.steps.map((step, i) => {
              const widthPct = max ? Math.round((step.count / max) * 100) : 0;
              return (
                <li key={step.key}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-800">
                      {step.label}
                    </span>
                    <span className="text-slate-600">
                      <strong className="text-slate-900">{step.count}</strong>
                      <span className="ml-1 text-xs text-slate-500">
                        ({step.pctTotal}% do total
                        {i > 0 && step.pctPrev < 100
                          ? ` · ${step.pctPrev}% vs anterior`
                          : ""}
                        )
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-primary transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
