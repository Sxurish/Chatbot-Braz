import { PageHeader } from "@/components/layout/page-header";
import { AdminOnly } from "@/components/layout/admin-only";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listContracts } from "@/lib/data/fase6";
import { listCaseOptions, listClientOptions } from "@/lib/data/fase6-options";
import { ContractsClient } from "./contracts-client";

export default async function ContractsPage() {
  // Contratos: só Admin (a mesma regra vale no banco, via RLS).
  const admin = await checkAdmin();
  if (!admin.ok) return <AdminOnly title="Contratos" />;

  const [contracts, clients, cases] = await Promise.all([
    listContracts(),
    listClientOptions(),
    listCaseOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Contratos"
        description="Instrumentos de contratação de honorários e prestação de serviços."
      />
      <ContractsClient
        contracts={contracts}
        clients={clients}
        cases={cases}
        isAdmin={admin.ok}
      />
    </>
  );
}
