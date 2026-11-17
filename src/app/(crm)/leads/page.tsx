import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { LeadsTable } from "@/components/crm/leads-table";
import { getTeamNames } from "@/lib/data/team-names";
import { Button } from "@/components/ui/button";
import { listLeads } from "@/lib/data/leads";

export default async function LeadsPage() {
  const [leads, names] = await Promise.all([listLeads(), getTeamNames()]);
  return (
    <>
      <PageHeader
        title="Leads"
        description="Pessoas que entraram em contato e ainda não contrataram o escritório."
        action={
          <Button>
            <Plus className="h-4 w-4" /> Novo lead
          </Button>
        }
      />
      <LeadsTable leads={leads} names={names} />
    </>
  );
}
