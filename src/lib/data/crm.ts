import { getSessionProfile } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  mockAppointments,
  mockDocuments,
  mockFollowUps,
  mockNotifications,
  mockTasks,
} from "@/lib/mock-data";
import type {
  AppNotification,
  Appointment,
  FollowUp,
  LegalDocument,
  Task,
} from "@/lib/types";

/**
 * Camada de acesso a dados das entidades operacionais do CRM.
 * Lê do Supabase quando configurado; caso contrário, retorna os mocks —
 * mantendo o app funcional em modo demonstração.
 */

export async function listTasks(): Promise<Task[]> {
  if (!isSupabaseConfigured()) return mockTasks;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("due_date", { ascending: true });
  if (error || !data) return []; // com Supabase ligado, nunca mostrar dados fictícios
  return data as Task[];
}

export async function listAppointments(): Promise<Appointment[]> {
  if (!isSupabaseConfigured()) return mockAppointments;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .order("date", { ascending: true });
  if (error || !data) return []; // com Supabase ligado, nunca mostrar dados fictícios
  return data as Appointment[];
}

export async function listFollowUps(): Promise<FollowUp[]> {
  if (!isSupabaseConfigured()) return mockFollowUps;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*")
    .order("scheduled_at", { ascending: true });
  if (error || !data) return []; // com Supabase ligado, nunca mostrar dados fictícios
  return data as FollowUp[];
}

export async function listNotifications(): Promise<AppNotification[]> {
  if (!isSupabaseConfigured()) return mockNotifications;
  const supabase = await createClient();
  const { user } = await getSessionProfile();
  // Cada pessoa vê as notificações dela e as gerais (sem destinatário).
  let query = supabase.from("notifications").select("*");
  query = user ? query.or(`user_id.is.null,user_id.eq.${user.id}`) : query.is("user_id", null);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error || !data) return []; // com Supabase ligado, nunca mostrar dados fictícios
  return data as AppNotification[];
}

export async function listDocumentsByLead(leadId: string): Promise<LegalDocument[]> {
  if (!isSupabaseConfigured()) return mockDocuments[leadId] ?? [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error || !data) return []; // com Supabase ligado, nunca mostrar dados fictícios
  return data as LegalDocument[];
}
