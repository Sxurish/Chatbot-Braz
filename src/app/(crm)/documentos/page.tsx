import { FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listDocuments } from "@/lib/data/documents-read";
import type { DocumentCategory } from "@/lib/types";
import type {
  LinkFilter,
  ReviewStatus,
} from "@/lib/data/documents-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DocumentsFilters } from "./documents-filters";
import { DocumentsList } from "./documents-list";

const VALID_CATEGORIES: DocumentCategory[] = [
  "documento_pessoal",
  "contrato",
  "comprovante",
  "intimacao",
  "processo",
  "prova",
  "laudo",
  "certidao",
  "decisao",
  "procuracao",
  "honorarios",
  "outros",
];

const VALID_REVIEW: ReviewStatus[] = ["pendente", "revisado", "rejeitado"];

const VALID_LINK: LinkFilter[] = ["lead", "client", "case", "process", "none"];

interface SearchParams {
  searchParams: {
    page?: string;
    q?: string;
    category?: string;
    review?: string;
    link?: string;
  };
}

export default async function Page({ searchParams }: SearchParams) {
  const admin = await checkAdmin();
  const page = Math.max(1, Number(searchParams.page) || 1);

  const category = VALID_CATEGORIES.includes(
    searchParams.category as DocumentCategory
  )
    ? (searchParams.category as DocumentCategory)
    : null;
  const review = VALID_REVIEW.includes(searchParams.review as ReviewStatus)
    ? (searchParams.review as ReviewStatus)
    : null;
  const link = VALID_LINK.includes(searchParams.link as LinkFilter)
    ? (searchParams.link as LinkFilter)
    : null;

  const result = await listDocuments({
    category,
    review,
    link,
    search: searchParams.q || null,
    page,
  });

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Todos os arquivos vinculados a leads, clientes, casos e processos."
      />

      <Card>
        <CardContent className="space-y-4 py-6">
          <DocumentsFilters />

          {!isSupabaseConfigured() ? (
            <EmptyState
              icon={FolderOpen}
              title="Modo demonstração"
              description="Configure o Supabase e o bucket privado de Storage para listar os documentos."
            />
          ) : (
            <DocumentsList
              rows={result.rows}
              total={result.total}
              page={result.page}
              totalPages={result.totalPages}
              pageSize={result.pageSize}
              isAdmin={admin.ok}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
