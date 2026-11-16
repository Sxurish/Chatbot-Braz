import type {
  CommercialStatus,
  FinancialStatus,
  LeadSource,
  LegalArea,
  LegalStatus,
  Urgency,
} from "@/lib/types";

/**
 * Normalizadores dos valores retornados pela IA antes de persistir no banco.
 * Os campos de status/área são ENUMs no Postgres: um valor fora da lista
 * derrubaria o INSERT inteiro (e o lead seria perdido). A IA pode retornar
 * rótulos ("Novo lead") em vez de slugs ("novo_lead"), então validamos tudo
 * com fallback seguro.
 */

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

const VALID_COMMERCIAL: CommercialStatus[] = [
  "novo_lead",
  "em_qualificacao",
  "aguardando_documentos",
  "consulta_agendada",
  "consulta_realizada",
  "proposta_enviada",
  "negociacao",
  "contrato_enviado",
  "contrato_assinado",
  "cliente_ativo",
  "perdido",
  "nao_qualificado",
];

const VALID_LEGAL: LegalStatus[] = [
  "triagem_inicial",
  "analise_documental",
  "estrategia_em_definicao",
  "aguardando_procuracao",
  "aguardando_contrato",
  "em_elaboracao",
  "protocolado",
  "em_andamento",
  "aguardando_audiencia",
  "aguardando_decisao",
  "recurso",
  "encerrado",
];

const VALID_FINANCIAL: FinancialStatus[] = [
  "sem_cobranca",
  "consulta_pendente",
  "honorarios_pendentes",
  "entrada_paga",
  "parcelamento_ativo",
  "em_atraso",
  "quitado",
  "cobranca_necessaria",
];

/** Converte "Novo lead" / "NOVO_LEAD" → "novo_lead" antes de validar. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/[\s-]+/g, "_");
}

export function safeArea(value: string): LegalArea {
  const v = slugify(value ?? "");
  return VALID_AREAS.includes(v as LegalArea) ? (v as LegalArea) : "nao_confirmada";
}

export function safeUrgency(value: string): Urgency {
  const v = slugify(value ?? "");
  return v === "alta" || v === "media" || v === "baixa" ? v : "baixa";
}

export function safeCommercialStatus(value: string): CommercialStatus {
  const v = slugify(value ?? "");
  return VALID_COMMERCIAL.includes(v as CommercialStatus)
    ? (v as CommercialStatus)
    : "novo_lead";
}

export function safeLegalStatus(value: string): LegalStatus {
  const v = slugify(value ?? "");
  return VALID_LEGAL.includes(v as LegalStatus)
    ? (v as LegalStatus)
    : "triagem_inicial";
}

export function safeFinancialStatus(value: string): FinancialStatus {
  const v = slugify(value ?? "");
  return VALID_FINANCIAL.includes(v as FinancialStatus)
    ? (v as FinancialStatus)
    : "sem_cobranca";
}

/** Mapeia o canal da conversa para uma origem válida de lead. */
export function channelToSource(channel: string): LeadSource {
  switch (channel) {
    case "whatsapp":
      return "whatsapp";
    case "instagram":
      return "instagram";
    case "web":
    case "chatbot":
    default:
      return "chatbot";
  }
}
