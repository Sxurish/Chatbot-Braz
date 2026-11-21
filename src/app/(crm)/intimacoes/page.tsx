import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Info,
  LayoutList,
  Link2Off,
  Search,
  Table2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AiBadge, PublicationStatusBadge } from "@/components/intimacoes/badges";
import { countPublications, listPublications, parsePublicationFilters } from "@/lib/data/intimacoes";
import {
  SORT_LABELS,
  SORTS,
  actTypeOf,
  applyViewFilters,
  filterOptions,
  hasDoubt,
  intimacoesHref,
  parseViewOptions,
  sortForView,
  type PublicationSort,
} from "@/lib/intimacoes/list-view";
import type { CourtPublication } from "@/lib/intimacoes/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { brDay } from "@/lib/prazos/calendar";
import { DEADLINE_DISCLAIMER } from "@/lib/prazos/types";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

const label = "mb-1 block text-xs font-medium text-slate-600";

export default async function IntimacoesPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const filters = parsePublicationFilters({
    status: first(sp.status),
    vinculo: first(sp.vinculo),
    de: first(sp.de),
    ate: first(sp.ate),
  });
  const view = parseViewOptions(sp);
  const [fetched, counters] = await Promise.all([listPublications(filters), countPublications()]);
  const options = filterOptions(fetched);
  const items = sortForView(applyViewFilters(fetched, view), view.ordem);
  const filtered =
    filters.status !== "para_conferir" ||
    filters.vinculo ||
    filters.from ||
    filters.to ||
    view.q ||
    view.tribunal ||
    view.orgao ||
    view.tipo ||
    view.acao ||
    view.duvida ||
    view.cancelada;

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
          <form method="get" className="space-y-3">
            <input type="hidden" name="vista" value={view.vista} />
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                name="q"
                type="search"
                defaultValue={view.q ?? ""}
                placeholder="Buscar por número do processo, parte, cliente, vara ou trecho da intimação"
                className="pl-9"
                aria-label="Buscar intimações"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <OptionSelect id="tribunal" title="Tribunal" value={view.tribunal} values={options.tribunais} />
              <OptionSelect id="orgao" title="Órgão ou vara" value={view.orgao} values={options.orgaos} />
              <OptionSelect id="tipo" title="Tipo de ato" value={view.tipo} values={options.tipos} />
              <div>
                <label className={label} htmlFor="ordem">
                  Ordenar por
                </label>
                <Select id="ordem" name="ordem" defaultValue={view.ordem}>
                  {SORTS.map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
                <Check name="acao" checked={view.acao} text="Pede providência" />
                <Check name="duvida" checked={view.duvida} text="IA com dúvida" />
                <Check name="cancelada" checked={view.cancelada} text="Canceladas no DJEN" />
              </div>
              <div className="flex gap-2">
                {filtered && (
                  <Link
                    href={intimacoesHref({ vista: view.vista === "lista" ? "lista" : undefined }, {})}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-10")}
                  >
                    Limpar
                  </Link>
                )}
                <Button type="submit" size="sm" className="h-10">
                  Filtrar
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {items.length === 1 ? "1 intimação" : `${items.length} intimações`}
          {items.length !== fetched.length ? ` de ${fetched.length}` : ""}
        </p>
        <div className="hidden rounded-lg border border-slate-200 bg-white p-0.5 md:flex" role="group" aria-label="Modo de exibição">
          <ViewToggle sp={sp} target="tabela" active={view.vista === "tabela"} icon={<Table2 className="h-4 w-4" />} text="Tabela" />
          <ViewToggle sp={sp} target="lista" active={view.vista === "lista"} icon={<LayoutList className="h-4 w-4" />} text="Lista" />
        </div>
      </div>

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
        <>
          {view.vista === "tabela" && <PublicationTable items={items} sp={sp} sort={view.ordem} />}
          {/* No celular a tabela não cabe: fica sempre a lista. */}
          <div className={view.vista === "tabela" ? "md:hidden" : undefined}>
            <PublicationList items={items} />
          </div>
        </>
      )}
    </>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function OptionSelect({ id, title, value, values }: { id: string; title: string; value: string | null; values: string[] }) {
  // Mantém a opção escolhida mesmo se ela sumir da lista atual.
  const all = value && !values.includes(value) ? [value, ...values] : values;
  return (
    <div>
      <label className={label} htmlFor={id}>
        {title}
      </label>
      <Select id={id} name={id} defaultValue={value ?? ""}>
        <option value="">Todos</option>
        {all.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Check({ name, checked, text }: { name: string; checked: boolean; text: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
      />
      {text}
    </label>
  );
}

function ViewToggle({
  sp,
  target,
  active,
  icon,
  text,
}: {
  sp: SearchParams;
  target: "tabela" | "lista";
  active: boolean;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <Link
      href={intimacoesHref(sp, { vista: target === "lista" ? "lista" : null })}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-800"
      )}
    >
      {icon}
      {text}
    </Link>
  );
}

function ProcessCell({ p }: { p: CourtPublication }) {
  if (p.process_id) return <span className="font-medium text-slate-700">{p.process_title ?? p.process_number_masked}</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
      <Link2Off className="h-3 w-3" /> Sem processo no CRM
      {p.process_number_masked ? ` (${p.process_number_masked})` : ""}
    </span>
  );
}

