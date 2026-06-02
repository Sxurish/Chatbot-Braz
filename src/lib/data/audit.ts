import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AUDIT_PAGE_SIZE, type AuditLogRow } from "@/lib/data/audit-types";

export type { AuditLogRow } from "@/lib/data/audit-types";

export interface ListAuditOptions {
  /** "system" filtra logs com user_id null; outro valor filtra pelo uuid. */
  userId?: string | "system" | null;
  page?: number;
}

export interface AuditListResult {
  rows: AuditLogRow[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

const EMPTY: AuditListResult = {
  rows: [],
  total: 0,
  totalPages: 1,
  page: 1,
  pageSize: AUDIT_PAGE_SIZE,
};

export async function listAuditLogs(
  options: ListAuditOptions = {}
): Promise<AuditListResult> {
  const page = Math.max(1, options.page ?? 1);
  if (!isSupabaseConfigured()) return { ...EMPTY, page };

  const supabase = createClient();
  let query = supabase
    .from("audit_logs")
    .select(
      "id, user_id, action, entity_type, entity_id, metadata, created_at, users(name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (options.userId === "system") {
    query = query.is("user_id", null);
  } else if (options.userId) {
    query = query.eq("user_id", options.userId);
  }

  const from = (page - 1) * AUDIT_PAGE_SIZE;
  const to = from + AUDIT_PAGE_SIZE - 1;
  const { data, count, error } = await query.range(from, to);

  if (error || !data) return { ...EMPTY, page };

  const rows: AuditLogRow[] = data.map((r) => {
    const userJoin = r.users as { name?: string | null } | null | undefined;
    return {
      id: r.id,
      user_id: r.user_id,
      user_name: userJoin?.name ?? null,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      created_at: r.created_at,
    };
  });

  const total = count ?? 0;
  return {
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    page,
    pageSize: AUDIT_PAGE_SIZE,
  };
}
