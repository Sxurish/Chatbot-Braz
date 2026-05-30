import { BarChart3 } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Métricas"
      description="Painel de performance: funil comercial, funil jurídico e conversões."
      icon={BarChart3}
      roadmap={[
        "Funil comercial e jurídico detalhados",
        "Tempo médio de resposta por responsável",
        "Análise de origem e área mais procurada",
      ]}
    />
  );
}
