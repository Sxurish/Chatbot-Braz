import { UserCheck } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Clientes"
      description="Pessoas que contrataram o escritório, convertidas a partir de leads."
      icon={UserCheck}
      roadmap={[
        "Conversão de lead em cliente (botão na página do lead)",
        "Cadastro de CPF/CNPJ e dados de contratação",
        "Vínculo com casos, processos e contratos",
      ]}
    />
  );
}
