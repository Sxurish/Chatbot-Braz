import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { checkAdmin } from "@/lib/auth/require-admin";
import { getSettings, getIntegrationStatus } from "@/lib/data/settings";
import { OfficeForm } from "./office-form";
import { AiForm } from "./ai-form";
import { IntegrationsStatus } from "./integrations-status";

export default async function Page() {
  const [admin, settings] = await Promise.all([checkAdmin(), getSettings()]);
  const integrations = getIntegrationStatus(settings.ai_provider);
  const readOnly = !admin.ok;

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Dados do escritório, comportamento do chatbot e status das integrações."
      />

      {readOnly && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Você está visualizando em modo somente leitura. Apenas administradores
            podem editar estas configurações.
          </p>
        </div>
      )}

      <div className="space-y-6">
        <OfficeForm settings={settings} readOnly={readOnly} />
        <AiForm
          settings={settings}
          apiKeyConfigured={integrations.ai.has_api_key}
          readOnly={readOnly}
        />
        <IntegrationsStatus status={integrations} />
      </div>
    </>
  );
}
