import { Wallet } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Financeiro"
      description="Gestão de honorários, cobranças, pagamentos e relatórios financeiros."
      icon={Wallet}
      roadmap={[
        "Controle de honorários e parcelamentos",
        "Status financeiro por cliente/contrato",
        "Receita prevista e relatórios",
      ]}
    />
  );
}
