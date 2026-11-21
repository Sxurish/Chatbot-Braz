import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHistory, runRoutedAgent, type MessagesClientLike } from "@/lib/assistant/agent";
import { ASSISTANT_HISTORY_LIMIT, isAssistantConfigured } from "@/lib/assistant/config";
import { chooseInitialTier } from "@/lib/assistant/model-router";
import { canWrite, confirmDraft, rejectDraft } from "@/lib/assistant/confirm-draft";
import { getBudgetStatus } from "@/lib/assistant/cost";
import { DRAFT_DEFS, type DraftView } from "@/lib/assistant/draft-schema";
import { DRAFT_TOOLS } from "@/lib/assistant/draft-tools";
import { listDrafts } from "@/lib/assistant/drafts";
import { appBaseUrl, isSafeInternalHref } from "@/lib/assistant/links";
import { buildSystemPrompt, WHATSAPP_INSTRUCTIONS } from "@/lib/assistant/prompt";
import type { AssistantSession } from "@/lib/assistant/session";
import {
  createConversation,
  findRecentConversation,
  getMonthSpendUsd,
  listMessages,
  saveMessage,
} from "@/lib/assistant/store";
import { getToolsFor, type AssistantTool } from "@/lib/assistant/tools";
import { friendlyApiError, withNotes } from "@/lib/assistant/turn";
import {
  buildDraftFooter,
  composeWhatsappReply,
  isDigestDetailsRequest,
  parseConfirmReply,
  splitWhatsappMessage,
  toWhatsappText,
} from "@/lib/assistant/whatsapp-format";
import { sendText } from "@/lib/channels/whatsapp";
import type { InboundMessage } from "@/lib/channels/types";
import { getSettings } from "@/lib/data/settings";
import { canGenerateFromTemplates } from "@/lib/data/templates-permissions";
import { digestToWhatsappText, type DailyDigest } from "@/lib/digest/build";
import {
  dbIntimacaoStore,
  handleIntimacaoReply,
  parseIntimacaoReply,
  type IntimacaoOkResult,
  type IntimacaoReply,
  type IntimacaoWhatsappStore,
} from "@/lib/intimacoes/whatsapp-ok";
import { hasServiceRole, isSupabaseConfigured } from "@/lib/supabase/config";
import { runAsTeamMember, type ServiceClient } from "@/lib/supabase/request-context";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { TeamUser } from "@/lib/types";
import { whatsappNumberVariants } from "@/lib/whatsapp-number";

/**
 * Assistente da equipe pelo WhatsApp (fase 4).
 *
 * - Só números cadastrados na tela Equipe (por um Admin), de pessoas ativas,
 *   chegam aqui; qualquer outro número segue para a triagem de clientes.
 * - Mesmo assistente do painel (mesmas ferramentas de consulta e de
 *   rascunho), mas SEM financeiro para ninguém, nem Admin, e sem arquivos.
 * - Cadastros: o assistente prepara o rascunho, a resposta termina com o
 *   resumo e a pessoa responde "OK" (grava) ou "CANCELAR" (descarta).
 * - Não há cookie: a identidade vem do número e a consulta usa o service
 *   role dentro de runAsTeamMember (ver src/lib/supabase/request-context.ts
 *   para a troca de segurança e as compensações no código).
 * - Intimações (fase 5): sem rascunho esperando, o "OK" confirma o prazo da
 *   intimação avisada pelo WhatsApp (regras em src/lib/intimacoes/whatsapp-ok.ts).
 */

/** Uma conversa contínua por pessoa; parada há mais que isso, começa outra. */
export const WHATSAPP_CONVERSATION_IDLE_MS = 12 * 60 * 60 * 1000;
/** "OK" só confirma rascunhos preparados há no máximo 2 horas. */
export const WHATSAPP_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

// ---------------------------------------------------------------------------
// Quem está escrevendo
// ---------------------------------------------------------------------------

/** Parte do cliente Supabase usada na busca pelo número (permite um falso nos testes). */
export interface MemberLookupDb {
  from(table: "users"): {
    select(columns: string): {
      in(column: string, values: string[]): {
        eq(column: string, value: boolean): {
          limit(n: number): PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
        };
      };
    };
  };
}

