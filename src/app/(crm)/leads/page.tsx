import { PageHeader } from "@/components/layout/page-header";
import { LeadsTable } from "@/components/crm/leads-table";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { getTeamNames } from "@/lib/data/team-names";
import { listLeads } from "@/lib/data/leads";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canWriteRecords, listResponsibleOptions } from "@/lib/data/cadastros-options";
import { COMMERCIAL_STATUS_LABELS, LEGAL_AREA_LABELS, URGENCY_LABELS } from "@/lib/constants";
import type { RawParams } from "@/lib/list-params";
import {
  LEAD_SORTS,
  LEAD_SORT_LABELS,
  NO_OWNER,
  filterLeads,
  leadFiltersActive,
  leadSourceOptions,
  parseLeadOptions,
  sortLeads,
} from "@/lib/list-views/leads";
import { ownerOptions } from "@/lib/list-views/owners";
import { NewLeadButton } from "./new-lead-button";

const labelOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export default async function LeadsPage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  const [leads, names, canWrite, team, user] = await Promise.all([
    listLeads(),
    getTeamNames(),
    canWriteRecords(),
    listResponsibleOptions(),
    getCurrentUser(),
  ]);
  const owners = ownerOptions(leads.map((l) => l.assigned_to), names, NO_OWNER);
  const sources = leadSourceOptions(leads);
  const o = parseLeadOptions(sp, { owners: owners.map((x) => x.value), sources: sources.map((x) => x.value) });
  const shown = sortLeads(filterLeads(leads, o), o.ordem);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Pessoas que entraram em contato e ainda não contrataram o escritório."
        action={canWrite ? <NewLeadButton team={team} currentUserId={user.id} /> : undefined}
      />
      <ListToolbar
        path="/leads"
        search={{ value: o.q, placeholder: "Buscar por nome, telefone, e-mail, processo ou cidade..." }}
        selects={[
          { name: "area", label: "Área", value: o.area, options: labelOptions(LEGAL_AREA_LABELS), allLabel: "Todas as áreas" },
          { name: "urgencia", label: "Urgência", value: o.urgencia, options: labelOptions(URGENCY_LABELS), allLabel: "Toda urgência" },
          {
            name: "etapa",
            label: "Etapa do funil",
            value: o.etapa,
            options: labelOptions(COMMERCIAL_STATUS_LABELS),
            allLabel: "Todas as etapas",
          },
          { name: "origem", label: "Origem", value: o.origem, options: sources, allLabel: "Todas as origens" },
          { name: "resp", label: "Responsável", value: o.resp, options: owners },
        ]}
        sort={{ value: o.ordem, options: LEAD_SORTS.map((v) => ({ value: v, label: LEAD_SORT_LABELS[v] })) }}
        active={leadFiltersActive(o)}
        count={{ shown: shown.length, total: leads.length, singular: "lead", plural: "leads" }}
      />
      <LeadsTable leads={shown} names={names} sp={sp} ordem={o.ordem} />
    </>
  );
}
