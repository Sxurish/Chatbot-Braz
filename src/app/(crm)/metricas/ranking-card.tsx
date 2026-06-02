import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { RankingItem } from "@/lib/metrics-funnel";

interface RankingCardProps {
  title: string;
  description: string;
  items: RankingItem[];
}

export function RankingCard({ title, description, items }: RankingCardProps) {
  const max = items[0]?.count ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title="Sem dados"
            description="O ranking aparecerá conforme os leads forem cadastrados."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item, i) => {
              const widthPct = max ? Math.round((item.count / max) * 100) : 0;
              return (
                <li key={item.key}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">
                        {i + 1}
                      </span>
                      {item.label}
                    </span>
                    <span className="text-slate-600">
                      <strong className="text-slate-900">{item.count}</strong>
                      <span className="ml-1 text-xs text-slate-500">
                        ({item.pct}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-gold"
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
