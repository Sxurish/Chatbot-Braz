import {
  conversationSummarySchema,
  type AiResponse,
  type ConversationSummary,
} from "./schema";

/**
 * Monta o resumo interno final da conversa (seção 44 do prompt) a partir do
 * último retorno estruturado da IA e dos metadados de consentimento.
 * Determinístico — não depende de chamada extra ao provedor de IA.
 */
export function buildConversationSummary(
  ai: AiResponse,
  consent: {
    given: boolean;
    at: string;
    policyVersion: string;
    channel: string;
  }
): ConversationSummary {
  return conversationSummarySchema.parse({
    identificacao: {
      nome: ai.dados_coletados.nome,
      telefone: ai.dados_coletados.telefone,
      email: ai.dados_coletados.email,
      cidade: ai.dados_coletados.cidade,
      estado: ai.dados_coletados.estado,
      ja_e_cliente: ai.dados_coletados.ja_e_cliente,
    },
    classificacao: {
      area_principal: ai.area_juridica,
      subarea: ai.subarea,
      tipo_de_caso: ai.tipo_caso,
      urgencia: ai.urgencia,
      motivo_da_urgencia: ai.motivo_urgencia,
      status_comercial_sugerido: ai.status_comercial_sugerido,
      status_juridico_sugerido: ai.status_juridico_sugerido,
      status_financeiro_sugerido: ai.status_financeiro_sugerido,
    },
    caso: {
      resumo_fatico: ai.resumo_caso,
      datas_relevantes: [],
      prazos_identificados: ai.prazos_identificados,
      processo_existente: ai.processo_existente,
      numero_processo: ai.numero_processo,
      orgao_ou_instituicao_envolvida: "",
      parte_contraria: "",
      valor_aproximado: "",
      objetivo_do_cliente: "",
    },
    documentos: {
      documentos_mencionados: ai.documentos_mencionados,
      documentos_enviados: [],
      documentos_pendentes: ai.dados_faltantes,
      documentos_sugeridos: ai.documentos_sugeridos,
    },
    analise_interna_preliminar: {
      pontos_de_atencao: [],
      riscos_identificados: [],
      dados_faltantes: ai.dados_faltantes,
      necessita_advogado_imediato: ai.precisa_humano,
      motivo_handoff: ai.motivo_handoff,
      proxima_acao_sugerida: ai.proxima_acao,
    },
    lgpd: {
      consentimento: consent.given,
      data_hora_consentimento: consent.at,
      versao_politica: consent.policyVersion,
      canal_origem: consent.channel,
    },
  });
}
