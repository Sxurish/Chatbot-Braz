import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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

export async function getCurrentUser(): Promise<TeamUser> {
  if (!isSupabaseConfigured()) return DEMO_USER;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return DEMO_USER;

  // Busca o perfil estendido na tabela public.users.
  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, role, active, last_login, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) return profile as TeamUser;

  // Fallback: usa metadados do auth se o perfil ainda não foi provisionado.
  return {
    id: user.id,
    name:
      (user.user_metadata?.name as string) ||
      user.email?.split("@")[0] ||
      "Usuário",
    email: user.email ?? "",
    role: ((user.user_metadata?.role as UserRole) ?? "atendente") as UserRole,
    active: true,
    last_login: user.last_sign_in_at ?? null,
    created_at: user.created_at,
  };
}