const MEMBER_COLUMNS = "id, name, email, role, active, last_login, created_at, whatsapp_number";

/**
 * Pessoa da equipe, ativa, dona deste número (com ou sem o nono dígito).
 * Sem service role, ou com mais de uma pessoa no mesmo número, não reconhece
 * ninguém: a mensagem segue para a triagem de clientes.
 */
export async function findTeamMemberByPhone(
  contactId: string,
  db?: MemberLookupDb | null
): Promise<TeamUser | null> {
  const variants = whatsappNumberVariants(contactId);
  if (variants.length === 0) return null;
  const client = db ?? (hasServiceRole() ? (createServiceClient() as unknown as MemberLookupDb) : null);
  if (!client) return null;
  const { data, error } = await client
    .from("users")
    .select(MEMBER_COLUMNS)
    .in("whatsapp_number", variants)
    .eq("active", true)
    .limit(2);
  if (error) {
    // Ex.: banco sem a fase 4 (coluna whatsapp_number). Segue como cliente.
    console.error("[whatsapp] busca do número da equipe:", error.message);
    return null;
  }
  const rows = (data ?? []) as TeamUser[];
  if (rows.length !== 1) {
    if (rows.length > 1) console.warn("[whatsapp] número cadastrado para mais de uma pessoa; ignorado.");
    return null;
  }
  const member = rows[0];
  return member.active ? member : null;
}

// ---------------------------------------------------------------------------
// Ferramentas no WhatsApp
// ---------------------------------------------------------------------------

/**
 * Ferramentas oferecidas pelo WhatsApp: as consultas sem NENHUMA financeira
 * (nem para Admin) e, para quem não é Visualizador, os rascunhos (menos
 * "anexar documento", porque arquivo não chega pelo WhatsApp nesta fase).
 * Documento de modelo (preparar_modelo) só para Advogado(a) e Admin, e sem
 * contratos (a ferramenta e o OK recusam contrato e honorários no WhatsApp).
 */
export function getWhatsappTools(user: Pick<TeamUser, "role">): AssistantTool[] {
  const consult = getToolsFor(false).filter((t) => !t.adminOnly);
  const drafts =
    user.role === "visualizador"
      ? []
      : DRAFT_TOOLS.filter(
          (t) =>
            t.name !== "preparar_documento" &&
            (t.name !== "preparar_modelo" || canGenerateFromTemplates(user.role))
        );
  // Minutas (redigir_minuta) só no CRM: nunca entram aqui.
  return [...consult, ...drafts].filter((t) => t.name !== "redigir_minuta");
}

// ---------------------------------------------------------------------------
// Reenvio da Meta e excesso de mensagens
// ---------------------------------------------------------------------------

const g = globalThis as unknown as {
  __waSeen?: Set<string>;
  __waHits?: Map<string, { hits: number[]; warned: boolean }>;
};

/** true se esta mensagem já foi tratada (a Meta reenvia webhooks). */
async function alreadyProcessed(messageId: string, db: ServiceClient | null): Promise<boolean> {
  if (db) {
    const { error } = await db
      .from("channel_events")
      .insert({ channel: "whatsapp", external_message_id: messageId })
      .select("id")
      .maybeSingle();
    return error?.code === "23505";
  }
  g.__waSeen ??= new Set();
  if (g.__waSeen.has(messageId)) return true;
  g.__waSeen.add(messageId);
  if (g.__waSeen.size > 5000) g.__waSeen.clear();
  return false;
}

/** Limite simples por número (por instância do servidor). "warn" = avisar uma vez. */
export function whatsappRateLimit(number: string, now = Date.now()): "ok" | "warn" | "silent" {
  g.__waHits ??= new Map();
  const entry = g.__waHits.get(number) ?? { hits: [], warned: false };
  entry.hits = entry.hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (entry.hits.length === 0) entry.warned = false;
  if (entry.hits.length >= RATE_MAX) {
    const first = !entry.warned;
    entry.warned = true;
    g.__waHits.set(number, entry);
    return first ? "warn" : "silent";
  }
  entry.hits.push(now);
  g.__waHits.set(number, entry);
  return "ok";
}

