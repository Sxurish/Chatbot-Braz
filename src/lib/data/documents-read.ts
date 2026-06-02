import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { DocumentCategory } from "@/lib/types";
import {
  DOCUMENTS_PAGE_SIZE,
  type DocumentRow,
  type LinkFilter,
  type ReviewStatus,
} from "@/lib/data/documents-types";

export type { DocumentRow } from "@/lib/data/documents-types";

const BUCKET = "documents";
const SIGNED_URL_TTL_SECONDS = 60;

export interface ListDocumentsOptions {
  category?: DocumentCategory | null;
  review?: ReviewStatus | null;
  link?: LinkFilter | null;
  search?: string | null;
  page?: number;
}

export interface DocumentsListResult {
  rows: DocumentRow[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

const EMPTY: DocumentsListResult = {
  rows: [],
  total: 0,
  totalPages: 1,
  page: 1,
  pageSize: DOCUMENTS_PAGE_SIZE,
};

type DocumentRawRow = {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  category: DocumentCategory;
  review_status: ReviewStatus;
  storage_path: string;
  lead_id: string | null;
  client_id: string | null;
  case_id: string | null;
  process_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  leads: { full_name?: string | null } | null;
  clients: { full_name?: string | null } | null;
  cases: { title?: string | null } | null;
  processes: { number?: string | null } | null;
  users: { name?: string | null } | null;
};

export async function listDocuments(
  options: ListDocumentsOptions = {}
): Promise<DocumentsListResult> {
  const page = Math.max(1, options.page ?? 1);
  if (!isSupabaseConfigured()) return { ...EMPTY, page };

  const supabase = createClient();
  let query = supabase
    .from("documents")
    .select(
      `id, file_name, file_type, file_size, category, review_status,
       storage_path, lead_id, client_id, case_id, process_id, uploaded_by, created_at,
       leads(full_name), clients(full_name), cases(title), processes(number),
       users:uploaded_by(name)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (options.category) query = query.eq("category", options.category);
  if (options.review) query = query.eq("review_status", options.review);
  if (options.search?.trim()) {
    query = query.ilike("file_name", `%${options.search.trim()}%`);
  }
  if (options.link === "lead") query = query.not("lead_id", "is", null);
  if (options.link === "client") query = query.not("client_id", "is", null);
  if (options.link === "case") query = query.not("case_id", "is", null);
  if (options.link === "process") query = query.not("process_id", "is", null);
  if (options.link === "none") {
    query = query
      .is("lead_id", null)
      .is("client_id", null)
      .is("case_id", null)
      .is("process_id", null);
  }

  const from = (page - 1) * DOCUMENTS_PAGE_SIZE;
  const to = from + DOCUMENTS_PAGE_SIZE - 1;
  const { data, count, error } = await query.range(from, to);
  if (error || !data) return { ...EMPTY, page };

  const rows: DocumentRow[] = (data as unknown as DocumentRawRow[]).map((r) => ({
    id: r.id,
    file_name: r.file_name,
    file_type: r.file_type,
    file_size: r.file_size,
    category: r.category,
    review_status: r.review_status,
    storage_path: r.storage_path,
    lead_id: r.lead_id,
    lead_name: r.leads?.full_name ?? null,
    client_id: r.client_id,
    client_name: r.clients?.full_name ?? null,
    case_id: r.case_id,
    case_title: r.cases?.title ?? null,
    process_id: r.process_id,
    process_number: r.processes?.number ?? null,
    uploaded_by: r.uploaded_by,
    uploader_name: r.users?.name ?? null,
    created_at: r.created_at,
  }));

  const total = count ?? 0;
  return {
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE)),
    page,
    pageSize: DOCUMENTS_PAGE_SIZE,
  };
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("documents")
    .select(
      `id, file_name, file_type, file_size, category, review_status,
       storage_path, lead_id, client_id, case_id, process_id, uploaded_by, created_at,
       leads(full_name), clients(full_name), cases(title), processes(number),
       users:uploaded_by(name)`
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  const r = data as unknown as DocumentRawRow;
  return {
    id: r.id,
    file_name: r.file_name,
    file_type: r.file_type,
    file_size: r.file_size,
    category: r.category,
    review_status: r.review_status,
    storage_path: r.storage_path,
    lead_id: r.lead_id,
    lead_name: r.leads?.full_name ?? null,
    client_id: r.client_id,
    client_name: r.clients?.full_name ?? null,
    case_id: r.case_id,
    case_title: r.cases?.title ?? null,
    process_id: r.process_id,
    process_number: r.processes?.number ?? null,
    uploaded_by: r.uploaded_by,
    uploader_name: r.users?.name ?? null,
    created_at: r.created_at,
  };
}

export async function createDocumentSignedUrl(
  storagePath: string
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export const DOCUMENTS_BUCKET = BUCKET;
