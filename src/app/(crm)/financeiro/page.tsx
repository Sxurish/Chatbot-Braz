import { Wallet, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { AdminOnly } from "@/components/layout/admin-only";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listContracts, listPayments } from "@/lib/data/fase6";
import {
  listClientOptions,
  listContractOptions,
} from "@/lib/data/fase6-options";
import { formatCurrency } from "@/lib/utils";
import type { RawParams } from "@/lib/list-params";
import { spDay } from "@/lib/list-views/dates";
import {
  PAYMENT_SORTS,
  PAYMENT_SORT_LABELS,
  buildPaymentRows,
  filterPaymentRows,
  hasPaymentFilters,
  parsePaymentOptions,
  paymentFilterOptions,
  sortPaymentRows,
} from "@/lib/list-views/pagamentos";
import { PaymentsClient } from "./payments-client";

export default async function FinancePage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  // Financeiro: só Admin (a mesma regra vale no banco, via RLS).
  const admin = await checkAdmin();
  if (!admin.ok) return <AdminOnly title="Financeiro" />;

  const [payments, contracts, contractOptions, clientOptions] =
    await Promise.all([
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

  const view = parsePaymentOptions(sp);
  const all = buildPaymentRows(
    payments,
    new Map(clientOptions.map((c) => [c.id, c.label])),
    new Map(contractOptions.map((c) => [c.id, c.label]))
  );
  const options = paymentFilterOptions(all);
  const rows = sortPaymentRows(filterPaymentRows(all, view, spDay(new Date()) ?? ""), view.ordem);

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
        rows={rows}
        contracts={contractOptions}
        clients={clientOptions}
        isAdmin={admin.ok}
        sp={sp}
        ordem={view.ordem}
        toolbar={
          payments.length > 0 ? (
            <ListToolbar
              path="/financeiro"
              search={{ value: view.q, placeholder: "Buscar por descrição, cliente ou contrato" }}
              selects={[
                { name: "status", label: "Status", value: view.status, options: options.status },
                { name: "cliente", label: "Cliente", value: view.cliente, options: options.clientes },
              ]}
              dates={[
                { name: "de", label: "Vencimento de", value: view.de },
                { name: "ate", label: "Vencimento até", value: view.ate },
              ]}
              checks={[{ name: "vencidos", label: "Só vencidos e não pagos", checked: view.vencidos }]}
              sort={{
                value: view.ordem,
                options: PAYMENT_SORTS.map((s) => ({ value: s, label: PAYMENT_SORT_LABELS[s] })),
              }}
              active={hasPaymentFilters(view)}
              count={{ shown: rows.length, total: payments.length, singular: "pagamento", plural: "pagamentos" }}
            />
          ) : null
        }
      />
    </>
  );
}
