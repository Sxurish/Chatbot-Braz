import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { listTeam } from "@/lib/data/leads";
import { formatDateTime, getInitials } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrador",
  advogado: "Advogado",
  atendente: "Atendente",
  financeiro: "Financeiro",
  visualizador: "Visualizador",
};

export default async function TeamPage() {
  const team = await listTeam();
  return (
    <>
      <PageHeader
        title="Usuários e equipe"
        description="Controle de acesso por papel: admin, advogado, atendente, financeiro e visualizador."
        action={
          <Button>
            <UserPlus className="h-4 w-4" /> Convidar usuário
          </Button>
        }
      />
      <Card className="divide-y divide-slate-100">
        {team.map((user) => (
          <div key={user.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Avatar fallback={getInitials(user.name)} />
              <div>
                <p className="font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="border-brand-primary/20 bg-brand-primary/5 text-brand-primary">
                {ROLE_LABEL[user.role]}
              </Badge>
              <span className="hidden text-xs text-slate-400 sm:inline">
                Último acesso: {formatDateTime(user.last_login)}
              </span>
              <span
                className={
                  user.active
                    ? "h-2 w-2 rounded-full bg-emerald-500"
                    : "h-2 w-2 rounded-full bg-slate-300"
                }
              />
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
