import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/assistant/links";
import { buildTemplatePayload, sendWhatsappTemplate, type DigestSendResult } from "@/lib/digest/whatsapp-template";
import type { CalendarDay } from "@/lib/prazos/types";
import type { ServiceClient } from "@/lib/supabase/request-context";
import { intimacaoTemplateConfig, intimacaoTemplateParams } from "./notify-format";
import { comarcaOf, computePublicationDeadline } from "./rules";
import type { CourtPublication } from "./types";

/**
 * Aviso das intimações novas pelo WhatsApp (fase 5, parte B). Chamado pela
 * rotina de hora em hora, depois da leitura pela IA.
 *
 * - Uma mensagem (modelo aprovado da Meta) por intimação: processo, resumo,
 *   prazo sugerido, data final calculada e o link da conferência. Não agrupa:
 *   o modelo da Meta não aceita quebra de linha nas variáveis, e uma mensagem
 *   por intimação deixa claro o que o "OK" confirma.
 * - Quem recebe: UMA pessoa por intimação, ativa, Admin ou Advogado, com
 *   WhatsApp cadastrado na Equipe. Preferência para quem tem o nome de um dos
 *   advogados intimados; senão o Admin mais antigo (na prática, o Dr. Jean).
 *   whatsapp_notified_to guarda essa pessoa: só ela confirma com "OK".
 * - Só intimações para conferir, não canceladas, capturadas há até 3 dias,
 *   já passadas pela IA (lida, falhou ou sem leitura). As pendentes de
 *   leitura esperam a próxima execução.
 * - Sem WHATSAPP_INTIMACAO_TEMPLATE ou sem as credenciais do WhatsApp: não
 *   manda nada e conta como "pulada" (o resumo diário e a tela continuam).
 * - No máximo NOTIFY_LIMIT mensagens por execução.
 */

export const NOTIFY_LIMIT = 10;
/** Intimação capturada há mais tempo que isso não gera aviso (ex.: carga inicial). */
export const NOTIFY_MAX_AGE_DAYS = 3;

export interface NotifyResult {
  sent: number;
  skipped: number;
  errors: number;
}

type Env = Record<string, string | undefined>;
type AnyClient = Pick<SupabaseClient, "from">;

export interface NotifyDeps {
  env?: Env;
  now?: Date;
  /** Envio do modelo (falso nos testes). */
  send?: (input: { to: string; params: [string, number][] }) => Promise<DigestSendResult>;
}

type PubRow = Pick<
  CourtPublication,
  | "id"
  | "available_date"
  | "process_id"
  | "process_number"
  | "process_number_masked"
  | "tribunal"
  | "kind"
  | "lawyers"
  | "ai_status"
  | "ai_reading"
>;

interface Recipient {
  id: string;
  name: string;
  role: string;
  whatsapp_number: string;
}

const PUB_COLUMNS =
  "id, available_date, process_id, process_number, process_number_masked, tribunal, kind, lawyers, ai_status, ai_reading";

function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !["dr", "dra", "de", "da", "do", "dos", "das"].includes(w));
}

/** A pessoa tem o primeiro e o último nome de um dos advogados intimados? */
function matchesLawyer(person: Recipient, lawyers: CourtPublication["lawyers"]): boolean {
  const w = words(person.name);
  if (w.length < 2) return false;
  const first = w[0];
  const last = w[w.length - 1];
  return (lawyers ?? []).some((l) => {
    const lw = new Set(words(l.name ?? ""));
    return lw.has(first) && lw.has(last);
  });
}

/** Quem recebe o aviso desta intimação. Lista já vem com Admins primeiro. */
export function pickRecipient(recipients: Recipient[], pub: Pick<CourtPublication, "lawyers">): Recipient | null {
  return recipients.find((r) => matchesLawyer(r, pub.lawyers)) ?? recipients[0] ?? null;
}

