import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DJEN_GEOBLOCK_MESSAGE, fetchAllDjenCommunications } from "@/lib/djen/client";
import { djenKey } from "@/lib/djen/dedupe";
import type { DjenCommunication } from "@/lib/djen/parse";
import { djenSearchWindow, type DjenWindow } from "@/lib/djen/window";
import { cnjOnlyDigits } from "@/lib/datajud/tribunals";
import { computeDeadline } from "@/lib/prazos/compute";
import type { CalendarDay } from "@/lib/prazos/types";

/**
 * Captura das intimações no DJEN (fase 5, parte B).
 *
 * 1. Lê até que dia a última busca deu certo (publication_sync_state).
 * 2. Busca no DJEN do dia anterior a esse até hoje (djenSearchWindow).
 * 3. Fica só com as comunicações que citam a OAB do escritório.
 * 4. Grava sem duplicar (chave djenKey + "on conflict do nothing"), já com
 *    a data de publicação e o processo do CRM com o mesmo número CNJ.
 * 5. Só avança a data quando a busca inteira deu certo.
 *
 * Usa o cliente de serviço (só o servidor grava intimações). Nunca lança:
 * devolve o erro em português.
 */

type AnyClient = Pick<SupabaseClient, "from">;

/** OAB do Dr. Jean Braz. */
export const OFFICE_OAB = "459159";
export const OFFICE_OAB_UF = "SP";

const SOURCE = "djen";
const CHUNK = 100;
const MISSING_TABLE_MESSAGE =
  "Tabelas das intimações não encontradas. Rode supabase/fase5-intimacoes.sql no Supabase.";

export interface CaptureResult {
  ok: boolean;
  error: string | null;
  geoblocked: boolean;
  window: DjenWindow | null;
  /** Comunicações lidas do DJEN (já sem repetidas dentro da busca). */
  fetched: number;
  /** Itens que o DJEN mandou em formato que não deu para aproveitar. */
  rejected: number;
  /** Comunicações que não citam a OAB do escritório (ignoradas). */
  otherOab: number;
  inserted: number;
  /** Já estavam gravadas. */
  duplicates: number;
  /** Já gravadas que o DJEN cancelou depois (só as ainda para conferir). */
  cancelledUpdated: number;
  /** Novas ligadas a um processo do CRM. */
  linked: number;
  /** Já gravadas, sem processo, que agora acharam o processo. */
  linkedLater: number;
  /** Número CNJ que bate com mais de um processo do CRM (fica sem vínculo). */
  ambiguous: number;
  /** A busca parou no limite de páginas antes de ler tudo. */
  truncated: boolean;
  /** A data da última busca com sucesso avançou. */
  advanced: boolean;
  lastSuccessDate: string | null;
  warnings: string[];
}

export interface CaptureOptions {
  now?: Date;
  oab?: string;
  uf?: string;
  /** Repassados ao cliente do DJEN (testes usam delayMs: 0). */
  maxPages?: number;
  delayMs?: number;
}

function emptyResult(): CaptureResult {
  return {
    ok: false,
    error: null,
    geoblocked: false,
    window: null,
    fetched: 0,
    rejected: 0,
    otherOab: 0,
    inserted: 0,
    duplicates: 0,
    cancelledUpdated: 0,
    linked: 0,
    linkedLater: 0,
    ambiguous: 0,
    truncated: false,
    advanced: false,
    lastSuccessDate: null,
    warnings: [],
  };
}

function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /does not exist|could not find the table/i.test(err.message ?? "");
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Funções puras (testadas sem banco)
// ---------------------------------------------------------------------------

/** "459159" → /459\.?159/ (aceita o número com ou sem ponto). */
function oabPattern(oab: string): string {
  const d = oab.replace(/\D/g, "").replace(/^0+/, "");
  const groups: string[] = [];
  for (let end = d.length; end > 0; end -= 3) groups.unshift(d.slice(Math.max(0, end - 3), end));
  return groups.join("\\.?");
}

/**
 * A comunicação cita a OAB? Primeiro pelos advogados (lista do DJEN e os
 * citados no texto); depois por "OAB ... 459.159" no texto, desde que não
 * venha com outro estado.
 */
export function matchOffice(
  item: Pick<DjenCommunication, "lawyers" | "text">,
  oab: string = OFFICE_OAB,
  uf: string = OFFICE_OAB_UF,
): "advogados" | "texto" | null {
  const number = oab.replace(/\D/g, "").replace(/^0+/, "");
  const state = uf.toUpperCase();
  if (item.lawyers.some((l) => l.oab === number && (!l.uf || l.uf === state))) return "advogados";

  const re = new RegExp(`(?<!\\d)${oabPattern(number)}(?!\\d)`, "g");
  for (const m of item.text.matchAll(re)) {
    const at = m.index ?? 0;
    const before = item.text.slice(Math.max(0, at - 30), at);
    const after = item.text.slice(at + m[0].length, at + m[0].length + 8);
    if (!/OAB/i.test(before)) continue;
    const otherUf = /^\s*[-/]\s*([A-Z]{2})\b/.exec(after);
    if (otherUf && otherUf[1] !== state) continue;
    return "texto";
  }
  return null;
}

