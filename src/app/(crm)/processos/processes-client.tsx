"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { CalendarClock, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LegalStatusBadge } from "@/components/crm/status-badge";
import { Scale } from "lucide-react";
import { deleteProcessAction } from "@/lib/data/fase6-actions";
import type { SelectOption } from "@/lib/data/fase6-options";
import type { Process } from "@/lib/types";
import { brDate, brDayMonth } from "./format";
import { ProcessDialog } from "./process-dialog";

export function ProcessesClient({
  processes,
  cases,
  isAdmin,
}: {
  processes: Process[];
  cases: SelectOption[];
  isAdmin: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Process | null>(null);

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo processo
        </Button>
      </div>

      {processes.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Nenhum processo cadastrado"
          description="Clique em 'Novo processo' para registrar o primeiro."
        />
      ) : (
        <div className="space-y-3">
          {processes.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <Link href={`/processos/${p.id}`} className="group min-w-0 flex-1">
                  <p className="font-mono text-sm font-medium break-words text-slate-900 group-hover:text-brand-primary group-hover:underline">
                    {p.process_number ?? "Sem número"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {[p.court, p.jurisdiction].filter(Boolean).join(" • ") ||
                      "—"}
                  </p>
                  {p.class && <p className="text-xs text-slate-500">{p.class}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {p.next_deadline && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        <CalendarClock className="h-3 w-3" /> Próximo prazo:{" "}
                        {brDate(p.next_deadline)}
                      </span>
                    )}
                    {p.last_synced_at && (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-slate-400"
                        title="Última busca de andamentos no DataJud"
                      >
                        <RefreshCw className="h-3 w-3" /> Últ. busca {brDayMonth(p.last_synced_at)}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 pt-2 sm:border-0 sm:pt-0">
                  <LegalStatusBadge status={p.status} />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      title="Editar dados do processo"
                      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    {isAdmin && <DeleteButton id={p.id} />}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ProcessDialog
        open={creating}
        process={null}
        cases={cases}
        onClose={() => setCreating(false)}
      />
      <ProcessDialog
        open={Boolean(editing)}
        process={editing}
        cases={cases}
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
  const [, action] = useActionState(deleteProcessAction, {});

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
