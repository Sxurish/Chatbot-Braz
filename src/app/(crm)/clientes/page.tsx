import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { listClients } from "@/lib/data/fase6";
import { formatDate, getInitials } from "@/lib/utils";

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Pessoas que contrataram o escritório, convertidas a partir de leads."
        action={
          <Button>
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        }
      />

      {clients.length === 0 ? (
        <EmptyState
          title="Nenhum cliente ainda"
          description="Converta um lead em cliente pela página do lead."
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Avatar fallback={getInitials(c.full_name)} />
                <div>
                  <p className="font-medium text-slate-900">{c.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {c.email ?? c.phone ?? "—"}
                    {c.city ? ` • ${c.city}/${c.state}` : ""}
                    {c.cpf_cnpj ? ` • ${c.cpf_cnpj}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  className={
                    c.status === "ativo"
                      ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }
                >
                  {c.status === "ativo" ? "Ativo" : "Inativo"}
                </Badge>
                <span className="hidden text-xs text-slate-400 sm:inline">
                  Cliente desde {formatDate(c.created_at)}
                </span>
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
