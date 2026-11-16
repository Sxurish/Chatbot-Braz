import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { checkAdmin } from "@/lib/auth/require-admin";
import { getSettings, getIntegrationStatus } from "@/lib/data/settings";
import { OfficeForm } from "./office-form";
import { AiForm } from "./ai-form";
import { IntegrationsStatus } from "./integrations-status";
import { AssistantForm } from "./assistant-form";
import { isAssistantConfigured } from "@/lib/assistant/config";
import { AssistantSetupError, getMonthSpendUsd } from "@/lib/assistant/store";
import { DigestSettings } from "./digest-settings";
import { listDigestRecipients } from "@/lib/digest/recipients";
import { digestTemplateConfig } from "@/lib/digest/whatsapp-template";

async function readMonthSpend(): Promise<{ spent: number | null; setupMissing: boolean }> {
  try {
    return { spent: await getMonthSpendUsd(), setupMissing: false };
  } catch (err) {
    return { spent: null, setupMissing: err instanceof AssistantSetupError };
  }
}

export const dynamic = "force-dynamic";

export default async function Page() {
  const [admin, settings] = await Promise.all([checkAdmin(), getSettings()]);
  const integrations = getIntegrationStatus(settings.ai_provider);
  const readOnly = !admin.ok;
  const spend = admin.ok ? await readMonthSpend() : { spent: null, setupMissing: false };
  // Resumo diário: só o Admin vê quem recebe e os números (mascarados).
  const digestRecipients = admin.ok ? await listDigestRecipients() : null;
  const template = digestTemplateConfig();

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
        <AssistantForm
          settings={settings}
          apiKeyConfigured={isAssistantConfigured()}
          monthSpendUsd={spend.spent}
          setupMissing={spend.setupMissing}
          readOnly={readOnly}
        />
        {digestRecipients && (
          <DigestSettings
            recipients={digestRecipients.recipients}
            setupMissing={digestRecipients.setupMissing}
            whatsappConfigured={template.configured}
            cronConfigured={Boolean(process.env.CRON_SECRET)}
            templateName={template.name}
            templateLang={template.lang}
          />
        )}
        <IntegrationsStatus status={integrations} />
      </div>
    </>
  );
}
