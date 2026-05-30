import { Bell } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Notificações"
      description="Alertas internos: novo lead, lead urgente, documento enviado, prazos e mais."
      icon={Bell}
      roadmap={[
        "Notificações dentro do dashboard",
        "Integração futura: e-mail, WhatsApp, Telegram, Slack",
        "Automação via n8n",
      ]}
    />
  );
}
