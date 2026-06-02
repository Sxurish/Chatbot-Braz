import type {
  CommercialStatus,
  ContractStatus,
  FinancialStatus,
  LegalArea,
  LegalStatus,
  PaymentStatus,
  Urgency,
} from "./types";

/** Rótulos legíveis das áreas jurídicas. Áreas prioritárias do escritório primeiro. */
export const LEGAL_AREA_LABELS: Record<LegalArea, string> = {
  penal: "Direito Penal",
  civil: "Direito Civil",
  administrativo: "Direito Administrativo",
  previdenciario: "Direito Previdenciário",
  bancario: "Direito Bancário",
  imobiliario: "Regularização Imobiliária",
  trabalhista: "Trabalhista",
  familia: "Família",
  consumidor: "Consumidor",
  empresarial: "Empresarial",
  tributario: "Tributário",
  contratos: "Contratos",
  lgpd: "LGPD / Compliance",
  outro: "Outro assunto",
  nao_confirmada: "Área não confirmada",
};

/** Áreas prioritárias do escritório do Dr. Jean Braz. */
export const PRIORITY_AREAS: LegalArea[] = [
  "penal",
  "civil",
  "administrativo",
  "previdenciario",
  "bancario",
  "imobiliario",
];

export const URGENCY_LABELS: Record<Urgency, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const URGENCY_COLORS: Record<Urgency, string> = {
  alta: "bg-red-100 text-red-700 border-red-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
  baixa: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export const COMMERCIAL_STATUS_LABELS: Record<CommercialStatus, string> = {
  novo_lead: "Novo lead",
  em_qualificacao: "Em qualificação",
  aguardando_documentos: "Aguardando documentos",
  consulta_agendada: "Consulta agendada",
  consulta_realizada: "Consulta realizada",
  proposta_enviada: "Proposta enviada",
  negociacao: "Negociação",
  contrato_enviado: "Contrato enviado",
  contrato_assinado: "Contrato assinado",
  cliente_ativo: "Cliente ativo",
  perdido: "Perdido",
  nao_qualificado: "Não qualificado",
};

export const LEGAL_STATUS_LABELS: Record<LegalStatus, string> = {
  triagem_inicial: "Triagem inicial",
  analise_documental: "Análise documental",
  estrategia_em_definicao: "Estratégia em definição",
  aguardando_procuracao: "Aguardando procuração",
  aguardando_contrato: "Aguardando contrato",
  em_elaboracao: "Em elaboração",
  protocolado: "Protocolado",
  em_andamento: "Em andamento",
  aguardando_audiencia: "Aguardando audiência",
  aguardando_decisao: "Aguardando decisão",
  recurso: "Recurso",
  encerrado: "Encerrado",
};

export const FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
  sem_cobranca: "Sem cobrança",
  consulta_pendente: "Consulta pendente",
  honorarios_pendentes: "Honorários pendentes",
  entrada_paga: "Entrada paga",
  parcelamento_ativo: "Parcelamento ativo",
  em_atraso: "Em atraso",
  quitado: "Quitado",
  cobranca_necessaria: "Cobrança necessária",
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  assinado: "Assinado",
  cancelado: "Cancelado",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

/** Paleta institucional. */
export const BRAND = {
  background: "#F8FAFC",
  sidebar: "#0F172A",
  primary: "#1E3A8A",
  accent: "#C9A84C",
  text: "#0F172A",
  muted: "#64748B",
  success: "#16A34A",
  danger: "#DC2626",
} as const;

/** Cores para gráficos (Recharts). */
export const CHART_COLORS = [
  "#1E3A8A",
  "#C9A84C",
  "#0EA5E9",
  "#16A34A",
  "#DC2626",
  "#7C3AED",
  "#F59E0B",
  "#64748B",
];
