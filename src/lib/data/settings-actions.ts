"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { getSettings } from "@/lib/data/settings";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DEMO_NOTICE =
  "Modo demonstração: configure o Supabase para gravar os dados de verdade.";

async function audit(
  supabase: ReturnType<typeof createClient>,
  action: string,
  userId: string | null
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId && !userId.startsWith("demo") ? userId : null,
      action,
      entity_type: "settings",
      entity_id: "1",
    });
  } catch {
    // não bloqueia
  }
}

// ---------------------------------------------------------------------------
// Seção A — Dados do escritório
// ---------------------------------------------------------------------------
const officeSchema = z.object({
  office_name: z.string().min(2, "Informe o nome do escritório."),
  cnpj: z.string().optional(),
  oab: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .email("E-mail inválido.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  weekdays: z.string().optional(),
  saturday: z.string().optional(),
  sunday: z.string().optional(),
  privacy_policy_version: z.string().min(1, "Informe a versão da política."),
});

export async function updateOfficeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const parsed = officeSchema.safeParse({
    office_name: formData.get("office_name"),
    cnpj: formData.get("cnpj") || undefined,
    oab: formData.get("oab") || undefined,
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || "",
    weekdays: formData.get("weekdays") || undefined,
    saturday: formData.get("saturday") || undefined,
    sunday: formData.get("sunday") || undefined,
    privacy_policy_version: formData.get("privacy_policy_version"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const current = await getSettings();
  const supabase = createClient();

  const { error } = await supabase
    .from("settings")
    .upsert({
      id: 1,
      office_name: parsed.data.office_name,
      privacy_policy_version: parsed.data.privacy_policy_version,
      ai_provider: current.ai_provider,
      ai_model: current.ai_model,
      data: {
        ...((current as unknown as { data?: object }).data ?? {}),
        office: {
          cnpj: parsed.data.cnpj ?? "",
          oab: parsed.data.oab ?? "",
          address: parsed.data.address ?? "",
          phone: parsed.data.phone ?? "",
          email: parsed.data.email ?? "",
          business_hours: {
            weekdays: parsed.data.weekdays ?? "",
            saturday: parsed.data.saturday ?? "",
            sunday: parsed.data.sunday ?? "",
          },
        },
        ai: current.ai,
      },
    });

  if (error) return { error: "Falha ao salvar os dados do escritório." };
  await audit(supabase, "update_office", admin.user.id);
  revalidatePath("/configuracoes");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Seção B — Configurações do chatbot/IA
// ---------------------------------------------------------------------------
const aiSchema = z.object({
  ai_provider: z.enum(["mock", "openai", "anthropic", "openrouter", "google"]),
  ai_model: z.string().optional(),
  greeting: z.string().min(10, "A saudação deve ter pelo menos 10 caracteres."),
  legal_areas: z.string().optional(),
  urgency_keywords: z.string().optional(),
});

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateAiAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };

  const parsed = aiSchema.safeParse({
    ai_provider: formData.get("ai_provider"),
    ai_model: formData.get("ai_model") || undefined,
    greeting: formData.get("greeting"),
    legal_areas: formData.get("legal_areas") || undefined,
    urgency_keywords: formData.get("urgency_keywords") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const current = await getSettings();
  const supabase = createClient();

  const { error } = await supabase.from("settings").upsert({
    id: 1,
    office_name: current.office_name,
    privacy_policy_version: current.privacy_policy_version,
    ai_provider: parsed.data.ai_provider,
    ai_model: parsed.data.ai_model ?? null,
    data: {
      office: current.office,
      ai: {
        greeting: parsed.data.greeting,
        legal_areas: splitList(parsed.data.legal_areas),
        urgency_keywords: splitList(parsed.data.urgency_keywords),
      },
    },
  });

  if (error) return { error: "Falha ao salvar as configurações de IA." };
  await audit(supabase, "update_ai", admin.user.id);
  revalidatePath("/configuracoes");
  return { ok: true };
}