/** Publicação = 1º dia útil seguinte à disponibilização (mesma conta da parte A). */
export function publicationDateFor(availableDate: string, calendarDays: CalendarDay[]): string | null {
  try {
    return computeDeadline({ start: { kind: "disponibilizacao", date: availableDate }, days: 1, unit: "uteis" }, calendarDays)
      .publicationDate ?? null;
  } catch {
    return null;
  }
}

/** Índice "só dígitos do CNJ" → ids dos processos do CRM. */
export function buildProcessIndex(rows: { id: string; process_number: string | null }[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const r of rows) {
    const d = cnjOnlyDigits(r.process_number);
    if (d.length !== 20) continue;
    const list = index.get(d) ?? [];
    if (!list.includes(r.id)) list.push(r.id);
    index.set(d, list);
  }
  return index;
}

/**
 * Processo do CRM para a comunicação: o número principal e, se não achar,
 * os números citados no texto (ex.: processo principal de um incidente).
 * Número que bate com mais de um processo não liga (a equipe escolhe).
 */
export function findProcessId(
  item: Pick<DjenCommunication, "processNumber" | "relatedProcessNumbers">,
  index: Map<string, string[]>,
): { processId: string | null; ambiguous: boolean } {
  let ambiguous = false;
  for (const n of [item.processNumber, ...item.relatedProcessNumbers]) {
    const ids = n ? index.get(cnjOnlyDigits(n)) : undefined;
    if (!ids || ids.length === 0) continue;
    if (ids.length === 1) return { processId: ids[0], ambiguous: false };
    ambiguous = true;
  }
  return { processId: null, ambiguous };
}

/** Linha para court_publications. */
export function toPublicationRow(
  item: DjenCommunication,
  extra: { processId: string | null; publicationDate: string | null; matchedBy: "advogados" | "texto" },
) {
  return {
    source: SOURCE,
    external_key: djenKey(item),
    external_id: item.externalId,
    hash: item.hash,
    available_date: item.availableDate,
    publication_date: extra.publicationDate,
    tribunal: item.tribunal,
    organ: item.organ,
    kind: item.kind,
    document_type: item.documentType,
    class_name: item.className,
    process_number: item.processNumber,
    process_number_masked: item.processNumberMasked,
    process_id: extra.processId,
    text: item.text,
    parties: item.parties,
    lawyers: item.lawyers,
    link: item.link,
    cancelled: item.cancelled,
    cancel_reason: item.cancelReason,
    raw: { related_process_numbers: item.relatedProcessNumbers, oab_match: extra.matchedBy },
  };
}

// ---------------------------------------------------------------------------
// Captura
// ---------------------------------------------------------------------------

interface ExistingRow {
  id: string;
  external_key: string;
  status: string;
  cancelled: boolean;
  process_id: string | null;
}

async function saveState(
  db: AnyClient,
  patch: { last_success_date?: string; last_run_at: string; last_error: string | null },
): Promise<string | null> {
  try {
    const { error } = await db.from("publication_sync_state").upsert({ source: SOURCE, ...patch }, { onConflict: "source" });
    return error ? error.message : null;
  } catch (err) {
    return (err as Error)?.message ?? String(err);
  }
}

export async function captureDjenPublications(db: AnyClient, opts: CaptureOptions = {}): Promise<CaptureResult> {
  const out = emptyResult();
  const now = opts.now ?? new Date();
  const runAt = now.toISOString();
  const oab = opts.oab ?? OFFICE_OAB;
  const uf = opts.uf ?? OFFICE_OAB_UF;

  // 1. Até onde a última busca deu certo.
  const state = await db.from("publication_sync_state").select("last_success_date").eq("source", SOURCE).maybeSingle();
  if (state.error) {
    out.error = isMissingTable(state.error) ? MISSING_TABLE_MESSAGE : `Falha ao ler a situação da busca: ${state.error.message}`;
    return out;
  }
  const last = (state.data as { last_success_date: string | null } | null)?.last_success_date ?? null;
  out.lastSuccessDate = last;
  const window = djenSearchWindow(last, now);
  out.window = window;

  // 2. Busca no DJEN (todas as páginas).
  const res = await fetchAllDjenCommunications({
    oab,
    uf,
    from: window.from,
    to: window.to,
    maxPages: opts.maxPages,
    delayMs: opts.delayMs,
  });
  out.rejected = res.rejected.length;
  if (res.rejected.length > 0) {
    out.warnings.push(`${res.rejected.length} item(ns) do DJEN em formato inesperado foram ignorados.`);
  }
  if (!res.ok) {
    out.error = res.error;
    out.geoblocked = res.error.includes(DJEN_GEOBLOCK_MESSAGE);
  } else if (res.truncated) {
    out.truncated = true;
    out.warnings.push(
      `A busca parou no limite de ${res.pages} páginas sem ler tudo. A data não avançou: a próxima execução busca o mesmo período de novo.`,
    );
  }
  out.fetched = res.items.length;

  // 3. Só as que citam a OAB do escritório.
  const mine: { item: DjenCommunication; matchedBy: "advogados" | "texto" }[] = [];
  for (const item of res.items) {
    const matchedBy = matchOffice(item, oab, uf);
    if (matchedBy) mine.push({ item, matchedBy });
    else out.otherOab++;
  }

  // 4. Grava o que veio (mesmo numa busca que falhou no meio: a chave evita duplicar).
  const saveError = mine.length > 0 ? await savePublications(db, mine, out) : null;
  if (saveError && !out.error) out.error = saveError;

  // 5. Situação da busca. Só avança quando tudo deu certo.
  out.ok = !out.error;
  const advance = out.ok && !out.truncated;
  const stateError = await saveState(db, {
    ...(advance ? { last_success_date: window.to } : {}),
    last_run_at: runAt,
    last_error: out.error ?? (out.truncated ? out.warnings[out.warnings.length - 1] : null),
  });
  if (stateError) {
    out.warnings.push(`Não foi possível gravar a situação da busca: ${stateError}`);
  } else if (advance) {
    out.advanced = true;
    out.lastSuccessDate = window.to;
  }
  return out;
}

