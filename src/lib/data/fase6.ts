import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  mockCases,
  mockClients,
  mockContracts,
  mockPayments,
  mockProcesses,
} from "@/lib/mock-data-crm";
import type { Case, Client, Contract, Payment, Process } from "@/lib/types";

/**
 * Camada de acesso a dados das entidades da Fase 6.
 * Lê do Supabase quando configurado; caso contrário, retorna os mocks.
 */

export async function listClients(): Promise<Client[]> {
  if (!isSupabaseConfigured()) return mockClients;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return mockClients;
  return data as Client[];
}

export async function listCases(): Promise<Case[]> {
  if (!isSupabaseConfigured()) return mockCases;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return mockCases;
  return data as Case[];
}

export async function listProcesses(): Promise<Process[]> {
  if (!isSupabaseConfigured()) return mockProcesses;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("processes")
    .select("*")
    .order("next_deadline", { ascending: true });
  if (error || !data) return mockProcesses;
  return data as Process[];
}

export async function listContracts(): Promise<Contract[]> {
  if (!isSupabaseConfigured()) return mockContracts;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return mockContracts;
  return data as Contract[];
}

export async function listPayments(): Promise<Payment[]> {
  if (!isSupabaseConfigured()) return mockPayments;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("due_date", { ascending: true });
  if (error || !data) return mockPayments;
  return data as Payment[];
}
