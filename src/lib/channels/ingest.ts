import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/config";
import { runTriage, type HistoryItem } from "@/lib/chatbot/engine";
import { STANDARD_MESSAGES } from "@/lib/chatbot/system-prompt";
import { buildConversationSummary } from "@/lib/chatbot/summary";
import {
  channelToSource,
  safeArea,
  safeCommercialStatus,
  safeFinancialStatus,
  safeLegalStatus,
  safeUrgency,
} from "@/lib/chatbot/normalize";
import type { AiResponse } from "@/lib/chatbot/schema";
import type { InboundMessage, IngestResult } from "./types";

const POLICY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_POLICY_VERSION ?? "1.0.0";

/** Etapas do fluxo de uma conversa por canal de mensageria. */
type Stage = "greeting" | "awaiting_consent" | "declined" | "chatting";

interface TriageState {
  stage: Stage;
  consentAt?: string;
  leadId?: string;
  area?: string;
  urgency?: string;
}

/**
 * Interpreta a resposta de consentimento LGPD.
 * A negativa é avaliada PRIMEIRO e com fronteira de palavra: "não concordo"
 * contém a palavra "concordo", então uma checagem ingênua de afirmativas
 * registraria consentimento indevido.
 */
function matchConsent(text: string): "yes" | "no" | null {
  const norm = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
  if (norm === "2" || /\b(nao|discordo|recuso|nego)\b/.test(norm)) {
    return "no";
  }
  if (norm === "1" || /\b(sim|concordo|aceito|autorizo|de acordo|claro|pode)\b/.test(norm)) {
    return "yes";
  }
  return null;
}

/**
 * Processa uma mensagem de entrada de qualquer canal (WhatsApp/Instagram).
 * Gerencia consentimento LGPD textual, estado da conversa, triagem por IA e
 * persistência no CRM. Retorna o texto de resposta a ser enviado.
 *
 * Requer SERVICE ROLE (gravação no servidor). Sem ela, responde de forma
 * informativa sem persistir.
 */