function suggestion(p: CourtPublication): string | null {
  const r = p.ai_reading;
  if (!r?.suggestedDays || !r.suggestedUnit) return null;
  return `${r.suggestedDays} ${r.suggestedUnit === "uteis" ? "dias úteis" : "dias corridos"}${r.dobro ? " (em dobro)" : ""}`;
}

/** Cabeçalho que ordena ao clicar. A data alterna entre mais recentes e mais antigas. */
function SortHeader({
  sp,
  sort,
  text,
  asc,
  desc,
  className,
}: {
  sp: SearchParams;
  sort: PublicationSort;
  text: string;
  asc: PublicationSort;
  desc?: PublicationSort;
  className?: string;
}) {
  const active = sort === asc || sort === desc;
  const next = desc && sort === asc ? desc : asc;
  const Icon = !active ? ArrowUpDown : sort === desc ? ArrowDown : ArrowUp;
  return (
    <th scope="col" className={cn("px-3 py-2.5 text-left font-medium", className)} aria-sort={active ? (sort === desc ? "descending" : "ascending") : undefined}>
      <Link
        href={intimacoesHref(sp, { ordem: next })}
        className={cn("inline-flex items-center gap-1 hover:text-slate-900", active ? "text-slate-900" : "text-slate-500")}
      >
        {text}
        <Icon className="h-3.5 w-3.5" />
      </Link>
    </th>
  );
}

function PublicationTable({ items, sp, sort }: { items: CourtPublication[]; sp: SearchParams; sort: PublicationSort }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs md:block">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs">
          <tr>
            <SortHeader sp={sp} sort={sort} text="Disponib." asc="antigas" desc="recentes" className="w-28" />
            <th scope="col" className="px-3 py-2.5 text-left font-medium text-slate-500">
              Ato e resumo
            </th>
            <SortHeader sp={sp} sort={sort} text="Processo" asc="processo" />
            <SortHeader sp={sp} sort={sort} text="Tribunal / órgão" asc="tribunal" />
            <SortHeader sp={sp} sort={sort} text="Prazo sugerido" asc="prazo" className="w-36" />
            <th scope="col" className="w-44 px-3 py-2.5 text-left font-medium text-slate-500">
              Situação
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((p) => {
            const href = `/intimacoes/${p.id}`;
            return (
              <tr key={p.id} className="group align-top transition-colors hover:bg-slate-50">
                <td className="px-3 py-3 font-semibold whitespace-nowrap text-slate-900">
                  <Link href={href} className="hover:text-brand-primary">
                    {brDay(p.available_date)}
                  </Link>
                </td>
                <td className="max-w-md px-3 py-3">
                  <Link href={href} className="font-medium text-slate-900 group-hover:text-brand-primary">
                    {actTypeOf(p)}
                  </Link>
                  {p.ai_reading?.summary && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{p.ai_reading.summary}</p>}
                </td>
                <td className="px-3 py-3 text-xs">
                  <ProcessCell p={p} />
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">
                  <span className="block font-medium text-slate-700">{p.tribunal ?? "Sem tribunal"}</span>
                  {p.organ && <span className="line-clamp-2">{p.organ}</span>}
                </td>
                <td className="px-3 py-3 text-xs text-slate-700">{suggestion(p) ?? <span className="text-slate-400">Sem prazo</span>}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1 whitespace-nowrap">
                    <PublicationStatusBadge status={p.status} />
                    <AiBadge pub={p} />
                    {hasDoubt(p) && p.status === "para_conferir" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> IA com dúvida
                      </span>
                    )}
                    {p.cancelled && <span className="text-xs font-medium text-red-700">Cancelada no DJEN</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PublicationList({ items }: { items: CourtPublication[] }) {
  return (
    <ul className="space-y-3">
      {items.map((p) => {
        const s = suggestion(p);
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
                  {hasDoubt(p) && p.status === "para_conferir" && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> IA com dúvida
                    </span>
                  )}
                  {p.cancelled && <span className="text-xs font-medium text-red-700">Cancelada no DJEN</span>}
                </div>
                <p className="font-medium text-slate-900">{actTypeOf(p)}</p>
                {p.ai_reading?.summary && <p className="line-clamp-2 text-sm text-slate-600">{p.ai_reading.summary}</p>}
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{[p.tribunal, p.organ].filter(Boolean).join(" · ")}</span>
                  <ProcessCell p={p} />
                  {s && <span>Sugestão: {s}</span>}
                </p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-primary" />
            </Link>
          </li>
        );
      })}
    </ul>
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
