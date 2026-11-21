import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SortHeader } from "@/components/crm/list-toolbar";
import {
  AreaBadge,
  CommercialStatusBadge,
  UrgencyBadge,
} from "@/components/crm/status-badge";
import type { RawParams } from "@/lib/list-params";
import type { LeadSort } from "@/lib/list-views/leads";
import { nameOf, type TeamNames } from "@/lib/team-names";
import type { Lead } from "@/lib/types";
import { formatDate } from "@/lib/utils";

/**
 * Tabela de leads. A busca, os filtros e a ordem ficam na URL (ListToolbar
 * na página); aqui só se mostra a lista já filtrada e os títulos que ordenam.
 */
export function LeadsTable({
  leads,
  names,
  sp,
  ordem,
}: {
  leads: Lead[];
  names: TeamNames;
  sp: RawParams;
  ordem: LeadSort;
}) {
  const th = "px-4 py-3";
  return (
    <div className="space-y-4">
      {leads.length === 0 ? (
        <EmptyState
          title="Nenhum lead encontrado"
          description="Ajuste os filtros ou aguarde novos atendimentos pelo chatbot."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortHeader path="/leads" sp={sp} current={ordem} text="Lead" asc="nome" className={th} />
                  <th className="px-4 py-3 font-medium">Área</th>
                  <SortHeader path="/leads" sp={sp} current={ordem} text="Urgência" asc="urgencia" className={th} />
                  <SortHeader path="/leads" sp={sp} current={ordem} text="Status comercial" asc="etapa" className={th} />
                  <th className="px-4 py-3 font-medium">Responsável</th>
                  <SortHeader
                    path="/leads"
                    sp={sp}
                    current={ordem}
                    text="Criado em"
                    asc="antigos"
                    desc="recentes"
                    className={th}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className="group hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <p className="font-medium text-slate-900 group-hover:text-brand-primary">
                          {lead.full_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {lead.phone ?? lead.email ?? "—"}
                          {lead.city ? ` • ${lead.city}/${lead.state}` : ""}
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <AreaBadge area={lead.legal_area} />
                    </td>
                    <td className="px-4 py-3">
                      <UrgencyBadge urgency={lead.urgency} />
                    </td>
                    <td className="px-4 py-3">
                      <CommercialStatusBadge status={lead.commercial_status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {nameOf(names, lead.assigned_to)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(lead.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
