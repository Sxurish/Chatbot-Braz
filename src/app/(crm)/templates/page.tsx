import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listTemplates } from "@/lib/data/templates-read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ListToolbar } from "@/components/crm/list-toolbar";
import type { RawParams } from "@/lib/list-params";
import { optionsOf } from "@/lib/list-views/common";
import {
  TEMPLATE_SORT_LABELS,
  TEMPLATE_SORTS,
  TEMPLATE_STATES,
  TEMPLATE_STATE_LABELS,
  filterTemplates,
  isTemplateViewFiltered,
  parseTemplateView,
  sortTemplates,
  templateCategoryOptions,
} from "@/lib/list-views/templates";
import { TemplatesList } from "./templates-list";

export default async function Page(props: { searchParams: Promise<RawParams> }) {
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

  const sp = await props.searchParams;
  const all = await listTemplates();
  const view = parseTemplateView(sp);
  const templates = sortTemplates(filterTemplates(all, view), view.ordem);

  return (
    <>
      <PageHeader
        title="Templates de documentos"
        description="Modelos .docx com placeholders ({{cliente.nome}}, {{lead.area}}, etc.) usados na geração automatizada."
      />
      {all.length > 0 && (
        <ListToolbar
          path="/templates"
          search={{ value: view.q, placeholder: "Buscar por nome ou descrição" }}
          selects={[
            {
              name: "categoria",
              label: "Categoria",
              value: view.categoria,
              options: templateCategoryOptions(all),
              allLabel: "Todas",
            },
            {
              name: "situacao",
              label: "Situação",
              value: view.situacao,
              options: optionsOf(TEMPLATE_STATES, TEMPLATE_STATE_LABELS),
              allLabel: "Ativos e inativos",
            },
          ]}
          sort={{ value: view.ordem, options: optionsOf(TEMPLATE_SORTS, TEMPLATE_SORT_LABELS) }}
          active={isTemplateViewFiltered(view)}
          count={{ shown: templates.length, total: all.length, singular: "template", plural: "templates" }}
        />
      )}
      <TemplatesList templates={templates} filtered={all.length > 0} />
    </>
  );
}
