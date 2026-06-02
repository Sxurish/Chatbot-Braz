import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listTemplates } from "@/lib/data/templates-read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { TemplatesList } from "./templates-list";

export default async function Page() {
  const admin = await checkAdmin();

  if (!admin.ok) {
    return (
      <>
        <PageHeader
          title="Templates de documentos"
          description="Modelos .docx com placeholders para geração automatizada."
        />
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={ShieldAlert}
              title="Acesso restrito"
              description="Apenas administradores podem gerenciar templates."
            />
          </CardContent>
        </Card>
      </>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader
          title="Templates de documentos"
          description="Modelos .docx com placeholders para geração automatizada."
        />
        <Card>
          <CardContent className="py-12">
            <EmptyState
              title="Modo demonstração"
              description="Configure o Supabase e crie o bucket privado document_templates para gerenciar templates."
            />
          </CardContent>
        </Card>
      </>
    );
  }

  const templates = await listTemplates();

  return (
    <>
      <PageHeader
        title="Templates de documentos"
        description="Modelos .docx com placeholders ({{cliente.nome}}, {{lead.area}}, etc.) usados na geração automatizada."
      />
      <TemplatesList templates={templates} />
    </>
  );
}
