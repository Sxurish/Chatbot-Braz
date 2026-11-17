import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiBadge } from "@/components/intimacoes/badges";
import { listProcessPublicationsToReview } from "@/lib/data/intimacoes";
import { brDay } from "@/lib/prazos/calendar";

/** Cartão "Intimações para conferir" da página do processo. Some quando não há nenhuma. */
export async function ProcessPublicationsCard({ processId }: { processId: string }) {
  const items = await listProcessPublicationsToReview(processId);
  if (items.length === 0) return null;
  return (
    <Card className="border-amber-200">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Intimações para conferir
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{items.length}</span>
        </CardTitle>
        <p className="text-sm text-slate-500">Chegaram pelo DJEN. Só viram prazo depois da conferência.</p>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {items.map((p) => (
            <li key={p.id}>
              <Link href={`/intimacoes/${p.id}`} className="group flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50">
                <span className="w-12 shrink-0 font-medium text-slate-900">{brDay(p.available_date).slice(0, 5)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-900">
                    {p.ai_reading?.actType || [p.kind, p.document_type].filter(Boolean).join(" · ") || "Intimação"}
                  </span>
                  <AiBadge pub={p} className="mt-1" />
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-primary" />
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/intimacoes" className="mt-3 inline-block text-sm text-brand-primary hover:underline">
          Ver todas as intimações
        </Link>
      </CardContent>
    </Card>
  );
}
