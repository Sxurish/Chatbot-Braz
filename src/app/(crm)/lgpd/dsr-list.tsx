"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  DSR_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  type DsrRow,
  type DsrStatus,
} from "@/lib/data/lgpd-types";
import { DsrCreateDialog } from "./dsr-create-dialog";
import { DsrUpdateDialog } from "./dsr-update-dialog";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface DsrListProps {
  rows: DsrRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  canEdit: boolean;
  basePath: string;
}

export function DsrList({
  rows,
  total,
  page,
  totalPages,
  pageSize,
  canEdit,
  basePath,
}: DsrListProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DsrRow | null>(null);
  const currentStatus = params.get("status") ?? "";

  function update(status: string) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "dsr");
    if (status) next.set("status", status);
    else next.delete("status");
    next.delete("page");
    router.replace(`${basePath}?${next.toString()}`);
  }

  function pageHref(p: number): string {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "dsr");
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `${basePath}?${next.toString()}`;
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pagerClass = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "min-w-[110px]"
  );
  const pagerDisabledClass = cn(pagerClass, "pointer-events-none opacity-50");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Status</label>
          <Select
            value={currentStatus}
            onChange={(e) => update(e.target.value)}
            className="w-48"
          >
            <option value="">Todos</option>
            {(Object.keys(DSR_STATUS_LABELS) as DsrStatus[]).map((s) => (
              <option key={s} value={s}>
                {DSR_STATUS_LABELS[s].label}
              </option>
            ))}
          </Select>
        </div>
        {currentStatus && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => update("")}
          >
            <RotateCcw className="h-4 w-4" /> Limpar
          </Button>
        )}
        {canEdit && (
          <Button onClick={() => setCreating(true)} className="ml-auto">
            <Plus className="h-4 w-4" /> Nova solicitação
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhuma solicitação"
          description={
            currentStatus
              ? "Ajuste o filtro para visualizar outras solicitações."
              : "Quando um titular pedir exclusão, correção ou exportação de dados, registre aqui."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Recebida</th>
                  <th className="py-2 pr-3 font-medium">Titular</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Resolvida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const st = DSR_STATUS_LABELS[r.status];
                  const interactive = canEdit;
                  return (
                    <tr
                      key={r.id}
                      onClick={interactive ? () => setEditing(r) : undefined}
                      className={cn(
                        interactive && "cursor-pointer hover:bg-slate-50"
                      )}
                    >
                      <td className="py-2.5 pr-3 text-slate-600">
                        {dateFmt.format(new Date(r.received_at))}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-slate-800">
                          {r.requester_name}
                        </div>
                        {r.requester_email && (
                          <div className="text-xs text-slate-500">
                            {r.requester_email}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">
                        {REQUEST_TYPE_LABELS[r.request_type]}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge className={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-500">
                        {r.resolved_at
                          ? dateFmt.format(new Date(r.resolved_at))
                          : "—"}
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
        </>
      )}

      <DsrCreateDialog open={creating} onClose={() => setCreating(false)} />
      <DsrUpdateDialog
        open={Boolean(editing)}
        dsr={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
