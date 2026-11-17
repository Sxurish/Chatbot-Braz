import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listTeam } from "@/lib/data/leads";
import { mockLeads } from "@/lib/mock-data";
import type { SelectOption } from "@/lib/data/fase6-options";

/** Quem pode gravar cadastros: perfil ativo que não é só Visualizador. */
export async function canWriteRecords(): Promise<boolean> {
  const user = await getCurrentUser();
  return user.active && user.role !== "visualizador";
}

/** Equipe ativa, para o campo "Responsável". */
export async function listResponsibleOptions(): Promise<SelectOption[]> {
  const team = await listTeam();
  return team
    .filter((u) => u.active && u.role !== "visualizador")
    .map((u) => ({ id: u.id, label: u.name }));
}

/** Leads mais recentes, para vincular um caso a um lead. */
export async function listLeadOptions(): Promise<SelectOption[]> {
  if (!isSupabaseConfigured()) {
    return mockLeads.map((l) => ({ id: l.id, label: l.full_name }));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, full_name")
    .order("created_at", { ascending: false })
    .limit(300);
  return ((data as { id: string; full_name: string }[] | null) ?? []).map((l) => ({
    id: l.id,
    label: l.full_name,
  }));
}
