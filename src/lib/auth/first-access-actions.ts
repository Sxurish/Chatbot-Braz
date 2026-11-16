"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasServiceRole, isSupabaseConfigured } from "@/lib/supabase/config";
import {
  codeSchema,
  emailSchema,
  isInviteUsable,
  NEUTRAL_CODE_MESSAGE,
  passwordSchema,
  type InviteLike,
} from "@/lib/auth/invite-rules";
import { hitLimit, resetLimit } from "@/lib/auth/rate-limit";
import type { UserRole } from "@/lib/types";

/**
 * Primeiro acesso por convite e "esqueci minha senha".
 * 1) A pessoa informa o e-mail → enviamos um código de 6 dígitos (Supabase Auth).
 * 2) Confirma o código → fica logada.
 * 3) Cria a senha → o convite vira acesso ativo com o papel definido pelo Admin.
 */

export interface CodeState {
  step: "email" | "code";
  email?: string;
  message?: string;
  error?: string;
}

const DEMO_CODE = "123456";
const WINDOW = 15 * 60_000;

type InviteRow = InviteLike & { id: string; name: string; role: UserRole; email: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

async function findUsableInvite(email: string): Promise<InviteRow | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("team_invites")
    .select("id, email, name, role, status, expires_at")
    .eq("email", email)
    .eq("status", "pendente")
    .maybeSingle();
  return isInviteUsable(data as InviteRow | null) ? (data as InviteRow) : null;
}

/** Passo 1: pede o código. A resposta é sempre a mesma, com ou sem convite. */
export async function requestCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0]?.message };
  const email = parsed.data;

  if (!isSupabaseConfigured()) {
    return {
      step: "code",
      email,
      message: `Modo demonstração: use o código ${DEMO_CODE}.`,
    };
  }
  if (!hasServiceRole()) {
    return { step: "email", error: "O primeiro acesso ainda não está configurado no servidor. Avise o administrador." };
  }

  const ip = await clientIp();
  if (hitLimit(`code:ip:${ip}`, 10, WINDOW) || hitLimit(`code:email:${email}`, 3, WINDOW)) {
    return { step: "email", error: "Muitos pedidos seguidos. Espere alguns minutos e tente de novo." };
  }

  const svc = createServiceClient();
  let shouldSend = false;

  const invite = await findUsableInvite(email);
  if (invite) {
    shouldSend = true;
    const { data: profile } = await svc.from("users").select("id").eq("email", email).maybeSingle();
    if (profile) {
      // Ex-membro desativado e convidado de novo: libera o login para o código.
      await svc.auth.admin.updateUserById(profile.id, { ban_duration: "none" }).catch(() => undefined);
    } else {
      // Cria o login no Supabase Auth (sem senha ainda). O gatilho cria o perfil;
      // ele fica INATIVO até a pessoa criar a senha.
      const { data: created } = await svc.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name: invite.name },
      });
      if (created?.user) {
        const { error: profileError } = await svc
          .from("users")
          .upsert({ id: created.user.id, name: invite.name, email, role: invite.role, active: false });
        if (profileError) {
          // Sem garantir o perfil inativo, não envia o código (falha fechada).
          console.error("[primeiro-acesso] falha ao preparar o perfil", profileError.message);
          shouldSend = false;
        }
      }
    }
  } else {
    // Esqueci a senha: só para quem já tem acesso ativo.
    const { data: profile } = await svc
      .from("users")
      .select("id, active")
      .eq("email", email)
      .maybeSingle();
    shouldSend = Boolean(profile?.active);
  }

  if (shouldSend) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) console.error("[primeiro-acesso] falha ao enviar código", error.status, error.message);
  }

  return { step: "code", email, message: NEUTRAL_CODE_MESSAGE };
}

/** Passo 2: confere o código e abre a sessão. */
export async function verifyCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const code = codeSchema.safeParse(formData.get("code"));
  if (!email.success) return { step: "email", error: "Informe o e-mail novamente." };
  if (!code.success) return { step: "code", email: email.data, error: code.error.issues[0]?.message };

  if (!isSupabaseConfigured()) {
    if (code.data !== DEMO_CODE) {
      return { step: "code", email: email.data, error: `Código inválido. No modo demonstração use ${DEMO_CODE}.` };
    }
    redirect("/definir-senha");
  }

  if (hitLimit(`verify:${email.data}`, 5, WINDOW)) {
    return {
      step: "code",
      email: email.data,
      error: "Muitas tentativas. Peça um novo código daqui a alguns minutos.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "email" });
  if (error) {
    return { step: "code", email: email.data, error: "Código inválido ou vencido. Confira ou peça um novo." };
  }
  resetLimit(`verify:${email.data}`);
  redirect("/definir-senha");
}

export interface PasswordState {
  error?: string;
  fieldErrors?: Partial<Record<"password" | "confirm", string>>;
}

/** Passo 3: cria a senha e ativa o acesso do convite. */
export async function setPasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const fieldErrors: PasswordState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "password" | "confirm";
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  if (!isSupabaseConfigured()) redirect("/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login?motivo=sessao");

  const email = user.email.toLowerCase();
  const svc = createServiceClient();
  const invite = await findUsableInvite(email);
  const { data: profile } = await svc.from("users").select("id, active").eq("id", user.id).maybeSingle();
  if (!invite && !profile?.active) {
    await supabase.auth.signOut();
    redirect("/login?motivo=sem-acesso");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const same = /different from the old password|same/i.test(error.message);
    return {
      error: same
        ? "Escolha uma senha diferente da anterior."
        : "Não foi possível salvar a senha. Peça um novo código e tente de novo.",
    };
  }

  const now = new Date().toISOString();
  if (invite) {
    await svc.from("users").upsert({
      id: user.id,
      name: invite.name,
      email,
      role: invite.role,
      active: true,
      last_login: now,
    });
    await svc.from("team_invites").update({ status: "aceito", accepted_at: now }).eq("id", invite.id);
    await svc.from("audit_logs").insert({
      user_id: user.id,
      action: "invite_accepted",
      entity_type: "team",
      entity_id: invite.id,
      metadata: { email, role: invite.role },
    });
  } else {
    await svc.from("users").update({ last_login: now }).eq("id", user.id);
    await svc.from("audit_logs").insert({
      user_id: user.id,
      action: "password_reset",
      entity_type: "team",
      entity_id: user.id,
    });
  }

  redirect("/dashboard");
}
