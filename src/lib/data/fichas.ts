import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { mockCases, mockClients, mockContracts, mockProcesses } from "@/lib/mock-data-crm";
import { mockLeads, mockTasks } from "@/lib/mock-data";
import type { Case, Client, Contract, LegalDocument, Process, Task } from "@/lib/types";

/**
 * Fichas (página própria) de cliente e de caso: o cadastro e o que está
 * ligado a ele. Contratos só voltam para quem pode ver (o banco filtra:
 * Contratos e Financeiro são só do Admin).
 */

export interface ClientFicha {
  client: Client;
  cases: Case[];
  processes: Process[];
  contracts: Contract[];
  documents: LegalDocument[];
}

export interface CaseFicha {
  item: Case;
  client: Pick<Client, "id" | "full_name"> | null;
  lead: { id: string; full_name: string } | null;
  processes: Process[];
  contracts: Contract[];
  tasks: Task[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getClientFicha(id: string): Promise<ClientFicha | null> {
  if (!isSupabaseConfigured()) {
    const client = mockClients.find((c) => c.id === id);
    if (!client) return null;
    const cases = mockCases.filter((c) => c.client_id === id);
    const caseIds = new Set(cases.map((c) => c.id));
    return {
      client,
      cases,
      processes: mockProcesses.filter((p) => p.case_id && caseIds.has(p.case_id)),
      contracts: mockContracts.filter((c) => c.client_id === id),
      documents: [],
    };
  }
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) return null;

  const [cases, contracts, documents] = await Promise.all([
    supabase.from("cases").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("contracts").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
  ]);
  const caseRows = (cases.data as Case[] | null) ?? [];
  const processes = caseRows.length
    ? await supabase
        .from("processes")
        .select("*")
        .in(
          "case_id",
          caseRows.map((c) => c.id)
        )
    : { data: [] };
  return {
    client: client as Client,
    cases: caseRows,
    processes: (processes.data as Process[] | null) ?? [],
    contracts: (contracts.data as Contract[] | null) ?? [],
    documents: (documents.data as LegalDocument[] | null) ?? [],
  };
}

export async function getCaseFicha(id: string): Promise<CaseFicha | null> {
  if (!isSupabaseConfigured()) {
    const item = mockCases.find((c) => c.id === id);
    if (!item) return null;
    const client = mockClients.find((c) => c.id === item.client_id) ?? null;
    const lead = mockLeads.find((l) => l.id === item.lead_id) ?? null;
    return {
      item,
      client: client && { id: client.id, full_name: client.full_name },
      lead: lead && { id: lead.id, full_name: lead.full_name },
      processes: mockProcesses.filter((p) => p.case_id === id),
      contracts: mockContracts.filter((c) => c.case_id === id),
      tasks: mockTasks.filter((t) => t.case_id === id),
    };
  }
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data: item } = await supabase.from("cases").select("*").eq("id", id).maybeSingle();
  if (!item) return null;
  const row = item as Case;

  const [client, lead, processes, contracts, tasks] = await Promise.all([
    row.client_id
      ? supabase.from("clients").select("id, full_name").eq("id", row.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.lead_id
      ? supabase.from("leads").select("id, full_name").eq("id", row.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("processes").select("*").eq("case_id", id),
    supabase.from("contracts").select("*").eq("case_id", id),
    supabase.from("tasks").select("*").eq("case_id", id).order("due_date", { ascending: true }),
  ]);
  return {
    item: row,
    client: (client.data as CaseFicha["client"]) ?? null,
    lead: (lead.data as CaseFicha["lead"]) ?? null,
    processes: (processes.data as Process[] | null) ?? [],
    contracts: (contracts.data as Contract[] | null) ?? [],
    tasks: (tasks.data as Task[] | null) ?? [],
  };
}
