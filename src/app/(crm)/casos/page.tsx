import { Briefcase } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Casos"
      description="Demandas jurídicas específicas vinculadas a leads ou clientes."
      icon={Briefcase}
      roadmap={[
        "Criação de caso a partir de um lead",
        "Status jurídico e responsável por caso",
        "Vínculo com processos, documentos e tarefas",
      ]}
    />
  );
}
