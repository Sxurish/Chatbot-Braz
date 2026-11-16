import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * WhatsApp e resumo diário de cada pessoa da equipe (fase 4). Só a tela
 * Equipe, para Admin, lê isto.
 */
export interface MemberWhatsapp {
  whatsapp_number: string | null;
  daily_digest: boolean;
}

export interface TeamWhatsappInfo {
  byId: Record<string, MemberWhatsapp>;
  /** Banco ainda sem supabase/assistente-fase4.sql. */
  setupMissing: boolean;
}

/** Números de demonstração (fictícios). */
const DEMO: Record<string, MemberWhatsapp> = {
  u1: { whatsapp_number: "5511988887777", daily_digest: true },
  u2: { whatsapp_number: null, daily_digest: true },
  u3: { whatsapp_number: null, daily_digest: false },
};

export async function listTeamWhatsapp(): Promise<TeamWhatsappInfo> {
  if (!isSupabaseConfigured()) return { byId: { ...DEMO }, setupMissing: false };
  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("id, whatsapp_number, daily_digest");
  if (error) {
    return { byId: {}, setupMissing: error.code === "42703" || /whatsapp_number|daily_digest/.test(error.message ?? "") };
  }
  const byId: Record<string, MemberWhatsapp> = {};
  for (const r of (data ?? []) as { id: string; whatsapp_number: string | null; daily_digest: boolean | null }[]) {
    byId[r.id] = { whatsapp_number: r.whatsapp_number ?? null, daily_digest: Boolean(r.daily_digest) };
  }
  return { byId, setupMissing: false };
}
