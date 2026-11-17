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

/**
 * Para Server Actions que gravam dados do dia a dia (tarefa, follow-up,
 * agendamento, processo, documento...). Qualquer papel ativo pode gravar,
 * menos o "visualizador", que só consulta.
 */
export async function requireWriterAction(): Promise<
  { ok: true; user: TeamUser } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user.active) return { ok: false, error: "Perfil inativo." };
  if (user.role === "visualizador") {
    return { ok: false, error: "Seu perfil só pode consultar." };
  }
  return { ok: true, user };
}
