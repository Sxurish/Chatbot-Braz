import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Inbox, Info, Link2Off } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AiBadge, PublicationStatusBadge } from "@/components/intimacoes/badges";
import { countPublications, listPublications, parsePublicationFilters } from "@/lib/data/intimacoes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { brDay } from "@/lib/prazos/calendar";
import { DEADLINE_DISCLAIMER } from "@/lib/prazos/types";
import { cn } from "@/lib/utils";

type SearchParams = { status?: string; vinculo?: string; de?: string; ate?: string };

const label = "mb-1 block text-xs font-medium text-slate-600";

export default async function IntimacoesPage(props: { searchParams: Promise<SearchParams> }) {
  const filters = parsePublicationFilters(await props.searchParams);
  const [items, counters] = await Promise.all([listPublications(filters), countPublications()]);
  const filtered = filters.status !== "para_conferir" || filters.vinculo || filters.from || filters.to;

  return (
    <>
      <PageHeader
        title="Intimações"
        description="Intimações do DJEN em nome do Dr. Jean. Confira cada uma: só depois disso vira prazo."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Counter
          href="/intimacoes?status=para_conferir"
          icon={<Inbox className="h-4 w-4" />}
          label="Para conferir"
          value={counters.toReview}
          tone={counters.toReview > 0 ? "amber" : "slate"}
        />
        <Counter
          href="/intimacoes?status=confirmada"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Confirmadas hoje"
          value={counters.confirmedToday}
          tone="emerald"
        />
        <Counter
          href="/intimacoes?status=para_conferir&vinculo=sem"
          icon={<Link2Off className="h-4 w-4" />}
          label="Sem processo vinculado"
          value={counters.unlinked}
          tone={counters.unlinked > 0 ? "amber" : "slate"}
        />
      </div>

      <p className="mb-6 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <Info className="h-4 w-4 shrink-0" />
        {DEADLINE_DISCLAIMER}
      </p>

      <Card className="mb-4">
        <CardContent className="p-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
            <div>
              <label className={label} htmlFor="status">
                Situação
              </label>
              <Select id="status" name="status" defaultValue={filters.status}>
                <option value="para_conferir">Para conferir</option>
                <option value="confirmada">Confirmadas</option>
                <option value="descartada">Descartadas</option>
                <option value="todas">Todas</option>
              </Select>
            </div>
            <div>
              <label className={label} htmlFor="vinculo">
                Processo no CRM
              </label>
              <Select id="vinculo" name="vinculo" defaultValue={filters.vinculo ?? ""}>
                <option value="">Todos</option>
                <option value="com">Com processo vinculado</option>
                <option value="sem">Sem processo vinculado</option>
              </Select>
            </div>
            <div>
              <label className={label} htmlFor="de">
                Disponibilizada de
              </label>
              <Input id="de" name="de" type="date" defaultValue={filters.from ?? ""} />
            </div>
            <div>
              <label className={label} htmlFor="ate">
                até
              </label>
              <Input id="ate" name="ate" type="date" defaultValue={filters.to ?? ""} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="h-10">
                Filtrar
              </Button>
              {filtered && (
                <Link href="/intimacoes" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-10")}>
                  Limpar
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filters.status === "para_conferir" && !filtered ? "Nenhuma intimação para conferir" : "Nada encontrado"}
          description={
            isSupabaseConfigured()
              ? "As intimações do DJEN entram sozinhas, de hora em hora."
              : "Modo demonstração: configure o Supabase para buscar as intimações do DJEN."
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((p) => {
            const r = p.ai_reading;
            const doubt = (r?.uncertain?.length ?? 0) > 0 || r?.confidence === "baixa";
            return (
              <li key={p.id}>
                <Link
                  href={`/intimacoes/${p.id}`}
                  className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-brand-primary/40"
                >
                  <div className="w-20 shrink-0 text-center">
                    <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Disponib.</p>
                    <p className="text-sm font-semibold text-slate-900">{brDay(p.available_date)}</p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PublicationStatusBadge status={p.status} />
                      <AiBadge pub={p} />
                      {doubt && p.status === "para_conferir" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" /> IA com dúvida
                        </span>
                      )}
                      {p.cancelled && <span className="text-xs font-medium text-red-700">Cancelada no DJEN</span>}
                    </div>
                    <p className="font-medium text-slate-900">
                      {r?.actType || [p.kind, p.document_type].filter(Boolean).join(" · ") || "Intimação"}
                    </p>
                    {r?.summary && <p className="line-clamp-2 text-sm text-slate-600">{r.summary}</p>}
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{[p.tribunal, p.organ].filter(Boolean).join(" · ")}</span>
                      {p.process_id ? (
                        <span className="font-medium text-slate-700">Processo {p.process_title ?? p.process_number_masked}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                          <Link2Off className="h-3 w-3" /> Sem processo no CRM
                          {p.process_number_masked ? ` (${p.process_number_masked})` : ""}
                        </span>
                      )}
                      {r?.suggestedDays && r.suggestedUnit && (
                        <span>
                          Sugestão: {r.suggestedDays} {r.suggestedUnit === "uteis" ? "dias úteis" : "dias corridos"}
                          {r.dobro ? " (em dobro)" : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-primary" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const TONES = {
  amber: "text-amber-700 bg-amber-50",
  emerald: "text-emerald-700 bg-emerald-50",
  slate: "text-slate-500 bg-slate-100",
} as const;

function Counter({
  href,
  icon,
  label,
  value,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: keyof typeof TONES;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-brand-primary/40"
    >
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", TONES[tone])}>{icon}</span>
      <span>
        <span className="block text-2xl leading-none font-semibold text-slate-900">{value}</span>
        <span className="text-sm text-slate-500">{label}</span>
      </span>
    </Link>
  );
}