/** Grava as intimações novas e atualiza as já gravadas. Devolve o erro, se houver. */
async function savePublications(
  db: AnyClient,
  mine: { item: DjenCommunication; matchedBy: "advogados" | "texto" }[],
  out: CaptureResult,
): Promise<string | null> {
  // Calendário ativo (só dias do TJSP, sem os removidos) e processos do CRM.
  const [cal, procs] = await Promise.all([
    db.from("forensic_calendar_days").select("*").eq("court", "TJSP").is("removed_at", null).limit(5000),
    db.from("processes").select("id, process_number").not("process_number", "is", null).limit(10000),
  ]);
  if (cal.error) {
    out.warnings.push("Calendário forense não lido: a data de publicação considerou só fins de semana, feriados fixos e recesso.");
  }
  if (procs.error) {
    out.warnings.push("Processos não lidos: as intimações ficaram sem vínculo com processo.");
  }
  const calendarDays = (cal.data ?? []) as CalendarDay[];
  const index = buildProcessIndex((procs.data ?? []) as { id: string; process_number: string | null }[]);

  // Já gravadas?
  const keys = mine.map((m) => djenKey(m.item));
  const existing = new Map<string, ExistingRow>();
  for (const part of chunks(keys, CHUNK)) {
    const { data, error } = await db
      .from("court_publications")
      .select("id, external_key, status, cancelled, process_id")
      .in("external_key", part);
    if (error) {
      return isMissingTable(error) ? MISSING_TABLE_MESSAGE : `Falha ao ler as intimações gravadas: ${error.message}`;
    }
    for (const row of (data ?? []) as ExistingRow[]) existing.set(row.external_key, row);
  }

  const fresh: ReturnType<typeof toPublicationRow>[] = [];
  const pubDates = new Map<string, string | null>();
  for (const { item, matchedBy } of mine) {
    const key = djenKey(item);
    const link = findProcessId(item, index);
    const old = existing.get(key);
    if (old) {
      out.duplicates++;
      if (old.status !== "para_conferir") continue;
      // Cancelada no DJEN depois de gravada: marca (só enquanto para conferir).
      const patch: Record<string, unknown> = {};
      if (item.cancelled && !old.cancelled) {
        patch.cancelled = true;
        patch.cancel_reason = item.cancelReason;
      }
      // Processo cadastrado depois da intimação: liga agora.
      if (!old.process_id && link.processId) patch.process_id = link.processId;
      if (Object.keys(patch).length === 0) continue;
      const { data, error } = await db
        .from("court_publications")
        .update(patch)
        .eq("id", old.id)
        .eq("status", "para_conferir")
        .select("id");
      if (error) {
        out.warnings.push(`Não foi possível atualizar a intimação ${old.external_key}: ${error.message}`);
        continue;
      }
      if ((data ?? []).length > 0) {
        if (patch.cancelled) out.cancelledUpdated++;
        if (patch.process_id) out.linkedLater++;
      }
      continue;
    }
    if (link.ambiguous && !link.processId) out.ambiguous++;
    let pubDate = pubDates.get(item.availableDate);
    if (pubDate === undefined) {
      pubDate = publicationDateFor(item.availableDate, calendarDays);
      pubDates.set(item.availableDate, pubDate);
    }
    fresh.push(toPublicationRow(item, { processId: link.processId, publicationDate: pubDate, matchedBy }));
  }

  for (const part of chunks(fresh, CHUNK)) {
    const { data, error } = await db
      .from("court_publications")
      .upsert(part, { onConflict: "external_key", ignoreDuplicates: true })
      .select("id, external_key, process_id");
    if (error) {
      return isMissingTable(error) ? MISSING_TABLE_MESSAGE : `Falha ao gravar as intimações: ${error.message}`;
    }
    const rows = (data ?? []) as { process_id: string | null }[];
    out.inserted += rows.length;
    out.linked += rows.filter((r) => r.process_id).length;
    // Gravada por outra execução ao mesmo tempo: conta como repetida.
    out.duplicates += part.length - rows.length;
  }
  return null;
}
