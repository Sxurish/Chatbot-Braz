import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listTeam } from "@/lib/data/leads";
import { listInvites } from "@/lib/data/invites";
import { hasServiceRole, isSupabaseConfigured } from "@/lib/supabase/config";
import { InviteButton, InviteList, MemberRow } from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const admin = await checkAdmin();
  const [team, invites] = await Promise.all([
    listTeam(),
    admin.ok ? listInvites() : Promise.resolve([]),
  ]);
  const canManage = admin.ok && (!isSupabaseConfigured() || hasServiceRole());
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://chatbot-braz.vercel.app"}/login`;

  return (
    <>
      <PageHeader
        title="Usuários e equipe"
        description="Quem acessa o CRM e com qual papel. Novas pessoas entram por convite."
        action={admin.ok ? <InviteButton loginUrl={loginUrl} /> : undefined}
      />

      {admin.ok && !canManage && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Falta a variável <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> no servidor: os
            convites funcionam, mas o primeiro acesso e a ativação de pessoas ficam desligados.
          </p>
        </div>
      )}

      {admin.ok && invites.length > 0 && <InviteList invites={invites} loginUrl={loginUrl} />}

      <Card className="divide-y divide-slate-100">
        {team.map((user) => (
          <MemberRow
            key={user.id}
            user={user}
            editable={canManage && user.id !== admin.user.id}
          />
        ))}
      </Card>
    </>
  );
}
