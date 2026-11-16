import "server-only";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasServiceRole, isSupabaseConfigured } from "@/lib/supabase/config";
import { decideAccess, type InviteLike } from "@/lib/auth/invite-rules";

/**
 * Porta de entrada do CRM: precisa de sessão E de perfil ativo na equipe.
 * - Sem sessão → login.
 * - Confirmou o código do convite mas não criou a senha → tela de senha.
 * - Desativado ou sem convite → sai e volta ao login com aviso.
 */
export async function requireTeamAccess(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("active")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.active) return;

  let invite: InviteLike | null = null;
  if (user.email && hasServiceRole()) {
    const { data } = await createServiceClient()
      .from("team_invites")
      .select("status, expires_at")
      .eq("email", user.email.toLowerCase())
      .eq("status", "pendente")
      .maybeSingle();
    invite = (data as InviteLike | null) ?? null;
  }

  const decision = decideAccess(profile ?? null, invite);
  if (decision === "set_password") redirect("/definir-senha");
  if (decision === "deny") redirect("/auth/sair?motivo=sem-acesso");
}
