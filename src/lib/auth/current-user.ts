import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTeamMemberContext } from "@/lib/supabase/request-context";
import type { TeamUser, UserRole } from "@/lib/types";

/**
 * Perfil do usuário autenticado, exibido no CRM.
 * Em modo demonstração retorna um perfil admin fictício (Dr. Jean Braz).
 */
const DEMO_USER: TeamUser = {
  id: "demo-admin",
  name: "Dr. Jean Braz",
  email: "jean@escritoriobraz.adv.br",
  role: "admin",
  active: true,
  last_login: new Date().toISOString(),
  created_at: "2025-01-10T12:00:00Z",
};

/**
 * Sessão + perfil, lidos UMA vez por requisição: o layout, a guarda de acesso
 * e a página reaproveitam o mesmo resultado (cada leitura é uma ida ao
 * Supabase, e a troca de aba ficava lenta com as repetidas).
 */
export const getSessionProfile = cache(
  async (): Promise<{ user: User | null; profile: TeamUser | null }> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, profile: null };
    const { data: profile } = await supabase
      .from("users")
      .select("id, name, email, role, active, last_login, created_at")
      .eq("id", user.id)
      .maybeSingle();
    return { user, profile: (profile as TeamUser | null) ?? null };
  }
);

export async function getCurrentUser(): Promise<TeamUser> {
  // Pedido pelo WhatsApp: a pessoa reconhecida pelo número (nunca o perfil de
  // demonstração, que é Admin).
  const member = getTeamMemberContext();
  if (member) return member.user;

  if (!isSupabaseConfigured()) return DEMO_USER;

  const { user, profile } = await getSessionProfile();
  if (!user) return DEMO_USER;

  if (profile) return profile as TeamUser;

  // Fallback: usa metadados do auth se o perfil ainda não foi provisionado.
  return {
    id: user.id,
    name:
      (user.user_metadata?.name as string) ||
      user.email?.split("@")[0] ||
      "Usuário",
    email: user.email ?? "",
    // Sem perfil no banco: nunca confiar no papel dos metadados.
    role: "visualizador" as UserRole,
    active: true,
    last_login: user.last_sign_in_at ?? null,
    created_at: user.created_at,
  };
}
