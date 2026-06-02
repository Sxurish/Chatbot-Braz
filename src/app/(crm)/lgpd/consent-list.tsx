"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { ConsentLogRow } from "@/lib/data/lgpd-types";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface Props {
  rows: ConsentLogRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  basePath: string;
}

export function ConsentList({
  rows,
  total,
  page,
  totalPages,
  pageSize,
  basePath,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const currentChannel = params.get("channel") ?? "";
  const currentDecision = params.get("decision") ?? "";

  function update(key: "channel" | "decision", value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "consents");
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${basePath}?${next.toString()}`));
  }

  function clear() {
    const next = new URLSearchParams();
    next.set("tab", "consents");
    startTransition(() => router.replace(`${basePath}?${next.toString()}`));
  }

  function pageHref(p: number): string {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "consents");
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `${basePath}?${next.toString()}`;
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasFilter = Boolean(currentChannel || currentDecision);

  const pagerClass = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "min-w-[110px]"
  );
  const pagerDisabledClass = cn(pagerClass, "pointer-events-none opacity-50");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Canal</label>
          <Select
            value={currentChannel}
            onChange={(e) => update("channel", e.target.value)}
            disabled={pending}
            className="w-44"
          >
            <option value="">Todos</option>
            <option value="chatbot">Chatbot (site)</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Decisão</label>
          <Select
            value={currentDecision}
            onChange={(e) => update("decision", e.target.value)}
            disabled={pending}
            className="w-44"
          >
            <option value="">Todas</option>
            <option value="accepted">Aceites</option>
            <option value="denied">Recusas</option>
          </Select>
        </div>
        {hasFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={pending}
          >
            <RotateCcw className="h-4 w-4" /> Limpar
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhum registro de consentimento"
          description={
            hasFilter
              ? "Ajuste os filtros para visualizar outros registros."
              : "Os consentimentos aparecerão aqui conforme o chatbot for utilizado."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium">Lead</th>
                  <th className="py-2 pr-3 font-medium">Canal</th>
                  <th className="py-2 pr-3 font-medium">Decisão</th>
                  <th className="py-2 pr-3 font-medium">Política</th>
                  <th className="py-2 pr-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-3 text-slate-600">
                      {dateFmt.format(new Date(r.created_at))}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-800">
                      {r.lead_id ? (
                        <Link
                          href={`/leads/${r.lead_id}`}
                          className="font-medium text-brand-primary hover:underline"
                        >
                          {r.lead_name ?? "Lead"}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700">
                      {r.channel ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {r.consent_given ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" /> Aceito
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <XCircle className="h-4 w-4" /> Recusado
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">
                      {r.policy_version ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">
                      {r.ip_address ?? "—"}
                    </td>
                  </tr>
                ))}
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
    </>
  );
}
