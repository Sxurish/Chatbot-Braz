import { MessagesSquare } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Conversas"
      description="Histórico completo das conversas do chatbot por sessão."
      icon={MessagesSquare}
      roadmap={[
        "Listagem de conversas por lead e canal",
        "Intenção, área e urgência detectadas por mensagem",
        "Registro de handoff para atendimento humano",
      ]}
    />
  );
}