async function loadRecipients(db: AnyClient): Promise<Recipient[]> {
  const { data, error } = await db
    .from("users")
    .select("id, name, role, whatsapp_number, created_at")
    .eq("active", true)
    .in("role", ["admin", "advogado"])
    .not("whatsapp_number", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Não deu para ler a equipe: ${error.message}`);
  const rows = ((data ?? []) as Recipient[]).filter((r) => String(r.whatsapp_number ?? "").replace(/\D/g, "").length >= 10);
  return [...rows.filter((r) => r.role === "admin"), ...rows.filter((r) => r.role !== "admin")];
}

async function loadCalendar(db: AnyClient): Promise<CalendarDay[] | null> {
  const { data, error } = await db
    .from("forensic_calendar_days")
    .select("*")
    .eq("court", "TJSP")
    .is("removed_at", null)
    .order("day", { ascending: true })
    .limit(5000);
  if (error || !data) return null;
  return data as CalendarDay[];
}

/** Data final pela sugestão da IA (mesma conta da tela e da confirmação). */
export function suggestedFinalDate(
  pub: Pick<CourtPublication, "available_date" | "ai_status" | "ai_reading">,
  jurisdiction: string | null,
  calendar: CalendarDay[] | null
): string | null {
  const r = pub.ai_reading;
  if (!calendar || pub.ai_status !== "pronta" || !r?.suggestedDays || !r.suggestedUnit) return null;
  try {
    return computePublicationDeadline(
      pub,
      {
        days: r.suggestedDays,
        unit: r.suggestedUnit,
        startKind: r.startKind === "intimacao" ? "intimacao" : "disponibilizacao",
        dobro: Boolean(r.dobro),
        comarca: comarcaOf(jurisdiction),
      },
      calendar
    ).result.finalDate;
  } catch {
    return null;
  }
}

export async function notifyNewPublications(
  db: ServiceClient | AnyClient,
  deps: NotifyDeps = {}
): Promise<NotifyResult> {
  const out: NotifyResult = { sent: 0, skipped: 0, errors: 0 };
  const sb = db as AnyClient;
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();

  const since = new Date(now.getTime() - NOTIFY_MAX_AGE_DAYS * 86_400_000).toISOString();
  const { data, error } = await sb
    .from("court_publications")
    .select(PUB_COLUMNS)
    .eq("status", "para_conferir")
    .eq("cancelled", false)
    .is("whatsapp_notified_at", null)
    .in("ai_status", ["pronta", "falhou", "desligada"])
    .gte("captured_at", since)
    .order("available_date", { ascending: true })
    .limit(NOTIFY_LIMIT);
  if (error) throw new Error(`Não deu para ler as intimações a avisar: ${error.message}`);
  const pubs = (data ?? []) as unknown as PubRow[];
  if (pubs.length === 0) return out;

  const cfg = intimacaoTemplateConfig(env);
  if (!cfg.enabled || !cfg.name) {
    out.skipped = pubs.length;
    return out;
  }
  const templateName = cfg.name;
  const send =
    deps.send ??
    ((msg: { to: string; params: [string, number][] }) =>
      sendWhatsappTemplate(
        {
          to: msg.to,
          name: templateName,
          lang: cfg.lang,
          paramCount: 5,
          build: (to) => buildTemplatePayload({ to, name: templateName, lang: cfg.lang, params: msg.params }),
        },
        { env }
      ));

  const recipients = await loadRecipients(sb);
  if (recipients.length === 0) {
    out.skipped = pubs.length;
    return out;
  }

  // Processos ligados (título e comarca) e calendário forense, uma vez só.
  const processIds = [...new Set(pubs.map((p) => p.process_id).filter((x): x is string => Boolean(x)))];
  const processes = new Map<string, { subject: string | null; jurisdiction: string | null }>();
  if (processIds.length) {
    const { data: procs } = await sb.from("processes").select("id, subject, jurisdiction").in("id", processIds);
    for (const p of (procs ?? []) as { id: string; subject: string | null; jurisdiction: string | null }[]) {
      processes.set(p.id, p);
    }
  }
  const calendar = pubs.some((p) => p.ai_status === "pronta") ? await loadCalendar(sb) : null;
  const base = appBaseUrl();

  for (const pub of pubs) {
    const to = pickRecipient(recipients, pub);
    if (!to) {
      out.skipped++;
      continue;
    }
    const proc = pub.process_id ? processes.get(pub.process_id) : undefined;
    const finalDate = suggestedFinalDate(pub, proc?.jurisdiction ?? null, calendar);
    const params = intimacaoTemplateParams(
      { ...pub, process_title: proc?.subject ?? (pub.process_id ? null : "fora do CRM") },
      finalDate,
      `${base}/intimacoes/${pub.id}`
    );
    const res = await send({ to: to.whatsapp_number, params });
    if (!res.ok) {
      out.errors++;
      console.error("[intimacoes whatsapp] envio", res.error);
      continue;
    }
    const { error: markErr } = await sb
      .from("court_publications")
      .update({ whatsapp_notified_at: new Date().toISOString(), whatsapp_notified_to: to.id })
      .eq("id", pub.id)
      .is("whatsapp_notified_at", null);
    if (markErr) console.error("[intimacoes whatsapp] marcar aviso", markErr.message);
    out.sent++;
  }
  return out;
}
