import { FolderOpen } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Documentos"
      description="Arquivos vinculados a leads, clientes, casos e processos (Supabase Storage privado)."
      icon={FolderOpen}
      roadmap={[
        "Upload com validação de tipo e tamanho",
        "Categorização e status de revisão",
        "Storage privado protegido por autenticação",
      ]}
    />
  );
}
