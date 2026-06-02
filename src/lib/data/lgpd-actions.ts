"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireAdminAction } from "@/lib/auth/require-admin";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DEMO_NOTICE =
  "Modo demonstração: configure o Supabase e rode supabase/lgpd.sql para gravar os dados.";

async function audit(
  supabase: ReturnType<typeof createClient>,
  action: string,
  entityId: string | null,
  userId: string | null
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId && !userId.startsWith("demo") ? userId : null,
      action,
      entity_type: "dsr_request",
      entity_id: entityId,
    });
  } catch {
    // não bloqueia
  }
}

// ---------------------------------------------------------------------------
// Criar solicitação (DSAR)
// ---------------------------------------------------------------------------
const createSchema = z.object({
  requester_name: z.string().min(2, "Informe o nome do titular."),
  requester_email: z
    .string()
    .email("E-mail inválido.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  requester_phone: z.string().optional(),
  request_type: z.enum([
    "exclusao",
    "correcao",
    "exportacao",
    "revogacao",
    "informacao",
    "outro",
  ]),
  description: z.string().max(2000, "Descrição muito longa.").optional(),
  lead_id: z
    .string()
    .uuid("ID do lead inválido (use o UUID completo).")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function createDsrAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const parsed = createSchema.safeParse({
    requester_name: formData.get("requester_name"),
    requester_email: formData.get("requester_email") || "",
    requester_phone: formData.get("requester_phone") || undefined,
    request_type: formData.get("request_type"),
    description: formData.get("description") || undefined,
    lead_id: formData.get("lead_id") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("dsr_requests")
    .insert({
      requester_name: parsed.data.requester_name,
      requester_email: parsed.data.requester_email ?? null,
      requester_phone: parsed.data.requester_phone ?? null,
      request_type: parsed.data.request_type,
      description: parsed.data.description ?? null,
      lead_id: parsed.data.lead_id ?? null,
      status: "recebida",
    })
    .select("id")
    .single();

  if (error) return { error: "Falha ao criar a solicitação." };
  await audit(supabase, "create_dsr", data.id, admin.user.id);
  revalidatePath("/lgpd");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Atualizar status / notas
// ---------------------------------------------------------------------------
const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["recebida", "em_analise", "concluida", "negada"]),
  resolution_notes: z
    .string()
    .max(2000, "Notas muito longas.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function updateDsrAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    resolution_notes: formData.get("resolution_notes") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const isResolved =
    parsed.data.status === "concluida" || parsed.data.status === "negada";

  const supabase = createClient();
  const { error } = await supabase
    .from("dsr_requests")
    .update({
      status: parsed.data.status,
      resolution_notes: parsed.data.resolution_notes ?? null,
      resolved_at: isResolved ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.id);

  if (error) return { error: "Falha ao atualizar a solicitação." };
  await audit(supabase, "update_dsr", parsed.data.id, admin.user.id);
  revalidatePath("/lgpd");
  return { ok: true };
}
