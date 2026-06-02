import { PageHeader } from "@/components/layout/page-header";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listProcesses } from "@/lib/data/fase6";
import { listCaseOptions } from "@/lib/data/fase6-options";
import { ProcessesClient } from "./processes-client";

export default async function ProcessesPage() {
  const [admin, processes, cases] = await Promise.all([
    checkAdmin(),
    listProcesses(),
    listCaseOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Processos"
        description="Processos judiciais e administrativos com acompanhamento de prazos."
      />
      <ProcessesClient
        processes={processes}
        cases={cases}
        isAdmin={admin.ok}
      />
    </>
  );
}
