import { Scale } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Processos"
      description="Gestão processual: processos judiciais e administrativos com acompanhamento."
      icon={Scale}
      roadmap={[
        "Cadastro de número, vara, comarca e classe",
        "Controle de prazos e próximas movimentações",
        "Integração futura com tribunais (TJSP, STJ, STF)",
      ]}
    />
  );
}
