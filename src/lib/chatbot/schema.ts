import { z } from "zod";

/**
 * Schema do retorno estruturado da IA a cada interação (seção 43 do prompt).
 * Usado para validar a saída do modelo antes de persistir no CRM.
 */
export const aiResponseSchema = z.object({
  resposta_cliente: z.string(),
  area_juridica: z.string().default(""),
  subarea: z.string().default(""),
  tipo_caso: z.string().default(""),
  urgencia: z.enum(["alta", "media", "baixa", ""]).default(""),
  motivo_urgencia: z.string().default(""),
  dados_coletados: z
    .object({
      nome: z.string().default(""),
      telefone: z.string().default(""),
      email: z.string().default(""),
      cidade: z.string().default(""),
      estado: z.string().default(""),
      melhor_horario: z.string().default(""),
      ja_e_cliente: z.boolean().default(false),
    })
    .default({}),
  resumo_caso: z.string().default(""),
  documentos_sugeridos: z.array(z.string()).default([]),
  documentos_mencionados: z.array(z.string()).default([]),
  dados_faltantes: z.array(z.string()).default([]),
  prazos_identificados: z.array(z.string()).default([]),
  processo_existente: z.boolean().default(false),
  numero_processo: z.string().default(""),
  precisa_humano: z.boolean().default(false),
  motivo_handoff: z.string().default(""),
  proxima_acao: z.string().default(""),
  status_comercial_sugerido: z.string().default(""),
  status_juridico_sugerido: z.string().default(""),
  status_financeiro_sugerido: z.string().default(""),
});

export type AiResponse = z.infer<typeof aiResponseSchema>;

/** Schema do resumo interno final da conversa (seção 44 do prompt). */
export const conversationSummarySchema = z.object({
  identificacao: z.object({
    nome: z.string().default(""),
    telefone: z.string().default(""),
    email: z.string().default(""),
    cidade: z.string().default(""),
    estado: z.string().default(""),
    ja_e_cliente: z.boolean().default(false),
  }),
  classificacao: z.object({
    area_principal: z.string().default(""),
    subarea: z.string().default(""),
    tipo_de_caso: z.string().default(""),
    urgencia: z.string().default(""),
    motivo_da_urgencia: z.string().default(""),
    status_comercial_sugerido: z.string().default(""),
    status_juridico_sugerido: z.string().default(""),
    status_financeiro_sugerido: z.string().default(""),
  }),
  caso: z.object({
    resumo_fatico: z.string().default(""),
    datas_relevantes: z.array(z.string()).default([]),
    prazos_identificados: z.array(z.string()).default([]),
    processo_existente: z.boolean().default(false),
    numero_processo: z.string().default(""),
    orgao_ou_instituicao_envolvida: z.string().default(""),
    parte_contraria: z.string().default(""),
    valor_aproximado: z.string().default(""),
    objetivo_do_cliente: z.string().default(""),
  }),
  documentos: z.object({
    documentos_mencionados: z.array(z.string()).default([]),
    documentos_enviados: z.array(z.string()).default([]),
    documentos_pendentes: z.array(z.string()).default([]),
    documentos_sugeridos: z.array(z.string()).default([]),
  }),
  analise_interna_preliminar: z.object({
    pontos_de_atencao: z.array(z.string()).default([]),
    riscos_identificados: z.array(z.string()).default([]),
    dados_faltantes: z.array(z.string()).default([]),
    necessita_advogado_imediato: z.boolean().default(false),
    motivo_handoff: z.string().default(""),
    proxima_acao_sugerida: z.string().default(""),
  }),
  lgpd: z.object({
    consentimento: z.boolean().default(false),
    data_hora_consentimento: z.string().default(""),
    versao_politica: z.string().default(""),
    canal_origem: z.string().default(""),
  }),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** Schema de entrada da rota /api/chat. */
export const chatRequestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .default([]),
  context: z
    .object({
      area: z.string().optional(),
      urgency: z.string().optional(),
      collected: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
