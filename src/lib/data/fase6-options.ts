import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  mockClients,
  mockCases,
  mockContracts,
} from "@/lib/mock-data-crm";
import type { Case, Client, Contract } from "@/lib/types";

export interface SelectOption {
  id: string;
  label: string;
}

export async function listClientOptions(): Promise<SelectOption[]> {
  if (!isSupabaseConfigured()) {
    return mockClients.map((c) => ({ id: c.id, label: c.full_name }));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, full_name")
    .order("full_name", { ascending: true });
  return (data as Pick<Client, "id" | "full_name">[] | null ?? []).map((c) => ({
    id: c.id,
    label: c.full_name,
  }));
}

export async function listCaseOptions(): Promise<SelectOption[]> {
  if (!isSupabaseConfigured()) {
    return mockCases.map((c) => ({ id: c.id, label: c.title }));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("cases")
    .select("id, title")
    .order("created_at", { ascending: false });
  return (data as Pick<Case, "id" | "title">[] | null ?? []).map((c) => ({
    id: c.id,
    label: c.title,
  }));
}

export async function listContractOptions(): Promise<SelectOption[]> {
  if (!isSupabaseConfigured()) {
    return mockContracts.map((c) => ({
      id: c.id,
      label: c.contract_type
        ? `${c.contract_type} · ${c.id.slice(0, 8)}`
        : `Contrato #${c.id.slice(0, 8)}`,
    }));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("contracts")
    .select("id, contract_type, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return (
    data as Pick<Contract, "id" | "contract_type">[] | null ?? []
  ).map((c) => ({
    id: c.id,
    label: c.contract_type
      ? `${c.contract_type} · ${c.id.slice(0, 8)}`
      : `Contrato #${c.id.slice(0, 8)}`,
  }));
}