export async function ingestMessage(msg: InboundMessage): Promise<IngestResult> {
  const text = msg.text?.trim();
  if (!text) return { reply: "", handoff: false, skipped: true };

  // Sem backend: ainda assim responde (triagem sem persistência).
  if (!hasServiceRole()) {
    const ai = await runTriage(text);
    return { reply: ai.resposta_cliente, handoff: ai.precisa_humano };
  }

  const supabase = createServiceClient();

  // 1. Deduplicação de webhooks reenviados pela Meta.
  const dedup = await supabase
    .from("channel_events")
    .insert({ channel: msg.channel, external_message_id: msg.messageId })
    .select("id")
    .maybeSingle();
  if (dedup.error && dedup.error.code === "23505") {
    return { reply: "", handoff: false, skipped: true };
  }

  // 2. Recupera ou cria a conversa do contato.
  const { conversation, state } = await getOrCreateConversation(supabase, msg);
  const conversationId = conversation.id as string;

  await saveMessage(supabase, conversationId, "user", text);

  // 3. Máquina de estados.
  let reply = "";
  let handoff = false;
  let nextState: TriageState = { ...state };

  if (state.stage === "declined") {
    // Permite reconsentimento se o contato mudar de ideia.
    if (matchConsent(text) === "yes") {
      nextState.stage = "chatting";
      nextState.consentAt = new Date().toISOString();
      reply =
        "Consentimento registrado. Para começar, descreva resumidamente a sua situação. Se puder, informe também seu nome e a cidade onde reside.";
    } else {
      reply = STANDARD_MESSAGES.consentDeclined;
    }
  } else if (state.stage === "greeting") {
    // Primeira interação: saudação + aviso + pedido de consentimento.
    reply = `${STANDARD_MESSAGES.greeting}\n\n${STANDARD_MESSAGES.legalNotice}\n\n${STANDARD_MESSAGES.lgpdConsent} (responda SIM ou NÃO)`;
    nextState.stage = "awaiting_consent";
  } else if (state.stage === "awaiting_consent") {
    const consent = matchConsent(text);
    if (consent === "no") {
      nextState.stage = "declined";
      reply = STANDARD_MESSAGES.consentDeclined;
    } else if (consent === "yes") {
      nextState.stage = "chatting";
      nextState.consentAt = new Date().toISOString();
      reply =
        "Obrigado. Para começar, descreva resumidamente a sua situação. Se puder, informe também seu nome e a cidade onde reside.";
    } else {
      reply = `Para prosseguir, preciso do seu consentimento. ${STANDARD_MESSAGES.lgpdConsent} (responda SIM ou NÃO)`;
    }
  } else {
    // chatting → roda a triagem e persiste o lead na primeira mensagem útil.
    const history = await loadHistory(supabase, conversationId);
    const ai = await runTriage(text, history, {
      area: state.area,
      urgency: state.urgency,
    });
    reply = ai.resposta_cliente;
    handoff = ai.precisa_humano;
    nextState.area = ai.area_juridica;
    nextState.urgency = ai.urgencia;

    if (!state.leadId) {
      const leadId = await createLead(supabase, msg, ai, state.consentAt);
      if (leadId) {
        nextState.leadId = leadId;
        await supabase
          .from("conversations")
          .update({ lead_id: leadId })
          .eq("id", conversationId);
        await registerConsent(supabase, leadId, msg, state.consentAt);
        await notifyTeam(supabase, leadId, ai);
        // Resumo interno final (Fase 4) anexado à conversa.
        const summary = buildConversationSummary(ai, {
          given: true,
          at: state.consentAt ?? new Date().toISOString(),
          policyVersion: POLICY_VERSION,
          channel: msg.channel,
        });
        await saveMessage(
          supabase,
          conversationId,
          "system",
          "Resumo interno do atendimento.",
          { summary }
        );
      }
    }
  }

  await saveMessage(supabase, conversationId, "bot", reply, { handoff });
  await supabase
    .from("conversations")
    .update({ triage_state: nextState })
    .eq("id", conversationId);

  return { reply, handoff, leadId: nextState.leadId, conversationId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type DB = ReturnType<typeof createServiceClient>;

async function getOrCreateConversation(db: DB, msg: InboundMessage) {
  const { data: existing } = await db
    .from("conversations")
    .select("id, triage_state")
    .eq("channel", msg.channel)
    .eq("external_contact_id", msg.contactId)
    .eq("status", "aberta")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const state = (existing.triage_state as TriageState) ?? { stage: "greeting" };
    return { conversation: existing, state };
  }

  const { data: created } = await db
    .from("conversations")
    .insert({
      channel: msg.channel,
      external_contact_id: msg.contactId,
      contact_name: msg.contactName ?? null,
      status: "aberta",
      triage_state: { stage: "greeting" } satisfies TriageState,
    })
    .select("id, triage_state")
    .single();

  return {
    conversation: created!,
    state: { stage: "greeting" } as TriageState,
  };
}

async function saveMessage(
  db: DB,
  conversationId: string,
  sender: "user" | "bot" | "system",
  content: string,
  metadata?: Record<string, unknown>
) {
  if (!content) return;
  await db.from("messages").insert({
    conversation_id: conversationId,
    sender_type: sender,
    content,
    metadata: metadata ?? null,
  });
}

async function loadHistory(db: DB, conversationId: string): Promise<HistoryItem[]> {
  const { data } = await db
    .from("messages")
    .select("sender_type, content")
    .eq("conversation_id", conversationId)
    .in("sender_type", ["user", "bot"])
    .order("created_at", { ascending: true })
    .limit(20);
  return (data ?? []).map((m) => ({
    role: m.sender_type === "bot" ? "assistant" : "user",
    content: m.content as string,
  }));
}

async function createLead(
  db: DB,
  msg: InboundMessage,
  ai: AiResponse,
  consentAt?: string
): Promise<string | null> {
  const fullName =
    ai.dados_coletados.nome?.trim() || msg.contactName || `Contato ${msg.channel}`;
  const phone = msg.channel === "whatsapp" ? msg.contactId : ai.dados_coletados.telefone || null;

  const { data, error } = await db
    .from("leads")
    .insert({
      full_name: fullName,
      phone,
      email: ai.dados_coletados.email || null,
      city: ai.dados_coletados.cidade || null,
      state: ai.dados_coletados.estado || null,
      legal_area: safeArea(ai.area_juridica),
      subarea: ai.subarea || null,
      case_type: ai.tipo_caso || null,
      case_summary: ai.resumo_caso || msg.text.slice(0, 1000),
      urgency: safeUrgency(ai.urgencia),
      urgency_reason: ai.motivo_urgencia || null,
      commercial_status: safeCommercialStatus(ai.status_comercial_sugerido),
      legal_status: safeLegalStatus(ai.status_juridico_sugerido),
      financial_status: safeFinancialStatus(ai.status_financeiro_sugerido),
      source: channelToSource(msg.channel),
      consent_given: true,
      consent_at: consentAt ?? new Date().toISOString(),
      privacy_policy_version: POLICY_VERSION,
      process_number: ai.numero_processo || null,
      has_existing_process: ai.processo_existente,
      is_existing_client: ai.dados_coletados.ja_e_cliente,
      next_action: ai.proxima_acao || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ingest] createLead error:", error);
    return null;
  }
  return data.id as string;
}

async function registerConsent(
  db: DB,
  leadId: string,
  msg: InboundMessage,
  consentAt?: string
) {
  await db.from("consent_logs").insert({
    lead_id: leadId,
    consent_type: "atendimento",
    consent_given: true,
    policy_version: POLICY_VERSION,
    channel: msg.channel,
    user_agent: `channel:${msg.channel}`,
  });
}

async function notifyTeam(db: DB, leadId: string, ai: AiResponse) {
  const urgent = ai.urgencia === "alta";
  await db.from("notifications").insert({
    user_id: null,
    type: urgent ? "lead_urgente" : "novo_lead",
    title: urgent ? "Lead urgente recebido por mensageria" : "Novo lead por mensageria",
    body: `${ai.dados_coletados.nome || "Novo contato"} — ${ai.area_juridica || "área não confirmada"}.`,
    entity_type: "lead",
    entity_id: leadId,
    read: false,
  });
}
