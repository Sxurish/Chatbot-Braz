import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { mockTeam } from "@/lib/mock-data";
import type { UserRole } from "@/lib/types";

export interface DigestRecipientView {
  id: string;
  name: string;
  role: UserRole;
  whatsapp_number: string | null;
}

/**
 * Quem recebe o resumo diário (ativo e marcado na Equipe). Leitura com o login
 * de quem está vendo. `setupMissing` quando as colunas da fase 4 ainda não
 * existem (falta rodar supabase/assistente-fase4.sql).
 */
export async function listDigestRecipients(): Promise<{ recipients: DigestRecipientView[]; setupMissing: boolean }> {
  if (!isSupabaseConfigured()) {
    // Demonstração: o plano inicial é só o Dr. Jean receber.
    const recipients = mockTeam
      .filter((u) => u.active && (u.daily_digest ?? u.id === "u1"))
      .map((u) => ({ id: u.id, name: u.name, role: u.role, whatsapp_number: u.whatsapp_number ?? null }));
    return { recipients, setupMissing: false };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, whatsapp_number")
    .eq("active", true)
    .eq("daily_digest", true)
    .order("name");
  if (error) return { recipients: [], setupMissing: true };
  return { recipients: (data as DigestRecipientView[] | null) ?? [], setupMissing: false };
}
