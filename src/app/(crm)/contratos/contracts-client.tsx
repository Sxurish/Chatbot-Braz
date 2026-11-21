"use client";

import { useState, useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FileSignature, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SortHeader } from "@/components/crm/list-toolbar";
import { ContractStatusBadge } from "@/components/crm/status-badge";
import { deleteContractAction } from "@/lib/data/fase6-actions";
import type { SelectOption } from "@/lib/data/fase6-options";
import type { RawParams } from "@/lib/list-params";
import type { ContractRow, ContractSort } from "@/lib/list-views/contratos";
import type { Contract } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ContractDialog } from "./contract-dialog";

export function ContractsClient({
  contracts,
  rows,
  clients,
  cases,
  isAdmin,
  toolbar,
  sp,
  ordem,
}: {
  /** Todos os contratos (para os totais). */
  contracts: Contract[];
  /** Os que passam pela busca e pelos filtros, já ordenados. */
  rows: ContractRow[];
  clients: SelectOption[];
  cases: SelectOption[];
  isAdmin: boolean;
  /** Barra de busca, filtros e ordenação (vem da página). */
  toolbar?: ReactNode;
  sp: RawParams;
  ordem: ContractSort;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const totalAssinado = contracts
    .filter((c) => c.status === "assinado")
    .reduce((sum, c) => sum + (c.value ?? 0), 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <span className="text-slate-500">Contratos: </span>
            <span className="font-semibold text-slate-900">
              {contracts.length}
            </span>
          </span>
          <span className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <span className="text-slate-500">Valor assinado: </span>
            <span className="font-semibold text-emerald-600">
              {formatCurrency(totalAssinado)}
            </span>
          </span>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo contrato
        </Button>
      </div>

      {toolbar}

      {contracts.length > 0 && rows.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Nenhum contrato encontrado"
          description="Nenhum contrato corresponde à busca e aos filtros escolhidos."
        />
      ) : contracts.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Nenhum contrato cadastrado"
          description="Clique em 'Novo contrato' para registrar o primeiro."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortHeader path="/contratos" sp={sp} current={ordem} text="Tipo" asc="tipo" className={th} />
                  <SortHeader path="/contratos" sp={sp} current={ordem} text="Cliente" asc="cliente" className={th} />
                  <SortHeader
                    path="/contratos"
                    sp={sp}
                    current={ordem}
                    text="Valor"
                    asc="valor_asc"
                    desc="valor_desc"
                    className={th}
                  />
                  <th className="px-4 py-3 font-medium">Condições</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <SortHeader
                    path="/contratos"
                    sp={sp}
                    current={ordem}
                    text="Assinado em"
                    asc="assinatura"
                    className={th}
                  />
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ contract: c, clientName }) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td
                      className="cursor-pointer px-4 py-3 font-medium text-slate-900"
                      onClick={() => setEditing(c)}
                    >
                      {c.contract_type ?? "—"}
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3 text-slate-700"
                      onClick={() => setEditing(c)}
                    >
                      {clientName ?? "—"}
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3 text-slate-700"
                      onClick={() => setEditing(c)}
                    >
                      {formatCurrency(c.value)}
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3 text-slate-500"
                      onClick={() => setEditing(c)}
                    >
                      {c.payment_terms ?? "—"}
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3"
                      onClick={() => setEditing(c)}
                    >
                      <ContractStatusBadge status={c.status} />
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3 text-slate-500"
                      onClick={() => setEditing(c)}
                    >
                      {c.signed_at ? formatDate(c.signed_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && <DeleteButton id={c.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ContractDialog
        open={creating}
        contract={null}
        clients={clients}
        cases={cases}
        onClose={() => setCreating(false)}
      />
      <ContractDialog
        open={Boolean(editing)}
        contract={editing}
        clients={clients}
        cases={cases}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

const th = "px-4 py-3 text-xs uppercase tracking-wide";

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
  const [state, action] = useActionState(deleteContractAction, {} as { error?: string });

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
      {state.error && <span role="alert" className="text-xs text-red-600">{state.error}</span>}
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
