import { Wallet, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listContracts, listPayments } from "@/lib/data/fase6";
import {
  listClientOptions,
  listContractOptions,
} from "@/lib/data/fase6-options";
import { formatCurrency } from "@/lib/utils";
import { PaymentsClient } from "./payments-client";

export default async function FinancePage() {
  const [admin, payments, contracts, contractOptions, clientOptions] =
    await Promise.all([
      checkAdmin(),
      listPayments(),
      listContracts(),
      listContractOptions(),
      listClientOptions(),
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

      <PaymentsClient
        payments={payments}
        contracts={contractOptions}
        clients={clientOptions}
        isAdmin={admin.ok}
      />
    </>
  );
}
