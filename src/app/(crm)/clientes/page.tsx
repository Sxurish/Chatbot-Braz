import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { listClients } from "@/lib/data/fase6";
import { formatDate, getInitials } from "@/lib/utils";
import { canWriteRecords } from "@/lib/data/cadastros-options";
import { ListToolbar } from "@/components/crm/list-toolbar";
import type { RawParams } from "@/lib/list-params";
import {
  CLIENT_SORTS,
  CLIENT_SORT_LABELS,
  CLIENT_STATUS_LABELS,
  clientFiltersActive,
  clientPlaceOptions,
  filterClients,
  parseClientOptions,
  sortClients,
} from "@/lib/list-views/clientes";
import { NewClientButton } from "./new-client-button";

const toOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }));

export default async function ClientsPage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  const [clients, canWrite] = await Promise.all([listClients(), canWriteRecords()]);
  const places = clientPlaceOptions(clients);
  const o = parseClientOptions(sp, places);
  const shown = sortClients(filterClients(clients, o), o.ordem);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Pessoas que contrataram o escritório: convertidas a partir de leads ou cadastradas direto."
        action={canWrite ? <NewClientButton /> : undefined}
      />

      {clients.length > 0 && (
        <ListToolbar
          path="/clientes"
          search={{ value: o.q, placeholder: "Buscar por nome, telefone, e-mail, CPF/CNPJ ou cidade..." }}
          selects={[
            {
              name: "status",
              label: "Situação",
              value: o.status,
              options: Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
              allLabel: "Todas",
            },
            { name: "uf", label: "UF", value: o.uf, options: toOptions(places.ufs), allLabel: "Todas" },
            { name: "cidade", label: "Cidade", value: o.cidade, options: toOptions(places.cidades), allLabel: "Todas" },
          ]}
          sort={{ value: o.ordem, options: CLIENT_SORTS.map((v) => ({ value: v, label: CLIENT_SORT_LABELS[v] })) }}
          active={clientFiltersActive(o)}
          count={{ shown: shown.length, total: clients.length, singular: "cliente", plural: "clientes" }}
        />
      )}

      {clients.length === 0 ? (
        <EmptyState
          title="Nenhum cliente ainda"
          description="Converta um lead em cliente pela página do lead ou use “Novo cliente”."
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado" description="Ajuste a busca ou os filtros." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {shown.map((c) => (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className="group flex items-center justify-between p-4 transition-colors hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <Avatar fallback={getInitials(c.full_name)} />
                <div>
                  <p className="font-medium text-slate-900 group-hover:text-brand-primary group-hover:underline">
                    {c.full_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.email ?? c.phone ?? "—"}
                    {c.city ? ` • ${c.city}/${c.state}` : ""}
                    {c.cpf_cnpj ? ` • ${c.cpf_cnpj}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  className={
                    c.status === "ativo"
                      ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }
                >
                  {c.status === "ativo" ? "Ativo" : "Inativo"}
                </Badge>
                <span className="hidden text-xs text-slate-400 sm:inline">
                  Cliente desde {formatDate(c.created_at)}
                </span>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
