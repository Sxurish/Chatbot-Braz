import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listTeam } from "@/lib/data/leads";
import { listInvites } from "@/lib/data/invites";
import { listTeamWhatsapp } from "@/lib/data/team-whatsapp";
import { hasServiceRole, isSupabaseConfigured } from "@/lib/supabase/config";
import { InviteButton, InviteList, MemberRow } from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ whatsapp?: string }>;
}) {
  const admin = await checkAdmin();
  const [team, invites, whatsapp] = await Promise.all([
    listTeam(),
    admin.ok ? listInvites() : Promise.resolve([]),
    // Número do WhatsApp e resumo diário: só o Admin vê e altera.
    admin.ok ? listTeamWhatsapp() : Promise.resolve(null),
  ]);
  // ?whatsapp=<id> abre direto a edição do WhatsApp dessa pessoa.
  const openWhatsapp = (await searchParams).whatsapp;
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

      {admin.ok && whatsapp?.setupMissing && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Para cadastrar o WhatsApp do assistente e o resumo diário, rode{" "}
            <code className="font-mono">supabase/assistente-fase4.sql</code> no SQL Editor do Supabase.
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
            whatsapp={
              whatsapp && !whatsapp.setupMissing
                ? (whatsapp.byId[user.id] ?? { whatsapp_number: null, daily_digest: false })
                : undefined
            }
            whatsappEditable={canManage}
            whatsappOpen={openWhatsapp === user.id}
          />
        ))}
      </Card>
    </>
  );
}
