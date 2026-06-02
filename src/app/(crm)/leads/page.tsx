import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { LeadsTable } from "@/components/crm/leads-table";
import { Button } from "@/components/ui/button";
import { listLeads } from "@/lib/data/leads";

export default async function LeadsPage() {
  const leads = await listLeads();
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
      <LeadsTable leads={leads} />
    </>
  );
}
