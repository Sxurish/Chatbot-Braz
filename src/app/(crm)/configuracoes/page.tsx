import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Configurações"
      description="Dados do escritório, integrações e parâmetros do chatbot."
      icon={Settings}
      roadmap={[
        "Dados institucionais e horário de atendimento",
        "Provedor de IA e modelo (OpenAI, Claude, Gemini, OpenRouter)",
        "Versão da política de privacidade e integrações",
      ]}
    />
  );
}
