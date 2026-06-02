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
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("due_date", { ascending: true });
  if (error || !data) return mockTasks;
  return data as Task[];
}

export async function listAppointments(): Promise<Appointment[]> {
  if (!isSupabaseConfigured()) return mockAppointments;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .order("date", { ascending: true });
  if (error || !data) return mockAppointments;
  return data as Appointment[];
}

export async function listFollowUps(): Promise<FollowUp[]> {
  if (!isSupabaseConfigured()) return mockFollowUps;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*")
    .order("scheduled_at", { ascending: true });
  if (error || !data) return mockFollowUps;
  return data as FollowUp[];
}

export async function listNotifications(): Promise<AppNotification[]> {
  if (!isSupabaseConfigured()) return mockNotifications;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return mockNotifications;
  return data as AppNotification[];
}

export async function listDocumentsByLead(leadId: string): Promise<LegalDocument[]> {
  if (!isSupabaseConfigured()) return mockDocuments[leadId] ?? [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error || !data) return mockDocuments[leadId] ?? [];
  return data as LegalDocument[];
}
