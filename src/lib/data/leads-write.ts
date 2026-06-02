import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/config";
import type { AiResponse, ConversationSummary } from "@/lib/chatbot/schema";
import type {
  CommercialStatus,
  FinancialStatus,
  LegalArea,
  LegalStatus,
  Urgency,
} from "@/lib/types";

const VALID_AREAS: LegalArea[] = [
  "penal",
  "civil",
  "administrativo",
  "previdenciario",
  "bancario",
  "imobiliario",
  "trabalhista",
  "familia",
  "consumidor",
  "empresarial",
  "tributario",
  "contratos",
  "lgpd",
  "outro",
  "nao_confirmada",
];

function safeArea(value: string): LegalArea {
  return VALID_AREAS.includes(value as LegalArea)
    ? (value as LegalArea)
    : "nao_confirmada";
}

function safeUrgency(value: string): Urgency {
  return value === "alta" || value === "media" || value === "baixa"
    ? value
    : "baixa";
}

export interface PersistLeadInput {
  ai: AiResponse;
  consent: {
    given: boolean;
    at: string;
    policyVersion: string;
    channel: string;
    ip?: string | null;
    userAgent?: string | null;
  };
  fullMessage: string;
}

export interface PersistResult {
  persisted: boolean;
  leadId?: string;
  conversationId?: string;
  reason?: string;
}

/**
 * Grava o lead, a conversa e o registro de consentimento a partir do retorno
 * estruturado da IA. Usa a SERVICE ROLE (ignora RLS) — executado apenas no
 * server. Em modo demonstração (sem service role) não persiste e retorna o
 * motivo, sem quebrar o fluxo do chatbot.
 */
export async function persistLeadFromChat(
  input: PersistLeadInput
): Promise<PersistResult> {
  if (!hasServiceRole()) {
    return { persisted: false, reason: "supabase_not_configured" };
  }

  const { ai, consent, fullMessage } = input;
  const supabase = createServiceClient();

  const fullName = ai.dados_coletados.nome?.trim() || "Lead via chatbot";

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      full_name: fullName,
      phone: ai.dados_coletados.telefone || null,
      email: ai.dados_coletados.email || null,
      city: ai.dados_coletados.cidade || null,
      state: ai.dados_coletados.estado || null,
      legal_area: safeArea(ai.area_juridica),
      subarea: ai.subarea || null,
      case_type: ai.tipo_caso || null,
      case_summary: ai.resumo_caso || fullMessage.slice(0, 1000),
      urgency: safeUrgency(ai.urgencia),
      urgency_reason: ai.motivo_urgencia || null,
      commercial_status: (ai.status_comercial_sugerido ||
        "novo_lead") as CommercialStatus,
      legal_status: (ai.status_juridico_sugerido ||
        "triagem_inicial") as LegalStatus,
      financial_status: (ai.status_financeiro_sugerido ||
        "sem_cobranca") as FinancialStatus,
      source: consent.channel || "chatbot",
      consent_given: consent.given,
      consent_at: consent.at,
      privacy_policy_version: consent.policyVersion,
      process_number: ai.numero_processo || null,
      has_existing_process: ai.processo_existente,
      is_existing_client: ai.dados_coletados.ja_e_cliente,
      preferred_contact_time: ai.dados_coletados.melhor_horario || null,
      next_action: ai.proxima_acao || null,
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    return { persisted: false, reason: leadError?.message ?? "insert_failed" };
  }

  // Registro de consentimento (trilha LGPD).
  await supabase.from("consent_logs").insert({
    lead_id: lead.id,
    consent_type: "atendimento",
    consent_given: consent.given,
    policy_version: consent.policyVersion,
    ip_address: consent.ip ?? null,
    user_agent: consent.userAgent ?? null,
    channel: consent.channel,
  });

  // Conversa + primeira mensagem do usuário.
  const { data: conversation } = await supabase
    .from("conversations")
    .insert({ lead_id: lead.id, channel: consent.channel, status: "aberta" })
    .select("id")
    .single();

  if (conversation) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_type: "user",
      content: fullMessage,
      metadata: {
        area: ai.area_juridica,
        urgency: ai.urgencia,
        handoff: ai.precisa_humano,
      },
    });
  }

  return {
    persisted: true,
    leadId: lead.id,
    conversationId: conversation?.id,
  };
}

/**
 * Registra o resumo interno final da conversa (Fase 4) como mensagem de sistema
 * vinculada ao lead/conversa e cria uma notificação para a equipe.
 */
export async function finalizeConversation(input: {
  leadId: string;
  conversationId?: string;
  summary: ConversationSummary;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!hasServiceRole()) {
    return { ok: false, reason: "supabase_not_configured" };
  }

  const supabase = createServiceClient();
  const { leadId, conversationId, summary } = input;

  if (conversationId) {
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_type: "system",
      content: "Resumo interno do atendimento gerado automaticamente.",
      metadata: { summary },
    });
    await supabase
      .from("conversations")
      .update({ status: "encerrada" })
      .eq("id", conversationId);
  }

  // Notificação interna para a equipe.
  const urgent = summary.classificacao.urgencia === "alta";
  await supabase.from("notifications").insert({
    user_id: null,
    type: urgent ? "lead_urgente" : "novo_lead",
    title: urgent
      ? "Lead urgente recebido pelo chatbot"
      : "Novo lead recebido pelo chatbot",
    body: `${summary.identificacao.nome || "Lead"} — ${
      summary.classificacao.area_principal || "área não confirmada"
    }.`,
    entity_type: "lead",
    entity_id: leadId,
    read: false,
  });

  return { ok: true };
}
