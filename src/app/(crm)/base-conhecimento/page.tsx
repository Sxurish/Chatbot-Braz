import { BookOpen } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Base de conhecimento"
      description="Informações institucionais consultadas pelo chatbot (FAQ, áreas, documentos por área, mensagens padrão)."
      icon={BookOpen}
      roadmap={[
        "Cadastro de FAQ e mensagens padrão",
        "Documentos necessários por área jurídica",
        "Regras de handoff e de urgência editáveis",
      ]}
    />
  );
}
