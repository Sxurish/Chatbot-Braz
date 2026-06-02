import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  DSR_OPEN_STATUSES,
  LGPD_PAGE_SIZE,
  type ConsentLogRow,
  type DsrRow,
  type DsrStatus,
  type LgpdMetrics,
} from "@/lib/data/lgpd-types";

export type { ConsentLogRow, DsrRow, LgpdMetrics } from "@/lib/data/lgpd-types";

// ---------------------------------------------------------------------------
// Consentimentos (read-only)
// ---------------------------------------------------------------------------
export interface ListConsentsOptions {
  channel?: string | null;
  /** "accepted" | "denied" | null */
  decision?: "accepted" | "denied" | null;
  page?: number;
}

export interface ConsentListResult {
  rows: ConsentLogRow[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

const EMPTY_CONSENT: ConsentListResult = {
  rows: [],
  total: 0,
  totalPages: 1,
  page: 1,
  pageSize: LGPD_PAGE_SIZE,
};

export async function listConsents(
  options: ListConsentsOptions = {}
): Promise<ConsentListResult> {
  const page = Math.max(1, options.page ?? 1);
  if (!isSupabaseConfigured()) return { ...EMPTY_CONSENT, page };

  const supabase = createClient();
  let query = supabase
    .from("consent_logs")
    .select(
      "id, lead_id, consent_type, consent_given, policy_version, ip_address, user_agent, channel, created_at, leads(full_name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (options.channel) query = query.eq("channel", options.channel);
  if (options.decision === "accepted") query = query.eq("consent_given", true);
  if (options.decision === "denied") query = query.eq("consent_given", false);

  const from = (page - 1) * LGPD_PAGE_SIZE;
  const to = from + LGPD_PAGE_SIZE - 1;
  const { data, count, error } = await query.range(from, to);
  if (error || !data) return { ...EMPTY_CONSENT, page };

  const rows: ConsentLogRow[] = data.map((r) => {
    const leadJoin = r.leads as { full_name?: string | null } | null | undefined;
    return {
      id: r.id,
      lead_id: r.lead_id,
      lead_name: leadJoin?.full_name ?? null,
      consent_type: r.consent_type,
      consent_given: r.consent_given,
      policy_version: r.policy_version,
      ip_address: r.ip_address,
      user_agent: r.user_agent,
      channel: r.channel,
      created_at: r.created_at,
    };
  });

  const total = count ?? 0;
  return {
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / LGPD_PAGE_SIZE)),
    page,
    pageSize: LGPD_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// DSARs
// ---------------------------------------------------------------------------
export interface ListDsrOptions {
  status?: DsrStatus | null;
  page?: number;
}

export interface DsrListResult {
  rows: DsrRow[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

const EMPTY_DSR: DsrListResult = {
  rows: [],
  total: 0,
  totalPages: 1,
  page: 1,
  pageSize: LGPD_PAGE_SIZE,
};

export async function listDsrRequests(
  options: ListDsrOptions = {}
): Promise<DsrListResult> {
  const page = Math.max(1, options.page ?? 1);
  if (!isSupabaseConfigured()) return { ...EMPTY_DSR, page };

  const supabase = createClient();
  let query = supabase
    .from("dsr_requests")
    .select("*", { count: "exact" })
    .order("received_at", { ascending: false });

  if (options.status) query = query.eq("status", options.status);

  const from = (page - 1) * LGPD_PAGE_SIZE;
  const to = from + LGPD_PAGE_SIZE - 1;
  const { data, count, error } = await query.range(from, to);
  if (error || !data) return { ...EMPTY_DSR, page };

  const total = count ?? 0;
  return {
    rows: data as DsrRow[],
    total,
    totalPages: Math.max(1, Math.ceil(total / LGPD_PAGE_SIZE)),
    page,
    pageSize: LGPD_PAGE_SIZE,
  };
}

export async function getDsrRequest(id: string): Promise<DsrRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("dsr_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as DsrRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Métricas agregadas (cards do topo)
// ---------------------------------------------------------------------------
export async function getLgpdMetrics(): Promise<LgpdMetrics> {
  if (!isSupabaseConfigured()) {
    return {
      totalConsents: 0,
      acceptedConsents: 0,
      acceptanceRate: 0,
      openDsrs: 0,
    };
  }

  const supabase = createClient();
  const [total, accepted, open] = await Promise.all([
    supabase.from("consent_logs").select("id", { count: "exact", head: true }),
    supabase
      .from("consent_logs")
      .select("id", { count: "exact", head: true })
      .eq("consent_given", true),
    supabase
      .from("dsr_requests")
      .select("id", { count: "exact", head: true })
      .in("status", DSR_OPEN_STATUSES),
  ]);

  const totalConsents = total.count ?? 0;
  const acceptedConsents = accepted.count ?? 0;

  return {
    totalConsents,
    acceptedConsents,
    acceptanceRate: totalConsents
      ? Math.round((acceptedConsents / totalConsents) * 100)
      : 0,
    openDsrs: open.count ?? 0,
  };
}
