import Link from "next/link";
import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AreaBadge, LegalStatusBadge } from "@/components/crm/status-badge";
import { listCases } from "@/lib/data/fase6";
import { getTeamNames } from "@/lib/data/team-names";
import { nameOf } from "@/lib/team-names";
import { formatDate } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listClientOptions } from "@/lib/data/fase6-options";
import {
  canWriteRecords,
  listLeadOptions,
  listResponsibleOptions,
} from "@/lib/data/cadastros-options";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { LEGAL_AREA_LABELS, LEGAL_STATUS_LABELS } from "@/lib/constants";
import type { RawParams } from "@/lib/list-params";
import {
  CASE_SORTS,
  CASE_SORT_LABELS,
  NO_OWNER,
  caseFiltersActive,
  filterCases,
  parseCaseOptions,
  sortCases,
} from "@/lib/list-views/casos";
import { ownerOptions } from "@/lib/list-views/owners";
import { NewCaseButton } from "./new-case-button";

const labelOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export default async function CasesPage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  // Clientes e leads servem para a busca pelo nome da pessoa e para o formulário.
  const [cases, names, canWrite, clients, leads] = await Promise.all([
    listCases(),
    getTeamNames(),
    canWriteRecords(),
    listClientOptions(),
    listLeadOptions(),
  ]);
  // Opções do formulário: só para quem pode gravar.
  const [team, user] = canWrite
    ? await Promise.all([listResponsibleOptions(), getCurrentUser()])
    : [[], null];

  const people = Object.fromEntries([...leads, ...clients].map((p) => [p.id, p.label]));
  const owners = ownerOptions(cases.map((c) => c.assigned_to), names, NO_OWNER);
  const o = parseCaseOptions(sp, owners.map((x) => x.value));
  const shown = sortCases(filterCases(cases, o, people), o.ordem);

  return (
    <>
      <PageHeader
        title="Casos"
        description="Demandas jurídicas específicas vinculadas a leads ou clientes."
        action={
          canWrite && user ? (
            <NewCaseButton
              clients={clients}
              leads={leads}
              team={team}
              currentUserId={user.id}
            />
          ) : undefined
        }
      />

      {cases.length > 0 && (
        <ListToolbar
          path="/casos"
          search={{ value: o.q, placeholder: "Buscar por título, resumo ou nome do cliente..." }}
          selects={[
            { name: "area", label: "Área", value: o.area, options: labelOptions(LEGAL_AREA_LABELS), allLabel: "Todas as áreas" },
            { name: "status", label: "Andamento", value: o.status, options: labelOptions(LEGAL_STATUS_LABELS) },
            { name: "resp", label: "Responsável", value: o.resp, options: owners },
          ]}
          sort={{ value: o.ordem, options: CASE_SORTS.map((v) => ({ value: v, label: CASE_SORT_LABELS[v] })) }}
          active={caseFiltersActive(o)}
          count={{ shown: shown.length, total: cases.length, singular: "caso", plural: "casos" }}
        />
      )}

      {cases.length === 0 ? (
        <EmptyState icon={Briefcase} title="Nenhum caso cadastrado" />
      ) : shown.length === 0 ? (
        <EmptyState icon={Briefcase} title="Nenhum caso encontrado" description="Ajuste a busca ou os filtros." />
      ) : (
        <div className="space-y-3">
          {shown.map((c) => (
            <Card key={c.id} className="p-4 transition-colors hover:border-brand-primary/40">
              <Link href={`/casos/${c.id}`} className="group flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 group-hover:text-brand-primary group-hover:underline">
                    {c.title}
                  </p>
                  {c.summary && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {c.summary}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {nameOf(names, c.assigned_to)} • Aberto em {formatDate(c.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <AreaBadge area={c.legal_area} />
                  <LegalStatusBadge status={c.status} />
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
