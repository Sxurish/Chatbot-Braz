import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { TeamUser } from "@/lib/types";

export interface AssistantSession {
  user: TeamUser;
  isAdmin: boolean;
}

/**
 * Quem está usando o assistente. As rotas /api/* não passam pelo proxy de
 * login, então a conferência é feita aqui: precisa haver sessão válida E um
 * perfil ativo em public.users. O papel vem só do perfil (nunca dos metadados
 * que o próprio usuário pode alterar).
 */
export async function getAssistantSession(): Promise<AssistantSession | null> {
  if (!isSupabaseConfigured()) {
    const user = await getCurrentUser(); // perfil de demonstração (admin)
    return { user, isAdmin: user.role === "admin" };
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, role, active, last_login, created_at")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile || !profile.active) return null;
  const user = profile as TeamUser;
  return { user, isAdmin: user.role === "admin" };
}

// Limite simples de requisições por pessoa (por instância do servidor).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

export function rateLimited(userId: string, now = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}
