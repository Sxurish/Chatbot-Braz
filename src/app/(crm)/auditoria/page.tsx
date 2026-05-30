import { ScrollText } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Logs de auditoria"
      description="Registro de ações importantes realizadas pela equipe no sistema."
      icon={ScrollText}
      roadmap={[
        "Registro de ação, entidade e usuário",
        "Metadados e carimbo de data/hora",
        "Filtros por usuário e tipo de ação",
      ]}
    />
  );
}
