import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listKnowledge } from "@/lib/data/knowledge";
import { KnowledgeList } from "./knowledge-list";

export default async function Page() {
  const [admin, entries] = await Promise.all([checkAdmin(), listKnowledge()]);
  const canEdit = admin.ok;

  return (
    <>
      <PageHeader
        title="Base de conhecimento"
        description="Mensagens padrão, documentos por área e glossário consumidos pelo chatbot."
      />

      {!canEdit && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Você está visualizando em modo somente leitura. Apenas administradores
            podem editar a base de conhecimento.
          </p>
        </div>
      )}

      <KnowledgeList entries={entries} canEdit={canEdit} />
    </>
  );
}
