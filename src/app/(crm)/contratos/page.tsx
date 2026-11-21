import { PageHeader } from "@/components/layout/page-header";
import { AdminOnly } from "@/components/layout/admin-only";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listContracts } from "@/lib/data/fase6";
import { listCaseOptions, listClientOptions } from "@/lib/data/fase6-options";
import type { RawParams } from "@/lib/list-params";
import {
  CONTRACT_SORTS,
  CONTRACT_SORT_LABELS,
  buildContractRows,
  contractFilterOptions,
  filterContractRows,
  hasContractFilters,
  parseContractOptions,
  sortContractRows,
} from "@/lib/list-views/contratos";
import { ContractsClient } from "./contracts-client";

export default async function ContractsPage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  // Contratos: só Admin (a mesma regra vale no banco, via RLS).
  const admin = await checkAdmin();
  if (!admin.ok) return <AdminOnly title="Contratos" />;

  const [contracts, clients, cases] = await Promise.all([
    listContracts(),
    listClientOptions(),
    listCaseOptions(),
  ]);

  const view = parseContractOptions(sp);
  const all = buildContractRows(
    contracts,
    new Map(clients.map((c) => [c.id, c.label])),
    new Map(cases.map((c) => [c.id, c.label]))
  );
  const options = contractFilterOptions(all);
  const rows = sortContractRows(filterContractRows(all, view), view.ordem);

  return (
    <>
      <PageHeader
        title="Contratos"
        description="Instrumentos de contratação de honorários e prestação de serviços."
      />
      <ContractsClient
        contracts={contracts}
        rows={rows}
        clients={clients}
        cases={cases}
        isAdmin={admin.ok}
        sp={sp}
        ordem={view.ordem}
        toolbar={
          contracts.length > 0 ? (
            <ListToolbar
              path="/contratos"
              search={{ value: view.q, placeholder: "Buscar por cliente, caso, tipo ou condições" }}
              selects={[
                { name: "status", label: "Status", value: view.status, options: options.status },
                { name: "tipo", label: "Tipo", value: view.tipo, options: options.tipos },
              ]}
              sort={{
                value: view.ordem,
                options: CONTRACT_SORTS.map((s) => ({ value: s, label: CONTRACT_SORT_LABELS[s] })),
              }}
              active={hasContractFilters(view)}
              count={{ shown: rows.length, total: contracts.length, singular: "contrato", plural: "contratos" }}
            />
          ) : null
        }
      />
    </>
  );
}
