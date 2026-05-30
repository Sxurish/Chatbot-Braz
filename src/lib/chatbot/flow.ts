import type { LegalArea, Urgency } from "@/lib/types";

/**
 * Lógica de triagem do fluxo guiado do chatbot.
 * Classificação heurística por palavras-chave — usada como camada de segurança
 * e como fallback quando a IA não está configurada (AI_PROVIDER=mock).
 */

const AREA_KEYWORDS: Record<LegalArea, string[]> = {
  penal: [
    "preso",
    "prisão",
    "flagrante",
    "delegacia",
    "inquérito",
    "criminal",
    "crime",
    "audiência de custódia",
    "boletim de ocorrência",
    "intimação",
    "réu",
    "investigado",
    "habeas corpus",
    "mandado",
    "busca e apreensão",
    "medida protetiva",
  ],
  bancario: [
    "banco",
    "empréstimo",
    "financiamento",
    "cartão",
    "juros",
    "negativ",
    "busca e apreensão de veículo",
    "desconto",
    "fraude bancária",
    "golpe",
    "financeira",
  ],
  previdenciario: [
    "inss",
    "aposentadoria",
    "auxílio",
    "benefício",
    "pensão",
    "bpc",
    "loas",
    "perícia",
    "cnis",
    "incapacidade",
    "previdenc",
  ],
  administrativo: [
    "servidor",
    "concurso",
    "pad",
    "sindicância",
    "licitação",
    "órgão público",
    "multa administrativa",
    "exoneração",
    "portaria",
    "administrativo",
  ],
  imobiliario: [
    "imóvel",
    "matrícula",
    "escritura",
    "usucapião",
    "posse",
    "terreno",
    "loteamento",
    "averbação",
    "inventário",
    "despejo",
    "regulariz",
  ],
  trabalhista: ["trabalho", "demiss", "clt", "rescisão", "verbas", "horas extras", "fgts"],
  familia: ["divórcio", "pensão alimentícia", "guarda", "alimentos", "união estável"],
  consumidor: ["produto", "consumidor", "procon", "compra", "garantia", "loja"],
  empresarial: ["empresa", "sócio", "cnpj", "societário", "falência"],
  tributario: ["imposto", "tributo", "icms", "iss", "execução fiscal", "tributário"],
  contratos: ["contrato", "minuta", "rescindir contrato", "cláusula"],
  lgpd: ["lgpd", "dados pessoais", "privacidade", "vazamento", "compliance"],
  civil: [
    "indenização",
    "danos",
    "cobrança",
    "obrigação",
    "acordo",
    "sucessões",
    "herança",
    "civil",
  ],
  outro: [],
  nao_confirmada: [],
};

const HIGH_URGENCY_KEYWORDS = [
  "preso",
  "prisão",
  "flagrante",
  "audiência",
  "amanhã",
  "hoje",
  "prazo",
  "mandado",
  "busca e apreensão",
  "medida protetiva",
  "despejo",
  "leilão",
  "penhora",
  "bloqueio",
  "urgente",
  "liminar",
  "intimação",
  "habeas corpus",
];

const MEDIUM_URGENCY_KEYWORDS = [
  "negado",
  "indeferido",
  "demiss",
  "processo",
  "notificação",
  "cobrança",
  "prejuízo",
];

const ILLEGAL_KEYWORDS = [
  "esconder prova",
  "ocultar",
  "destruir documento",
  "fraudar",
  "falsificar",
  "subornar",
  "fugir",
  "enganar o banco",
  "enganar o inss",
  "documento falso",
  "ameaçar",
];

export function detectArea(text: string): LegalArea {
  const lower = text.toLowerCase();
  // Penal tem prioridade de detecção pela sensibilidade do tema.
  const order: LegalArea[] = [
    "penal",
    "bancario",
    "previdenciario",
    "administrativo",
    "imobiliario",
    "trabalhista",
    "familia",
    "consumidor",
    "empresarial",
    "tributario",
    "lgpd",
    "contratos",
    "civil",
  ];
  for (const area of order) {
    if (AREA_KEYWORDS[area].some((kw) => lower.includes(kw))) {
      return area;
    }
  }
  return "nao_confirmada";
}

export function detectUrgency(text: string): { urgency: Urgency; reason: string } {
  const lower = text.toLowerCase();
  const high = HIGH_URGENCY_KEYWORDS.find((kw) => lower.includes(kw));
  if (high) {
    return {
      urgency: "alta",
      reason: `Termo de urgência identificado: "${high}"`,
    };
  }
  const medium = MEDIUM_URGENCY_KEYWORDS.find((kw) => lower.includes(kw));
  if (medium) {
    return {
      urgency: "media",
      reason: `Situação relevante identificada: "${medium}"`,
    };
  }
  return { urgency: "baixa", reason: "Sem indicadores de prazo ou risco imediato" };
}

export function detectIllegalRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return ILLEGAL_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Documentos sugeridos por área (alinhados ao prompt). */
export const SUGGESTED_DOCS: Record<LegalArea, string[]> = {
  penal: [
    "RG e CPF",
    "Intimação / citação",
    "Boletim de ocorrência",
    "Número do processo",
    "Mandado (se houver)",
    "Decisões judiciais",
  ],
  civil: ["Contratos", "Comprovantes de pagamento", "Notificações", "Mensagens/e-mails"],
  administrativo: [
    "Notificação / decisão / portaria",
    "Documentos do processo administrativo",
    "RG e CPF",
  ],
  previdenciario: [
    "RG e CPF",
    "CNIS",
    "Carteira de trabalho",
    "Laudos e exames médicos",
    "Carta de indeferimento",
  ],
  bancario: [
    "Contrato bancário",
    "Extratos",
    "Comprovantes de pagamento",
    "Comprovante de negativação",
  ],
  imobiliario: [
    "Matrícula do imóvel",
    "Escritura",
    "Contrato de compra e venda",
    "IPTU e contas (água/luz)",
    "Comprovantes de posse",
  ],
  contratos: ["Minuta do contrato", "Documentos das partes", "Propostas comerciais"],
  lgpd: [
    "Política de privacidade atual",
    "Mapeamento de dados",
    "Contratos com fornecedores",
  ],
  trabalhista: ["Carteira de trabalho", "Holerites", "Rescisão", "Mensagens"],
  familia: ["RG e CPF", "Certidões", "Comprovantes de renda"],
  consumidor: ["Nota fiscal", "Comprovantes", "Protocolos de atendimento"],
  empresarial: ["Contrato social", "Documentos da empresa"],
  tributario: ["Notificações fiscais", "Comprovantes de pagamento"],
  outro: ["RG e CPF"],
  nao_confirmada: ["RG e CPF"],
};
