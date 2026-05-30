import { ScrollText } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Políticas e consentimentos"
      description="Registros de consentimento LGPD e solicitações de titulares de dados."
      icon={ScrollText}
      roadmap={[
        "Histórico de consentimentos (data, política, canal, IP)",
        "Solicitações de exclusão, correção e exportação",
        "Status: recebida, em análise, concluída, negada",
      ]}
    />
  );
}
