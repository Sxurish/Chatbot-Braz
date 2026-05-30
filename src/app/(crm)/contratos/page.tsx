import { FileSignature } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Contratos"
      description="Instrumentos de contratação de honorários e prestação de serviços."
      icon={FileSignature}
      roadmap={[
        "Geração e envio de contrato de honorários",
        "Status: enviado, assinado, cancelado",
        "Vínculo com financeiro e formas de pagamento",
      ]}
    />
  );
}
