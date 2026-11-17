import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeReply, parseConfirmReply } from "@/lib/assistant/whatsapp-format";
import { brDayLong } from "@/lib/prazos/calendar";
import { confirmPublication, defaultConfirmInput } from "./confirm";
import { processLabel, suggestionLabel } from "./notify-format";
import type { ConfirmPublicationInput, ConfirmPublicationResult, CourtPublication } from "./types";

/**
 * "OK" no WhatsApp para confirmar intimações avisadas (fase 5, parte B).
 *
 * Regras (as mais simples e seguras):
 *  - Só vale para intimações avisadas a ESTA pessoa (whatsapp_notified_to),
 *    ainda para conferir e não canceladas. Visualizador nunca confirma.
 *  - Rascunho do assistente esperando o OK tem prioridade: o "OK" continua
 *    gravando o rascunho, como antes (quem chama confere isso).
 *  - "OK" sozinho com UMA intimação esperando: confirma essa.
 *  - "OK" sozinho com VÁRIAS: não confirma nada; manda a lista numerada
 *    (da mais antiga avisada para a mais nova) e pede "OK 1", "OK 2"... ou
 *    "OK todas". A numeração é sempre a da lista mandada por último.
 *  - "OK" só confirma o que a pessoa viu: a sugestão da IA tem de ser a
 *    mesma do aviso (lida antes do aviso) e defaultConfirmInput não pode ser
 *    nulo. Senão a resposta explica e manda o link do painel.
 *  - Toda resposta que confirma diz a data final e o link.
 */

export type IntimacaoReply = { kind: "next" } | { kind: "index"; n: number } | { kind: "all" };

const ALL_WORDS = new Set(["todas", "todos", "tudo", "as todas", "todas elas"]);
const OK_PREFIX = /^(ok|okay|okey|sim|confirmo|confirma|confirmar|pode confirmar)$/;

