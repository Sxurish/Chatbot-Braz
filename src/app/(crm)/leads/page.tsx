import { PageHeader } from "@/components/layout/page-header";
import { LeadsTable } from "@/components/crm/leads-table";
import { getTeamNames } from "@/lib/data/team-names";
import { listLeads } from "@/lib/data/leads";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canWriteRecords, listResponsibleOptions } from "@/lib/data/cadastros-options";
import { NewLeadButton } from "./new-lead-button";

export default async function LeadsPage() {
  const [leads, names, canWrite, team, user] = await Promise.all([
    listLeads(),
    getTeamNames(),
    canWriteRecords(),
    listResponsibleOptions(),
    getCurrentUser(),
  ]);
  return (
    <>
      <PageHeader
        title="Leads"
        description="Pessoas que entraram em contato e ainda não contrataram o escritório."
        action={canWrite ? <NewLeadButton team={team} currentUserId={user.id} /> : undefined}
      />
      <LeadsTable leads={leads} names={names} />
    </>
  );
}
