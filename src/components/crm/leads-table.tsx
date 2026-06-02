"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AreaBadge,
  CommercialStatusBadge,
  UrgencyBadge,
} from "@/components/crm/status-badge";
import {
  LEGAL_AREA_LABELS,
} from "@/lib/constants";
import { getUserName } from "@/lib/mock-data";
import type { Lead, LegalArea, Urgency } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<LegalArea | "all">("all");
  const [urgency, setUrgency] = useState<Urgency | "all">("all");

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const matchesQuery =
        !query ||
        [lead.full_name, lead.phone, lead.email, lead.process_number, lead.city]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(query.toLowerCase()));
      const matchesArea = area === "all" || lead.legal_area === area;
      const matchesUrgency = urgency === "all" || lead.urgency === urgency;
      return matchesQuery && matchesArea && matchesUrgency;
    });
  }, [leads, query, area, urgency]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por nome, telefone, e-mail, processo ou cidade..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" />
          <Select
            value={area}
            onChange={(e) => setArea(e.target.value as LegalArea | "all")}
            className="w-48"
          >
            <option value="all">Todas as áreas</option>
            {(Object.keys(LEGAL_AREA_LABELS) as LegalArea[]).map((a) => (
              <option key={a} value={a}>
                {LEGAL_AREA_LABELS[a]}
              </option>
            ))}
          </Select>
          <Select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as Urgency | "all")}
            className="w-36"
          >
            <option value="all">Toda urgência</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
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
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Área</th>
                  <th className="px-4 py-3 font-medium">Urgência</th>
                  <th className="px-4 py-3 font-medium">Status comercial</th>
                  <th className="px-4 py-3 font-medium">Responsável</th>
                  <th className="px-4 py-3 font-medium">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((lead) => (
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
                      {getUserName(lead.assigned_to)}
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
      <p className="text-xs text-slate-400">
        {filtered.length} de {leads.length} leads
      </p>
    </div>
  );
}
