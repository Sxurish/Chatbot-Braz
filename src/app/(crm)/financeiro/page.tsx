import { Wallet, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaymentStatusBadge } from "@/components/crm/status-badge";
import { listContracts, listPayments } from "@/lib/data/fase6";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function FinancePage() {
  const [payments, contracts] = await Promise.all([
    listPayments(),
    listContracts(),
  ]);

  const recebido = payments
    .filter((p) => p.status === "pago")
    .reduce((s, p) => s + p.amount, 0);
  const aReceber = payments
    .filter((p) => p.status === "pendente")
    .reduce((s, p) => s + p.amount, 0);
  const atrasado = payments
    .filter((p) => p.status === "atrasado")
    .reduce((s, p) => s + p.amount, 0);
  const previsto = contracts
    .filter((c) => c.status === "assinado" || c.status === "enviado")
    .reduce((s, c) => s + (c.value ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Honorários, cobranças e pagamentos vinculados a contratos e clientes."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Recebido"
          value={formatCurrency(recebido)}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard label="A receber" value={formatCurrency(aReceber)} icon={Wallet} />
        <StatCard
          label="Em atraso"
          value={formatCurrency(atrasado)}
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Receita prevista"
          value={formatCurrency(previsto)}
          icon={TrendingUp}
          tone="gold"
        />
      </div>

      <h3 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Pagamentos</h3>
      {payments.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhum pagamento registrado" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Vencimento</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.description ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.due_date ? formatDate(p.due_date) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
