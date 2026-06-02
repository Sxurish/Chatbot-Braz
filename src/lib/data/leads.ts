import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { mockLeads, mockTeam } from "@/lib/mock-data";
import type { Lead, TeamUser } from "@/lib/types";

/**
 * Camada de acesso a dados de leads.
 * Usa o Supabase quando configurado; caso contrário, retorna os dados
 * mockados — mantendo o app totalmente funcional em modo demonstração.
 */

export async function listLeads(): Promise<Lead[]> {
  if (!isSupabaseConfigured()) return mockLeads;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return mockLeads;
  return data as Lead[];
}

export async function getLead(id: string): Promise<Lead | null> {
  if (!isSupabaseConfigured()) {
    return mockLeads.find((l) => l.id === id) ?? null;
  }

  const supabase = createClient();
  const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  return (data as Lead) ?? null;
}

export async function listTeam(): Promise<TeamUser[]> {
  if (!isSupabaseConfigured()) return mockTeam;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, active, last_login, created_at")
    .order("created_at", { ascending: true });

  if (error || !data) return mockTeam;
  return data as TeamUser[];
}
