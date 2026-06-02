"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LegalStatusBadge } from "@/components/crm/status-badge";
import { Scale } from "lucide-react";
import { deleteProcessAction } from "@/lib/data/fase6-actions";
import type { SelectOption } from "@/lib/data/fase6-options";
import type { Process } from "@/lib/types";
import { formatDate } from "@/lib/utils";
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
              <div className="flex items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-mono text-sm font-medium text-slate-900 hover:text-brand-primary">
                    {p.process_number ?? "Sem número"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {[p.court, p.jurisdiction].filter(Boolean).join(" • ") ||
                      "—"}
                  </p>
                  {p.class && <p className="text-xs text-slate-500">{p.class}</p>}
                  {p.next_deadline && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      <CalendarClock className="h-3 w-3" /> Próximo prazo:{" "}
                      {formatDate(p.next_deadline)}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <LegalStatusBadge status={p.status} />
                  {isAdmin && <DeleteButton id={p.id} />}
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
  const [, action] = useFormState(deleteProcessAction, {});

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