/** Lê "OK", "OK 2", "ok #3", "OK todas". Outras mensagens: null. */
export function parseIntimacaoReply(text: string): IntimacaoReply | null {
  const norm = normalizeReply(text);
  if (!norm || norm.length > 30) return null;
  const m = /^(.+?)\s*(?:n[ºo°.]?\s*|#\s*)?(\d{1,2})$/.exec(norm);
  if (m && OK_PREFIX.test(m[1].trim())) {
    const n = Number(m[2]);
    return n >= 1 ? { kind: "index", n } : null;
  }
  const words = norm.split(" ");
  if (words.length >= 2 && OK_PREFIX.test(words[0]) && ALL_WORDS.has(words.slice(1).join(" "))) {
    return { kind: "all" };
  }
  if (words.length >= 3 && OK_PREFIX.test(words.slice(0, 2).join(" ")) && ALL_WORDS.has(words.slice(2).join(" "))) {
    return { kind: "all" };
  }
  return parseConfirmReply(text) === "confirm" ? { kind: "next" } : null;
}

/** Acesso ao banco usado pelo "OK" (falso nos testes). */
export interface IntimacaoWhatsappStore {
  /** Intimações avisadas a esta pessoa, para conferir, da mais antiga avisada para a mais nova. */
  listNotified(userId: string): Promise<(CourtPublication & { process_title?: string | null })[]>;
  confirm(input: ConfirmPublicationInput): Promise<ConfirmPublicationResult>;
}

const LIST_LIMIT = 20;

export function dbIntimacaoStore(db: SupabaseClient): IntimacaoWhatsappStore {
  return {
    async listNotified(userId) {
      const { data, error } = await db
        .from("court_publications")
        .select("*")
        .eq("whatsapp_notified_to", userId)
        .eq("status", "para_conferir")
        .eq("cancelled", false)
        .not("whatsapp_notified_at", "is", null)
        .order("whatsapp_notified_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(LIST_LIMIT);
      if (error) {
        // Ex.: banco sem a fase 5. O "OK" segue o caminho de antes.
        console.error("[whatsapp intimacoes] leitura", error.message);
        return [];
      }
      const pubs = (data ?? []) as CourtPublication[];
      const ids = [...new Set(pubs.map((p) => p.process_id).filter((x): x is string => Boolean(x)))];
      const titles = new Map<string, string | null>();
      if (ids.length) {
        const { data: procs } = await db.from("processes").select("id, subject").in("id", ids);
        for (const p of (procs ?? []) as { id: string; subject: string | null }[]) titles.set(p.id, p.subject);
      }
      return pubs.map((p) => ({ ...p, process_title: p.process_id ? titles.get(p.process_id) ?? null : null }));
    },
    confirm: (input) => confirmPublication(db, input),
  };
}

/**
 * Entrada de confirmação pelo WhatsApp, ou null quando o "OK" não pode
 * confirmar: sem sugestão segura (defaultConfirmInput nulo) ou a leitura da IA
 * mudou depois do aviso (a pessoa não viu esta sugestão).
 */
export function whatsappConfirmInput(pub: CourtPublication, userId: string): ConfirmPublicationInput | null {
  if (!pub.whatsapp_notified_at || !pub.ai_read_at) return null;
  if (Date.parse(pub.ai_read_at) > Date.parse(pub.whatsapp_notified_at)) return null;
  return defaultConfirmInput(pub, userId, "whatsapp");
}

type Pub = CourtPublication & { process_title?: string | null };

function listLines(pubs: Pub[], link: (p: Pub) => string): string[] {
  return pubs.map((p, i) => {
    const can = whatsappConfirmInput(p, "x") ? "" : " _(confira no painel)_";
    return `${i + 1}) ${processLabel(p, 80)}: ${p.ai_reading?.actType ?? p.kind ?? "Intimação"}. Prazo: ${suggestionLabel(p)}${can}\n   ${link(p)}`;
  });
}

function listMessage(head: string, pubs: Pub[], link: (p: Pub) => string): string {
  const ok = pubs.filter((p) => whatsappConfirmInput(p, "x"));
  const how =
    ok.length === 0
      ? "Nenhuma delas pode ser confirmada por aqui: abra o painel."
      : pubs.length === 1
        ? "Responda *OK* para confirmar."
        : `Responda *OK 1*, *OK 2*... para confirmar uma, ou *OK todas* para confirmar ${ok.length === pubs.length ? "todas" : `as ${ok.length} com sugestão segura`}.`;
  return [head, "", ...listLines(pubs, link), "", how].join("\n");
}

export type IntimacaoOkOutcome = "intimacao_confirmed" | "intimacao_list" | "intimacao_link";

export interface IntimacaoOkResult {
  outcome: IntimacaoOkOutcome;
  text: string;
}

async function confirmOne(
  store: IntimacaoWhatsappStore,
  pub: Pub,
  userId: string,
  link: (p: Pub) => string
): Promise<{ ok: boolean; line: string }> {
  const input = whatsappConfirmInput(pub, userId);
  const label = processLabel(pub, 80);
  if (!input) {
    return {
      ok: false,
      line: `• ${label}: não confirmei por aqui porque a IA não deixou uma sugestão de prazo segura (ou ela mudou depois do aviso). Confira e confirme no painel: ${link(pub)}`,
    };
  }
  const r = await store.confirm(input);
  if (!r.ok) return { ok: false, line: `• ${label}: não confirmei. ${r.error} Abra o painel: ${link(pub)}` };
  return {
    ok: true,
    line: `• ${label}: ${input.title}, prazo até *${brDayLong(r.finalDate)}*. Tarefa criada. ${link(pub)}`,
  };
}

/**
 * Trata o "OK" de intimação. Devolve null quando não há intimação avisada a
 * esta pessoa (a mensagem segue o caminho normal do assistente).
 * `plainOkAllowed`: o "OK" sozinho responde ao aviso (e não ao resumo diário
 * ou a uma conversa com o assistente que veio depois dele).
 */
export async function handleIntimacaoReply(input: {
  reply: IntimacaoReply;
  userId: string;
  store: IntimacaoWhatsappStore;
  baseUrl: string;
  /** Recebe a data do aviso mais recente e diz se o "OK" sozinho vale. */
  plainOkAllowed?: (latestNotifiedAt: string) => boolean | Promise<boolean>;
}): Promise<IntimacaoOkResult | null> {
  const { reply, userId, store } = input;
  const pubs = await store.listNotified(userId);
  if (pubs.length === 0) return null;
  const link = (p: Pub) => `${input.baseUrl}/intimacoes/${p.id}`;

  if (reply.kind === "next") {
    const latest = pubs.reduce((acc, p) => (p.whatsapp_notified_at! > acc ? p.whatsapp_notified_at! : acc), "");
    if (input.plainOkAllowed && !(await input.plainOkAllowed(latest))) return null;
    if (pubs.length > 1) {
      return {
        outcome: "intimacao_list",
        text: listMessage(`Há ${pubs.length} intimações esperando a sua conferência. Qual delas?`, pubs, link),
      };
    }
  }

  if (reply.kind === "index" && reply.n > pubs.length) {
    return {
      outcome: "intimacao_list",
      text: listMessage(
        `Não achei a intimação ${reply.n}. ${pubs.length === 1 ? "Há 1 esperando a sua conferência:" : `Há ${pubs.length} esperando a sua conferência:`}`,
        pubs,
        link
      ),
    };
  }

  const targets = reply.kind === "all" ? pubs : [pubs[reply.kind === "index" ? reply.n - 1 : 0]];
  const results: { ok: boolean; line: string }[] = [];
  for (const p of targets) results.push(await confirmOne(store, p, userId, link));
  const okCount = results.filter((r) => r.ok).length;

  const head =
    okCount === 0
      ? targets.length === 1
        ? "Não confirmei a intimação:"
        : "Não confirmei nenhuma intimação:"
      : okCount === targets.length
        ? okCount === 1
          ? "Pronto, intimação confirmada:"
          : `Pronto, ${okCount} intimações confirmadas:`
        : `Confirmei ${okCount} de ${targets.length}:`;
  const parts = [head, ...results.map((r) => r.line)];

  // O que sobrou, na mesma ordem da próxima leitura: a numeração mandada
  // aqui é a que vale no próximo "OK 1", "OK 2"...
  const confirmedIds = new Set(targets.filter((_, i) => results[i].ok).map((p) => p.id));
  const rest = pubs.filter((p) => !confirmedIds.has(p.id));
  if (rest.some((p) => !targets.includes(p))) {
    parts.push("", listMessage(rest.length === 1 ? "Ainda falta 1 para conferir:" : `Ainda faltam ${rest.length} para conferir:`, rest, link));
  }
  return { outcome: okCount > 0 ? "intimacao_confirmed" : "intimacao_link", text: parts.join("\n") };
}
