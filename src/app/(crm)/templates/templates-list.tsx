"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteTemplateAction } from "@/lib/data/templates-actions";
import {
  TEMPLATE_CATEGORY_LABELS,
  type DocumentTemplate,
} from "@/lib/data/templates-types";
import { UploadTemplateDialog } from "./upload-dialog";
import { EditTemplateDialog } from "./edit-dialog";

export function TemplatesList({
  templates,
}: {
  templates: DocumentTemplate[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DocumentTemplate | null>(null);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={FileText}
              title="Nenhum template cadastrado"
              description="Crie templates .docx com placeholders {{cliente.nome}} para gerar documentos automaticamente."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="truncate">{t.name}</CardTitle>
                      <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                        {TEMPLATE_CATEGORY_LABELS[t.category] ?? t.category}
                      </Badge>
                      {!t.active && (
                        <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    {t.description && (
                      <CardDescription className="mt-1">
                        {t.description}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(t)}
                      title="Editar"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <DeleteButton id={t.id} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs font-medium text-slate-500">
                  {t.placeholders.length} placeholder
                  {t.placeholders.length === 1 ? "" : "s"} detectado
                  {t.placeholders.length === 1 ? "" : "s"}
                </p>
                {t.placeholders.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.placeholders.slice(0, 12).map((p) => (
                      <code
                        key={p}
                        className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700"
                      >
                        {p}
                      </code>
                    ))}
                    {t.placeholders.length > 12 && (
                      <span className="text-xs text-slate-500">
                        + {t.placeholders.length - 12}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UploadTemplateDialog
        open={creating}
        onClose={() => setCreating(false)}
      />
      <EditTemplateDialog
        open={Boolean(editing)}
        template={editing}
        onClose={() => setEditing(null)}
      />
    </>
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

function DeleteButton({ id }: { id: string }) {
  const [armed, setArmed] = useState(false);
  const [, action] = useFormState(deleteTemplateAction, {});

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
      <input type="hidden" name="id" value={id} />
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
