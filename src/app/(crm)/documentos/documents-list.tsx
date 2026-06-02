"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  REVIEW_STATUS_LABELS,
  formatFileSize,
  type DocumentRow,
} from "@/lib/data/documents-types";
import {
  deleteDocumentAction,
  downloadDocumentAction,
  type ActionState,
} from "@/lib/data/documents-actions";
import { ReviewDialog } from "./review-dialog";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

interface Props {
  rows: DocumentRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  isAdmin: boolean;
}

export function DocumentsList({
  rows,
  total,
  page,
  totalPages,
  pageSize,
  isAdmin,
}: Props) {
  const params = useSearchParams();
  const [editing, setEditing] = useState<DocumentRow | null>(null);

  function pageHref(p: number): string {
    const next = new URLSearchParams(params.toString());
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    const q = next.toString();
    return q ? `/documentos?${q}` : "/documentos";
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pagerClass = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "min-w-[110px]"
  );
  const pagerDisabledClass = cn(pagerClass, "pointer-events-none opacity-50");

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum documento encontrado"
        description="Ajuste os filtros ou faça upload de documentos pelos leads."
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Arquivo</th>
              <th className="py-2 pr-3 font-medium">Categoria</th>
              <th className="py-2 pr-3 font-medium">Vínculo</th>
              <th className="py-2 pr-3 font-medium">Revisão</th>
              <th className="py-2 pr-3 font-medium">Tamanho</th>
              <th className="py-2 pr-3 font-medium">Data</th>
              <th className="py-2 pr-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const review = REVIEW_STATUS_LABELS[r.review_status];
              const link = resolveLink(r);
              return (
                <tr key={r.id}>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800">
                          {r.file_name}
                        </div>
                        {r.uploader_name && (
                          <div className="text-xs text-slate-500">
                            por {r.uploader_name}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-700">
                    {CATEGORY_LABELS[r.category] ?? r.category}
                  </td>
                  <td className="py-2.5 pr-3">
                    {link ? (
                      <Link
                        href={link.href}
                        className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                      >
                        <span className="text-xs uppercase text-slate-400">
                          {link.kind}
                        </span>
                        <span className="truncate">{link.label}</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="group inline-flex items-center gap-1"
                      title="Mudar status de revisão"
                    >
                      <Badge className={review.tone}>{review.label}</Badge>
                      <Pencil className="h-3 w-3 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-slate-600">
                    {formatFileSize(r.file_size)}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-slate-500">
                    {dateFmt.format(new Date(r.created_at))}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex justify-end gap-1">
                      <DownloadButton docId={r.id} />
                      {isAdmin && <DeleteButton docId={r.id} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          {start}–{end} de {total}
        </span>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={pagerClass}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Link>
          ) : (
            <span className={pagerDisabledClass}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </span>
          )}
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className={pagerClass}>
              Próxima <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className={pagerDisabledClass}>
              Próxima <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>

      <ReviewDialog
        open={Boolean(editing)}
        doc={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function resolveLink(
  r: DocumentRow
): { kind: string; label: string; href: string } | null {
  if (r.lead_id)
    return {
      kind: "Lead",
      label: r.lead_name ?? "Lead",
      href: `/leads/${r.lead_id}`,
    };
  if (r.client_id)
    return {
      kind: "Cliente",
      label: r.client_name ?? "Cliente",
      href: "/clientes",
    };
  if (r.case_id)
    return {
      kind: "Caso",
      label: r.case_title ?? "Caso",
      href: "/casos",
    };
  if (r.process_id)
    return {
      kind: "Processo",
      label: r.process_number ?? "Processo",
      href: "/processos",
    };
  return null;
}

// ---------------------------------------------------------------------------
// Botões com ação inline
// ---------------------------------------------------------------------------
function DownloadInner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Baixar"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
    </button>
  );
}

function DownloadButton({ docId }: { docId: string }) {
  const router = useRouter();
  const [, action] = useFormState(async (prev: ActionState, fd: FormData) => {
    const result = await downloadDocumentAction(prev, fd);
    if (result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else if (result.error) {
      alert(result.error);
    } else if (result.message) {
      alert(result.message);
    }
    router.refresh();
    return result;
  }, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={docId} />
      <DownloadInner />
    </form>
  );
}

function DeleteInner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirmar"}
    </button>
  );
}

function DeleteButton({ docId }: { docId: string }) {
  const [armed, setArmed] = useState(false);
  const [, action] = useFormState(deleteDocumentAction, {});

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title="Excluir"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="id" value={docId} />
      <DeleteInner />
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
      >
        Cancelar
      </button>
    </form>
  );
}
