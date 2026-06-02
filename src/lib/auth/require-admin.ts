import { getCurrentUser } from "@/lib/auth/current-user";
import type { TeamUser } from "@/lib/types";

export type AdminCheck =
  | { ok: true; user: TeamUser }
  | { ok: false; user: TeamUser; reason: "not_admin" };

/**
 * Verifica se o usuário autenticado tem papel de admin.
 * Retorna o resultado em vez de lançar erro — para uso em Server Actions e
 * Server Components que precisam renderizar UI alternativa (modo somente leitura).
 */
export async function checkAdmin(): Promise<AdminCheck> {
  const user = await getCurrentUser();
  if (user.role !== "admin") return { ok: false, user, reason: "not_admin" };
  return { ok: true, user };
}

/**
 * Variante para Server Actions: retorna mensagem padronizada quando bloqueia.
 * Mantém o contrato `ActionState` (`error`) usado no resto do CRM.
 */
export async function requireAdminAction(): Promise<
  { ok: true; user: TeamUser } | { ok: false; error: string }
> {
  const result = await checkAdmin();
  if (!result.ok) {
    return { ok: false, error: "Acesso restrito a administradores." };
  }
  return { ok: true, user: result.user };
}