// ---------------------------------------------------------------------------
// Resposta
// ---------------------------------------------------------------------------

export interface WhatsappDeps {
  /** Cliente da IA (falso nos testes). Padrão: Anthropic com ANTHROPIC_API_KEY. */
  client?: MessagesClientLike;
  /** Envio da mensagem (falso nos testes). Padrão: Cloud API da Meta. */
  send?: (to: string, body: string) => Promise<void>;
  /** Cliente Supabase (service role). Padrão: criado se houver a chave. */
  db?: ServiceClient | null;
  now?: () => Date;
  /** Intimações avisadas pelo WhatsApp (falso nos testes). Padrão: banco (service role). */
  intimacoes?: IntimacaoWhatsappStore | null;
}

export type WhatsappOutcome =
  | "duplicate"
  | "rate_limited"
  | "not_configured"
  | "off"
  | "budget"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "digest"
  | "answer"
  | "media"
  | "error"
  | "intimacao_confirmed"
  | "intimacao_list"
  | "intimacao_link";

export interface WhatsappResult {
  outcome: WhatsappOutcome;
  replies: string[];
}

function absolute(link: string): string {
  return isSafeInternalHref(link) ? `${appBaseUrl()}${link}` : appBaseUrl();
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Resumo diário enviado a esta pessoa pelo WhatsApp nas últimas 24 horas. */
async function latestSentDigest(
  userId: string,
  now: Date
): Promise<{ content: DailyDigest; sentAt: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_digests")
    .select("content, whatsapp_sent_at")
    .eq("user_id", userId)
    .not("whatsapp_sent_at", "is", null)
    .gte("whatsapp_sent_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .order("whatsapp_sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null; // ex.: banco sem a tabela da fase 4
  const content = data.content as DailyDigest | null;
  if (content?.version !== 1) return null;
  return { content, sentAt: data.whatsapp_sent_at as string };
}

/** Grava os rascunhos pendentes com "OK" e monta a resposta. */
async function confirmPending(session: AssistantSession, pending: DraftView[]): Promise<string> {
  const lines: string[] = [];
  let okCount = 0;
  for (const d of pending) {
    const title = DRAFT_DEFS[d.kind].title;
    const r = await confirmDraft(session, d.id, d.data, { channel: "whatsapp" });
    if (r.ok) {
      okCount++;
      // Documento de modelo: só o link do CRM (exige login), nunca o de download.
      const login = d.kind === "modelo" ? " (abre com login no CRM)" : "";
      lines.push(`• ${r.message} ${absolute(r.link)}${login}`);
    } else {
      lines.push(`• ${title}: não gravei. ${r.error}`);
    }
  }
  const head =
    okCount === pending.length
      ? "Pronto, gravei no CRM:"
      : okCount === 0
        ? "Não consegui gravar:"
        : "Gravei parte:";
  const tail =
    okCount < pending.length
      ? "\n\nO que não foi gravado continua como rascunho. Diga o que corrigir e eu preparo de novo, ou cadastre pelo CRM."
      : "";
  return `${head}\n${lines.join("\n")}${tail}`;
}

/** Marca nas respostas do "OK" de intimação gravadas na conversa. */
const INTIMACAO_MARK = "intimacao_whatsapp";

/**
 * "OK" de intimação (fase 5). Devolve null para seguir o caminho de antes:
 * rascunho esperando o OK (tem prioridade), nenhuma intimação avisada a esta
 * pessoa, ou "OK" sozinho que responde a outra coisa (resumo diário ou
 * conversa com o assistente mais nova que o aviso).
 */
async function handleIntimacaoOk(
  member: TeamUser,
  text: string,
  parsed: IntimacaoReply,
  store: IntimacaoWhatsappStore,
  now: Date
): Promise<IntimacaoOkResult | null> {
  const recent = await findRecentConversation(
    member.id,
    "whatsapp",
    new Date(now.getTime() - WHATSAPP_CONVERSATION_IDLE_MS)
  );
  const drafts = recent ? await listDrafts(member.id, recent.id) : [];
  const freshDraft = drafts.some(
    (d) =>
      d.status === "pendente" && (!d.createdAt || now.getTime() - Date.parse(d.createdAt) <= WHATSAPP_DRAFT_TTL_MS)
  );
  if (freshDraft) return null;

  if (member.role === "visualizador") {
    const mine = await store.listNotified(member.id);
    if (mine.length === 0) return null;
    return {
      outcome: "intimacao_link",
      text: `Seu perfil na Equipe é Visualizador: por ele não dá para confirmar intimações. Peça a um Advogado ou Admin, ou veja no painel: ${appBaseUrl()}/intimacoes`,
    };
  }

  const history = recent ? await listMessages(member.id, recent.id, ASSISTANT_HISTORY_LIMIT) : [];
  const result = await handleIntimacaoReply({
    reply: parsed,
    userId: member.id,
    store,
    baseUrl: appBaseUrl(),
    plainOkAllowed: async (latestNotifiedAt) => {
      const notifiedAt = Date.parse(latestNotifiedAt);
      const digest = await latestSentDigest(member.id, now);
      if (digest && Date.parse(digest.sentAt) > notifiedAt) return false;
      const others = history.filter(
        (m) => m.role === "assistant" && !(m.tools_used ?? []).some((t) => t.name === INTIMACAO_MARK)
      );
      const lastOther = others[others.length - 1];
      return !(lastOther && Date.parse(lastOther.created_at) > notifiedAt);
    },
  });
  if (!result) return null;

  const conversationId = recent?.id ?? (await createConversation(member.id, `WhatsApp: ${text}`, "whatsapp"));
  await saveMessage(member.id, conversationId, { role: "user", content: text });
  await saveMessage(member.id, conversationId, {
    role: "assistant",
    content: result.text,
    toolsUsed: [{ name: INTIMACAO_MARK, ok: result.outcome === "intimacao_confirmed", links: [] }],
  });
  return result;
}

/**
 * Trata uma mensagem de texto de alguém da equipe. Nunca lança erro: falhas
 * viram uma mensagem curta para a pessoa (e log no servidor).
 */
export async function handleTeamWhatsapp(
  member: TeamUser,
  msg: InboundMessage,
  deps: WhatsappDeps = {}
): Promise<WhatsappResult> {
  const send = deps.send ?? sendText;
  const now = deps.now?.() ?? new Date();
  const db = deps.db !== undefined ? deps.db : hasServiceRole() ? createServiceClient() : null;
  const text = msg.text.trim();
  const sent: string[] = [];
  const reply = async (outcome: WhatsappOutcome, parts: string[]): Promise<WhatsappResult> => {
    for (const p of parts) {
      if (!p) continue;
      try {
        await send(msg.contactId, p);
        sent.push(p);
      } catch (err) {
        console.error("[whatsapp assistente] envio", err);
      }
    }
    return { outcome, replies: sent };
  };

  if (!text) return { outcome: "duplicate", replies: [] };
  if (await alreadyProcessed(msg.messageId, db)) return { outcome: "duplicate", replies: [] };

  const rate = whatsappRateLimit(msg.contactId, now.getTime());
  if (rate !== "ok") {
    return reply(
      "rate_limited",
      rate === "warn" ? ["Muitas mensagens seguidas. Espere um minuto e mande de novo."] : []
    );
  }

  // Intimações (fase 5): o "OK" funciona mesmo sem a IA ligada e sem verba,
  // porque só grava a sugestão que a pessoa já recebeu.
  const intimacaoReply = parseIntimacaoReply(text);
  const intimacoes =
    deps.intimacoes !== undefined
      ? deps.intimacoes
      : db
        ? dbIntimacaoStore(db as unknown as SupabaseClient)
        : null;
  if (intimacaoReply && intimacoes) {
    try {
      const handled = await runAsTeamMember({ client: db, user: member, channel: "whatsapp" }, () =>
        handleIntimacaoOk(member, text, intimacaoReply, intimacoes, now)
      );
      if (handled) return reply(handled.outcome, splitWhatsappMessage(handled.text));
    } catch (err) {
      console.error("[whatsapp assistente] intimação", err);
      return reply("error", [
        `Não consegui conferir a intimação agora. Tente de novo ou abra o painel: ${appBaseUrl()}/intimacoes`,
      ]);
    }
  }

  const client = deps.client ?? (isAssistantConfigured() ? new Anthropic() : null);
  if (!client) {
    return reply("not_configured", [
      "O assistente ainda não foi ligado no servidor (falta a chave da IA). Avise o administrador.",
    ]);
  }

  return runAsTeamMember({ client: db, user: member, channel: "whatsapp" }, async () => {
    const session: AssistantSession = { user: member, isAdmin: member.role === "admin" };
    const writer = canWrite(session);
    const base = appBaseUrl();
    try {
      const [settings, spent] = await Promise.all([getSettings(), getMonthSpendUsd()]);
      if (!settings.assistant.enabled) {
        return reply("off", ["O assistente está desligado em Configurações do CRM."]);
      }
      const budget = getBudgetStatus(spent, settings.assistant.monthly_limit_usd);
      if (!budget.allowChat) {
        // Sem valores: no WhatsApp não vai nada de gasto ou financeiro.
        return reply("budget", [
          "O assistente atingiu o limite de gasto deste mês e está pausado. Um Admin pode aumentar o limite em Configurações do CRM.",
        ]);
      }

      // Uma conversa contínua por pessoa no WhatsApp.
      const recent = await findRecentConversation(
        member.id,
        "whatsapp",
        new Date(now.getTime() - WHATSAPP_CONVERSATION_IDLE_MS)
      );
      const conversationId =
        recent?.id ?? (await createConversation(member.id, `WhatsApp: ${text}`, "whatsapp"));
      const drafts = recent ? await listDrafts(member.id, conversationId) : [];

      // Rascunhos pendentes: os de até 2 horas valem; os mais velhos são descartados.
      const pendingAll = drafts.filter((d) => d.status === "pendente");
      const isFresh = (d: DraftView) =>
        !d.createdAt || now.getTime() - Date.parse(d.createdAt) <= WHATSAPP_DRAFT_TTL_MS;
      const pending = pendingAll.filter(isFresh);
      const expired = pendingAll.filter((d) => !isFresh(d));
      for (const d of expired) await rejectDraft(session, d.id);

      const intent = parseConfirmReply(text);

      if (intent === "confirm" && pending.length > 0) {
        await saveMessage(member.id, conversationId, { role: "user", content: text });
        const answer = await confirmPending(session, pending);
        await saveMessage(member.id, conversationId, { role: "assistant", content: answer });
        return reply("confirmed", splitWhatsappMessage(answer));
      }
      if (intent === "cancel" && pending.length > 0) {
        await saveMessage(member.id, conversationId, { role: "user", content: text });
        for (const d of pending) await rejectDraft(session, d.id);
        const answer = `Pronto, ${plural(pending.length, "descartei o rascunho", `descartei os ${pending.length} rascunhos`)}. Nada foi gravado.`;
        await saveMessage(member.id, conversationId, { role: "assistant", content: answer });
        return reply("cancelled", [answer]);
      }
      if (intent === "confirm" && expired.length > 0) {
        await saveMessage(member.id, conversationId, { role: "user", content: text });
        const answer =
          "O rascunho que estava esperando o OK passou de 2 horas e foi descartado. Nada foi gravado. Peça de novo e eu preparo outro.";
        await saveMessage(member.id, conversationId, { role: "assistant", content: answer });
        return reply("expired", [answer]);
      }

      const history = recent ? await listMessages(member.id, conversationId, ASSISTANT_HISTORY_LIMIT) : [];

      // Resposta ao resumo diário ("Responda esta mensagem para ver os
      // detalhes"): "detalhes"/"resumo" a qualquer momento nas 24 horas, ou um
      // "ok"/"sim" como primeira mensagem depois do resumo. Vai o resumo
      // gravado às 9h, que nunca traz financeiro.
      if (isDigestDetailsRequest(text) || intent === "confirm") {
        const digest = await latestSentDigest(member.id, now);
        const firstAfter = digest ? !history.some((m) => Date.parse(m.created_at) > Date.parse(digest.sentAt)) : false;
        if (digest && (isDigestDetailsRequest(text) || firstAfter)) {
          await saveMessage(member.id, conversationId, { role: "user", content: text });
          const answer = digestToWhatsappText(digest.content, base);
          await saveMessage(member.id, conversationId, { role: "assistant", content: answer });
          return reply("digest", splitWhatsappMessage(answer));
        }
      }

      // Pergunta ou pedido normal: mesmo laço do painel, sem streaming.
      await saveMessage(member.id, conversationId, { role: "user", content: text });
      const messages = buildHistory(withNotes(history, drafts), text);
      const created: DraftView[] = [];
      const tools = getWhatsappTools(member);
      // Mesma regra do painel: Haiku começa e pode passar uma vez ao Sonnet
      // (sem arquivo no WhatsApp, então nunca começa no Sonnet).
      const result = await runRoutedAgent({
        client,
        initialTier: chooseInitialTier({ hasAttachment: false }),
        detailedAllowed: budget.allowDocuments,
        buildSystem: ({ canEscalate }) => [
          // Acesso financeiro "não" para todos: no WhatsApp ninguém recebe financeiro.
          ...buildSystemPrompt(member, false, now, {
            canWrite: writer,
            canEscalate,
            toolNames: tools.map((t) => t.name),
          }),
          { type: "text", text: WHATSAPP_INSTRUCTIONS },
        ],
        tools,
        messages,
        ctx: {
          user: member,
          isAdmin: false,
          now,
          canWrite: writer,
          channel: "whatsapp",
          conversationId,
          attachment: null,
          emit: (e) => {
            if (e.type === "draft") created.push(e.draft as DraftView);
          },
        },
      });

      // Correção: rascunho novo substitui os pendentes anteriores desta conversa.
      let replaced = 0;
      if (created.length > 0) {
        for (const d of pending) {
          if ((await rejectDraft(session, d.id)).ok) replaced++;
        }
      }

      await saveMessage(member.id, conversationId, {
        role: "assistant",
        content: result.text,
        toolsUsed: result.toolsUsed,
        model: result.model,
        usage: result.usage,
        costUsd: result.costUsd,
      });

      let footer = buildDraftFooter(created, base);
      if (footer && replaced > 0) {
        footer += `\n(${plural(replaced, "O rascunho anterior, não confirmado, foi descartado.", `Os ${replaced} rascunhos anteriores, não confirmados, foram descartados.`)})`;
      }
      return reply("answer", composeWhatsappReply(toWhatsappText(result.text, base), footer));
    } catch (err) {
      console.error("[whatsapp assistente] resposta", err);
      return reply("error", [friendlyApiError(err)]);
    }
  });
}

/** Foto, documento ou áudio de alguém da equipe: ainda não é lido pelo WhatsApp. */
export async function handleTeamWhatsappMedia(
  msg: { contactId: string; messageId: string },
  deps: Pick<WhatsappDeps, "send" | "db"> = {}
): Promise<WhatsappResult> {
  const send = deps.send ?? sendText;
  const db = deps.db !== undefined ? deps.db : hasServiceRole() ? createServiceClient() : null;
  if (await alreadyProcessed(msg.messageId, db)) return { outcome: "duplicate", replies: [] };
  const text = `Por enquanto não leio arquivos, fotos nem áudios pelo WhatsApp. Envie pela página do assistente no CRM: ${appBaseUrl()}/assistente`;
  try {
    await send(msg.contactId, text);
  } catch (err) {
    console.error("[whatsapp assistente] envio", err);
    return { outcome: "media", replies: [] };
  }
  return { outcome: "media", replies: [text] };
}
