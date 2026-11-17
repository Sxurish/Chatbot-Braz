import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTeamNames } from "@/lib/data/team-names";
import { mockProcesses } from "@/lib/mock-data-crm";
import { isIsoDate } from "@/lib/prazos/calendar";
import { mockPublications } from "@/lib/intimacoes/mock";
import type { CourtPublication, PublicationStatus } from "@/lib/intimacoes/types";

/**
 * Leitura das intimações (fase 5, parte B). Com o Supabase ligado, usa o
 * login de quem está usando (RLS) e nunca mostra dados fictícios.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;
const TZ = "America/Sao_Paulo";
const LIST_LIMIT = 300;

export interface PublicationFilters {
  /** Padrão: para_conferir. "todas" mostra tudo. */
  status: PublicationStatus | "todas";
  vinculo: "com" | "sem" | null;
  from: string | null;
  to: string | null;
}

const STATUSES: (PublicationStatus | "todas")[] = ["para_conferir", "confirmada", "descartada", "todas"];

/** Lê os filtros da URL, ignorando o que não for válido. */
export function parsePublicationFilters(sp: { status?: string; vinculo?: string; de?: string; ate?: string }): PublicationFilters {
  const status = STATUSES.find((s) => s === sp.status) ?? "para_conferir";
  const vinculo = sp.vinculo === "com" || sp.vinculo === "sem" ? sp.vinculo : null;
  return {
    status,
    vinculo,
    from: isIsoDate(sp.de) ? sp.de : null,
    to: isIsoDate(sp.ate) ? sp.ate : null,
  };
}

/** Para conferir primeiro, da mais antiga para a mais nova; depois as já conferidas, das mais recentes. */
export function sortPublications(items: CourtPublication[]): CourtPublication[] {
  return [...items].sort((a, b) => {
    const openA = a.status === "para_conferir" ? 0 : 1;
    const openB = b.status === "para_conferir" ? 0 : 1;
    if (openA !== openB) return openA - openB;
    if (openA === 0) return a.available_date.localeCompare(b.available_date) || a.created_at.localeCompare(b.created_at);
    return b.available_date.localeCompare(a.available_date) || b.created_at.localeCompare(a.created_at);
  });
}

function todaySp(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Início do dia de hoje em São Paulo, em ISO. */
function startOfTodaySp(): string {
  return new Date(`${todaySp()}T00:00:00-03:00`).toISOString();
}

type Row = CourtPublication & { process?: { process_number: string | null } | null };

async function withNames(rows: Row[]): Promise<CourtPublication[]> {
  const names = await getTeamNames();
  return rows.map(({ process, ...p }) => ({
    ...p,
    process_title: p.process_title ?? process?.process_number ?? null,
    reviewed_by_name: p.reviewed_by ? names[p.reviewed_by] ?? null : null,
  }));
}

function mockRows(): Row[] {
  return mockPublications.map((p) => ({
    ...p,
    process_title: p.process_id ? mockProcesses.find((x) => x.id === p.process_id)?.process_number ?? null : null,
  }));
}

function applyFilters(items: CourtPublication[], f: PublicationFilters): CourtPublication[] {
  return items.filter(
    (p) =>
      (f.status === "todas" || p.status === f.status) &&
      (f.vinculo === null || (f.vinculo === "com" ? Boolean(p.process_id) : !p.process_id)) &&
      (!f.from || p.available_date >= f.from) &&
      (!f.to || p.available_date <= f.to)
  );
}

export async function listPublications(filters: PublicationFilters): Promise<CourtPublication[]> {
  if (!isSupabaseConfigured()) return sortPublications(await withNames(applyFilters(mockRows(), filters) as Row[]));

  const supabase = await createClient();
  let query = supabase
    .from("court_publications")
    .select("*, process:processes(process_number)")
    .order("available_date", { ascending: filters.status === "para_conferir" })
    .limit(LIST_LIMIT);
  if (filters.status !== "todas") query = query.eq("status", filters.status);
  if (filters.vinculo === "com") query = query.not("process_id", "is", null);
  if (filters.vinculo === "sem") query = query.is("process_id", null);
  if (filters.from) query = query.gte("available_date", filters.from);
  if (filters.to) query = query.lte("available_date", filters.to);
  const { data, error } = await query;
  if (error || !data) return [];
  return sortPublications(await withNames(data as Row[]));
}

export interface PublicationCounters {
  toReview: number;
  confirmedToday: number;
  /** Para conferir e sem processo do CRM vinculado. */
  unlinked: number;
}

export async function countPublications(): Promise<PublicationCounters> {
  if (!isSupabaseConfigured()) {
    const start = startOfTodaySp();
    const open = mockPublications.filter((p) => p.status === "para_conferir");
    return {
      toReview: open.length,
      confirmedToday: mockPublications.filter((p) => p.status === "confirmada" && (p.reviewed_at ?? "") >= start).length,
      unlinked: open.filter((p) => !p.process_id).length,
    };
  }
  const supabase = await createClient();
  const head = () => supabase.from("court_publications").select("id", { count: "exact", head: true });
  const [open, today, unlinked] = await Promise.all([
    head().eq("status", "para_conferir"),
    head().eq("status", "confirmada").gte("reviewed_at", startOfTodaySp()),
    head().eq("status", "para_conferir").is("process_id", null),
  ]);
  return { toReview: open.count ?? 0, confirmedToday: today.count ?? 0, unlinked: unlinked.count ?? 0 };
}

export async function getPublication(id: string): Promise<CourtPublication | null> {
  if (!isSupabaseConfigured()) {
    const row = mockRows().find((p) => p.id === id);
    return row ? (await withNames([row]))[0] : null;
  }
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("court_publications")
    .select("*, process:processes(process_number)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return (await withNames([data as Row]))[0];
}

/** Intimações para conferir de um processo (cartão da página do processo). */
export async function listProcessPublicationsToReview(processId: string): Promise<CourtPublication[]> {
  if (!isSupabaseConfigured()) {
    return sortPublications(mockPublications.filter((p) => p.process_id === processId && p.status === "para_conferir"));
  }
  if (!UUID_RE.test(processId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("court_publications")
    .select("*")
    .eq("process_id", processId)
    .eq("status", "para_conferir")
    .order("available_date", { ascending: true })
    .limit(20);
  if (error || !data) return [];
  return data as CourtPublication[];
}
