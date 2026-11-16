"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasServiceRole, isSupabaseConfigured } from "@/lib/supabase/config";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { inviteExpiry, inviteSchema } from "@/lib/auth/invite-rules";
import { parseWhatsappNumberInput, whatsappNumberVariants } from "@/lib/whatsapp-number";

export interface TeamActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DEMO_NOTICE = "Modo demonstração: configure o Supabase para gravar de verdade.";

async function audit(action: string, entityId: string | null, userId: string, metadata?: object) {
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      user_id: userId.startsWith("demo") ? null : userId,
      action,
      entity_type: "team",
      entity_id: entityId,
      metadata: metadata ?? null,
    });
  } catch {
    // não bloqueia
  }
}

// ---------------------------------------------------------------------------
// Convites
// ---------------------------------------------------------------------------
export async function createInviteAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = await createClient();

  // Já faz parte da equipe? Então não precisa de convite.
  const { data: member } = await supabase
    .from("users")
    .select("id, active")
    .eq("email", parsed.data.email)
    .maybeSingle();
  if (member?.active) return { error: "Esse e-mail já tem acesso ao CRM." };

  // Substitui convite pendente anterior do mesmo e-mail.
  await supabase
    .from("team_invites")
    .update({ status: "cancelado" })
    .eq("email", parsed.data.email)
    .eq("status", "pendente");

  const { data, error } = await supabase
    .from("team_invites")
    .insert({
      ...parsed.data,
      invited_by: admin.user.id,
      expires_at: inviteExpiry(),
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Não foi possível criar o convite." };

  await audit("invite_created", data.id, admin.user.id, { email: parsed.data.email, role: parsed.data.role });
  revalidatePath("/equipe");
  return { ok: true, message: `Convite criado para ${parsed.data.email}.` };
}

const idSchema = z.string().uuid();

export async function renewInviteAction(formData: FormData): Promise<void> {
  const admin = await requireAdminAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!admin.ok || !id.success || !isSupabaseConfigured()) return;
  const supabase = await createClient();
  await supabase
    .from("team_invites")
    .update({ expires_at: inviteExpiry() })
    .eq("id", id.data)
    .eq("status", "pendente");
  await audit("invite_renewed", id.data, admin.user.id);
  revalidatePath("/equipe");
}

export async function cancelInviteAction(formData: FormData): Promise<void> {
  const admin = await requireAdminAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!admin.ok || !id.success || !isSupabaseConfigured()) return;
  const supabase = await createClient();
  await supabase
    .from("team_invites")
    .update({ status: "cancelado" })
    .eq("id", id.data)
    .eq("status", "pendente");
  await audit("invite_cancelled", id.data, admin.user.id);
  revalidatePath("/equipe");
}

// ---------------------------------------------------------------------------
// Membros da equipe
// ---------------------------------------------------------------------------
const memberSchema = z.object({
  id: z.string().uuid(),
  active: z.enum(["true", "false"]).optional(),
  role: inviteSchema.shape.role.optional(),
});

/** Ativa/desativa alguém ou muda o papel. Desativar corta o acesso na hora. */
export async function updateMemberAction(formData: FormData): Promise<void> {
  const admin = await requireAdminAction();
  const parsed = memberSchema.safeParse({
    id: formData.get("id"),
    active: formData.get("active") ?? undefined,
    role: formData.get("role") ?? undefined,
  });
  if (!admin.ok || !parsed.success || !isSupabaseConfigured() || !hasServiceRole()) return;
  // Ninguém tira o próprio acesso de Admin (evita ficar sem administrador).
  if (parsed.data.id === admin.user.id) return;

  const patch: Record<string, unknown> = {};
  if (parsed.data.active) patch.active = parsed.data.active === "true";
  if (parsed.data.role) patch.role = parsed.data.role;
  if (Object.keys(patch).length === 0) return;

  const svc = createServiceClient();
  await svc.from("users").update(patch).eq("id", parsed.data.id);
  if (patch.active !== undefined) {
    // Desativar bloqueia o login no Supabase Auth (as sessões abertas param de
    // renovar); reativar desbloqueia.
    await svc.auth.admin
      .updateUserById(parsed.data.id, { ban_duration: patch.active ? "none" : "876000h" })
      .catch(() => undefined);
  }
  await audit("member_updated", parsed.data.id, admin.user.id, patch);
  revalidatePath("/equipe");
}

// ---------------------------------------------------------------------------
// WhatsApp do assistente e resumo diário (fase 4) — só Admin
// ---------------------------------------------------------------------------
const whatsappSchema = z.object({
  id: z.string().min(1).max(64),
  whatsapp_number: z.string().max(40).optional(),
  daily_digest: z.enum(["true", "false"]).optional(),
});

/**
 * Cadastra (ou remove) o número de WhatsApp com que a pessoa fala com o
 * assistente e liga/desliga o resumo diário. Grava pelo servidor com service
 * role (a equipe não tem permissão de UPDATE em users) e só para Admin.
 * O Admin pode editar a própria linha (é assim que o Dr. Jean cadastra o
 * próprio número).
 */
export async function updateMemberWhatsappAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const parsed = whatsappSchema.safeParse({
    id: formData.get("id"),
    whatsapp_number: formData.get("whatsapp_number") ?? undefined,
    daily_digest: formData.get("daily_digest") === "true" ? "true" : "false",
  });
  if (!parsed.success) return { error: "Dados inválidos." };
  const number = parseWhatsappNumberInput(parsed.data.whatsapp_number);
  if (!number.ok) return { error: number.error };
  const dailyDigest = parsed.data.daily_digest === "true";

  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };
  if (!hasServiceRole()) {
    return { error: "Falta a variável SUPABASE_SERVICE_ROLE_KEY no servidor para salvar." };
  }
  if (!z.string().uuid().safeParse(parsed.data.id).success) return { error: "Pessoa não encontrada." };

  const svc = createServiceClient();
  if (number.number) {
    // Um número por pessoa, contando o celular com e sem o nono dígito.
    const { data: taken, error: takenError } = await svc
      .from("users")
      .select("id")
      .in("whatsapp_number", whatsappNumberVariants(number.number))
      .neq("id", parsed.data.id)
      .limit(1);
    if (takenError) return { error: friendlyWhatsappError(takenError) };
    if (taken && taken.length > 0) {
      return { error: "Esse número já está cadastrado para outra pessoa da equipe." };
    }
  }

  const { data: updated, error } = await svc
    .from("users")
    .update({ whatsapp_number: number.number, daily_digest: dailyDigest })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { error: friendlyWhatsappError(error) };
  if (!updated || updated.length === 0) return { error: "Pessoa não encontrada." };

  await audit("member_whatsapp_updated", parsed.data.id, admin.user.id, {
    // No log, só o final do número.
    whatsapp: number.number ? `…${number.number.slice(-4)}` : null,
    daily_digest: dailyDigest,
  });
  revalidatePath("/equipe");
  return {
    ok: true,
    message: number.number ? "WhatsApp salvo." : "WhatsApp removido.",
  };
}

function friendlyWhatsappError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "Esse número já está cadastrado para outra pessoa da equipe.";
  if (error.code === "23514") return "Número inválido. Use DDI + DDD + número, ex.: 55 11 98888-7777.";
  if (error.code === "42703" || /whatsapp_number|daily_digest/.test(error.message ?? "")) {
    return "O banco ainda não tem os campos da fase 4. Rode supabase/assistente-fase4.sql no Supabase.";
  }
  return "Não foi possível salvar agora. Tente de novo.";
}
