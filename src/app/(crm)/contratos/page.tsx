import { Plus, FileSignature } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ContractStatusBadge } from "@/components/crm/status-badge";
import { listContracts } from "@/lib/data/fase6";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function ContractsPage() {
  const contracts = await listContracts();
  const totalAssinado = contracts
    .filter((c) => c.status === "assinado")
    .reduce((sum, c) => sum + (c.value ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Contratos"
        description="Instrumentos de contratação de honorários e prestação de serviços."
        action={
          <Button>
            <Plus className="h-4 w-4" /> Novo contrato
          </Button>
        }
      />

      {contracts.length === 0 ? (
        <EmptyState icon={FileSignature} title="Nenhum contrato cadastrado" />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span className="rounded-lg border border-slate-200 bg-white px-4 py-2">
              <span className="text-slate-500">Contratos: </span>
              <span className="font-semibold text-slate-900">{contracts.length}</span>
            </span>
            <span className="rounded-lg border border-slate-200 bg-white px-4 py-2">
              <span className="text-slate-500">Valor assinado: </span>
              <span className="font-semibold text-emerald-600">
                {formatCurrency(totalAssinado)}
              </span>
            </span>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Condições</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Assinado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contracts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {c.contract_type ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatCurrency(c.value)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {c.payment_terms ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ContractStatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {c.signed_at ? formatDate(c.signed_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
