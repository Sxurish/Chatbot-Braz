import { z } from "zod";
import type { UserRole } from "@/lib/types";

/**
 * Regras puras do primeiro acesso por convite (sem banco), para testar.
 */

export const INVITE_VALIDITY_DAYS = 7;
export const ACCESS_CODE_LENGTH = 6;

export const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "advogado", label: "Advogado(a)" },
  { value: "atendente", label: "Atendente" },
  { value: "financeiro", label: "Financeiro" },
  { value: "visualizador", label: "Visualizador" },
];

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Informe um e-mail válido.")
  .max(254, "E-mail muito longo.");

export const inviteSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120, "Nome muito longo."),
  email: emailSchema,
  role: z.enum(["admin", "advogado", "atendente", "financeiro", "visualizador"], {
    error: "Escolha o papel.",
  }),
});

export const codeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${ACCESS_CODE_LENGTH}}$`), `O código tem ${ACCESS_CODE_LENGTH} números.`);

/** Senha: mínimo 8 caracteres, com letra e número. */
export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "A senha precisa ter pelo menos 8 caracteres.")
      .max(72, "A senha pode ter no máximo 72 caracteres.")
      .regex(/[A-Za-zÀ-ÿ]/, "Use pelo menos uma letra.")
      .regex(/\d/, "Use pelo menos um número."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "As senhas não conferem.",
    path: ["confirm"],
  });

export interface InviteLike {
  status: "pendente" | "aceito" | "cancelado";
  expires_at: string;
}

export function isInviteUsable(invite: InviteLike | null | undefined, now = new Date()): boolean {
  return !!invite && invite.status === "pendente" && new Date(invite.expires_at).getTime() > now.getTime();
}

export function inviteExpiry(now = new Date()): string {
  return new Date(now.getTime() + INVITE_VALIDITY_DAYS * 86_400_000).toISOString();
}

export interface ProfileLike {
  active: boolean;
}

export type AccessDecision =
  /** Pode usar o CRM. */
  | "allow"
  /** Confirmou o código mas ainda não criou a senha. */
  | "set_password"
  /** Sem perfil ativo e sem convite válido. */
  | "deny";

/**
 * Decide o que fazer com quem está logado no Supabase Auth.
 * O perfil ativo em public.users é o que dá acesso; um convite pendente e
 * válido leva à tela de criar senha.
 */
export function decideAccess(
  profile: ProfileLike | null,
  invite: InviteLike | null,
  now = new Date()
): AccessDecision {
  if (profile?.active) return "allow";
  if (isInviteUsable(invite, now)) return "set_password";
  return "deny";
}

/** Aceita só caminhos internos (evita redirecionar para outro site). */
export function safeRedirect(raw: unknown, fallback = "/dashboard"): string {
  const value = typeof raw === "string" ? raw : "";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}

/** Mensagem neutra: não revela se o e-mail tem convite ou cadastro. */
export const NEUTRAL_CODE_MESSAGE =
  "Se este e-mail tiver um convite ou cadastro ativo, você vai receber um código de 6 dígitos em instantes. Confira também o spam.";
