"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaymentStatusBadge } from "@/components/crm/status-badge";
import { deletePaymentAction } from "@/lib/data/fase6-actions";
import type { SelectOption } from "@/lib/data/fase6-options";
import type { Payment } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PaymentDialog } from "./payment-dialog";

export function PaymentsClient({
  payments,
  contracts,
  clients,
  isAdmin,
}: {
  payments: Payment[];
  contracts: SelectOption[];
  clients: SelectOption[];
  isAdmin: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);

  return (
    <>
      <div className="mb-3 mt-8 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Pagamentos</h3>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo pagamento
        </Button>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhum pagamento registrado"
          description="Clique em 'Novo pagamento' para registrar o primeiro."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Vencimento</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td
                      className="cursor-pointer px-4 py-3 font-medium text-slate-900"
                      onClick={() => setEditing(p)}
                    >
                      {p.description ?? "—"}
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3 text-slate-700"
                      onClick={() => setEditing(p)}
                    >
                      {formatCurrency(p.amount)}
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3 text-slate-500"
                      onClick={() => setEditing(p)}
                    >
                      {p.due_date ? formatDate(p.due_date) : "—"}
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3"
                      onClick={() => setEditing(p)}
                    >
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && <DeleteButton id={p.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <PaymentDialog
        open={creating}
        payment={null}
        contracts={contracts}
        clients={clients}
        onClose={() => setCreating(false)}
      />
      <PaymentDialog
        open={Boolean(editing)}
        payment={editing}
        contracts={contracts}
        clients={clients}
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
  const [, action] = useFormState(deletePaymentAction, {});

  if (!armed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setArmed(true);
        }}
        title="Excluir"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }
  return (
    <form
      action={action}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1"
    >
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
