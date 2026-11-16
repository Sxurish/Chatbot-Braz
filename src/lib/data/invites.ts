import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { UserRole } from "@/lib/types";

export interface TeamInvite {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: "pendente" | "aceito" | "cancelado";
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  /** Calculado no servidor: o prazo de 7 dias já passou. */
  expired?: boolean;
}

const DEMO_INVITES: TeamInvite[] = [
  {
    id: "demo-invite-1",
    email: "estagiaria@escritoriobraz.adv.br",
    name: "Juliana Prado",
    role: "atendente",
    status: "pendente",
    expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    accepted_at: null,
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
];

/** Convites pendentes e recentes (só Admin enxerga, via RLS). */
export async function listInvites(): Promise<TeamInvite[]> {
  const withExpiry = (list: TeamInvite[]) => {
    const now = Date.now();
    return list.map((inv) => ({ ...inv, expired: new Date(inv.expires_at).getTime() <= now }));
  };
  if (!isSupabaseConfigured()) return withExpiry(DEMO_INVITES);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_invites")
    .select("id, email, name, role, status, expires_at, accepted_at, created_at")
    .neq("status", "aceito")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return withExpiry(data as TeamInvite[]);
}
