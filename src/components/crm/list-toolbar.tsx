import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { hrefWith, type RawParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";

/**
 * Barra comum de busca, filtros e ordenação das listas do CRM.
 * É um formulário GET: os filtros vão para a URL e a página (servidor) filtra.
 * Os nomes dos campos são os parâmetros da URL.
 */

export interface ToolbarOption {
  value: string;
  label: string;
}

export interface ToolbarSelect {
  name: string;
  label: string;
  value: string | null;
  options: ToolbarOption[];
  /** Rótulo da opção vazia. Padrão: "Todos". */
  allLabel?: string;
}

export interface ToolbarCheck {
  name: string;
  label: string;
  checked: boolean;
}

export interface ListToolbarProps {
  /** Caminho da página (ex.: "/clientes"). */
  path: string;
  search?: { value: string | null; placeholder: string };
  selects?: ToolbarSelect[];
  /** Campos de data (de/até), por exemplo. */
  dates?: { name: string; label: string; value: string | null }[];
  checks?: ToolbarCheck[];
  sort?: { value: string; options: ToolbarOption[] };
  /** Parâmetros que o formulário deve manter (ex.: modo de exibição). */
  hidden?: Record<string, string | null>;
  /** Há algum filtro diferente do padrão? Mostra o botão Limpar. */
  active: boolean;
  /** Quantos aparecem e quantos há no total. */
  count?: { shown: number; total: number; singular: string; plural: string };
}

const label = "mb-1 block text-xs font-medium text-slate-600";

export function ListToolbar({ path, search, selects = [], dates = [], checks = [], sort, hidden = {}, active, count }: ListToolbarProps) {
  const keep = Object.fromEntries(Object.entries(hidden).filter(([, v]) => v)) as Record<string, string>;
  const fields = selects.length + dates.length + (sort ? 1 : 0);
  return (
    <div className="mb-4 space-y-3">
      <Card>
        <CardContent className="p-4">
          <form method="get" action={path} className="space-y-3">
            {Object.entries(keep).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            {search && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  name="q"
                  type="search"
                  defaultValue={search.value ?? ""}
                  placeholder={search.placeholder}
                  className="pl-9"
                  aria-label={search.placeholder}
                />
              </div>
            )}
            {fields > 0 && (
              <div className={cn("grid gap-3 sm:grid-cols-2", fields >= 3 && "lg:grid-cols-4")}>
                {selects.map((s) => {
                  // Mantém a opção escolhida mesmo se ela não estiver mais na lista.
                  const opts =
                    s.value && !s.options.some((o) => o.value === s.value)
                      ? [{ value: s.value, label: s.value }, ...s.options]
                      : s.options;
                  return (
                    <div key={s.name}>
                      <label className={label} htmlFor={`f-${s.name}`}>
                        {s.label}
                      </label>
                      <Select id={`f-${s.name}`} name={s.name} defaultValue={s.value ?? ""}>
                        <option value="">{s.allLabel ?? "Todos"}</option>
                        {opts.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
                {dates.map((d) => (
                  <div key={d.name}>
                    <label className={label} htmlFor={`f-${d.name}`}>
                      {d.label}
                    </label>
                    <Input id={`f-${d.name}`} name={d.name} type="date" defaultValue={d.value ?? ""} />
                  </div>
                ))}
                {sort && (
                  <div>
                    <label className={label} htmlFor="f-ordem">
                      Ordenar por
                    </label>
                    <Select id="f-ordem" name="ordem" defaultValue={sort.value}>
                      {sort.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
                {checks.map((c) => (
                  <label key={c.name} className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      name={c.name}
                      value="1"
                      defaultChecked={c.checked}
                      className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                {active && (
                  <Link href={hrefWith(path, keep, {})} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-10")}>
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
      {count && (
        <p className="text-sm text-slate-500">
          {count.shown === 1 ? `1 ${count.singular}` : `${count.shown} ${count.plural}`}
          {count.shown !== count.total ? ` de ${count.total}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * Título de coluna que ordena ao clicar. Com `desc`, alterna entre os dois
 * sentidos (ex.: mais antigos / mais recentes).
 */
export function SortHeader({
  path,
  sp,
  current,
  text,
  asc,
  desc,
  className,
}: {
  path: string;
  sp: RawParams;
  current: string;
  text: string;
  asc: string;
  desc?: string;
  className?: string;
}) {
  const active = current === asc || current === desc;
  const next = desc && current === asc ? desc : asc;
  const Icon = !active ? ArrowUpDown : current === desc ? ArrowDown : ArrowUp;
  return (
    <th
      scope="col"
      className={cn("px-3 py-2.5 text-left font-medium", className)}
      aria-sort={active ? (current === desc ? "descending" : "ascending") : undefined}
    >
      <Link
        href={hrefWith(path, sp, { ordem: next })}
        className={cn("inline-flex items-center gap-1 hover:text-slate-900", active ? "text-slate-900" : "text-slate-500")}
      >
        {text}
        <Icon className="h-3.5 w-3.5" />
      </Link>
    </th>
  );
}
