/**
 * Tipagens centrais do CRM jurídico.
 * Refletem o modelo de dados descrito no schema do Supabase (supabase/schema.sql).
 */

export type LegalArea =
  | "penal"
  | "civil"
  | "administrativo"
  | "previdenciario"
  | "bancario"
  | "imobiliario"
  | "trabalhista"
  | "familia"
  | "consumidor"
  | "empresarial"
  | "tributario"
  | "contratos"
  | "lgpd"
  | "outro"
  | "nao_confirmada";

export type Urgency = "alta" | "media" | "baixa";

export type CommercialStatus =
  | "novo_lead"
  | "em_qualificacao"
  | "aguardando_documentos"
  | "consulta_agendada"
  | "consulta_realizada"
  | "proposta_enviada"
  | "negociacao"
  | "contrato_enviado"
  | "contrato_assinado"
  | "cliente_ativo"
  | "perdido"
  | "nao_qualificado";

export type LegalStatus =
  | "triagem_inicial"
  | "analise_documental"
  | "estrategia_em_definicao"
  | "aguardando_procuracao"
  | "aguardando_contrato"
  | "em_elaboracao"
  | "protocolado"
  | "em_andamento"
  | "aguardando_audiencia"
  | "aguardando_decisao"
  | "recurso"
  | "encerrado";

export type FinancialStatus =
  | "sem_cobranca"
  | "consulta_pendente"
  | "honorarios_pendentes"
  | "entrada_paga"
  | "parcelamento_ativo"
  | "em_atraso"
  | "quitado"
  | "cobranca_necessaria";

export type LeadSource =
  | "chatbot"
  | "site"
  | "indicacao"
  | "instagram"
  | "google"
  | "whatsapp"
  | "telefone"
  | "outro";

export type UserRole = "admin" | "advogado" | "atendente" | "financeiro" | "visualizador";

export type TaskPriority = "alta" | "media" | "baixa";
export type TaskStatus = "pendente" | "em_andamento" | "concluida" | "cancelada" | "atrasada";

export type DocumentCategory =
  | "documento_pessoal"
  | "contrato"
  | "comprovante"
  | "intimacao"
  | "processo"
  | "prova"
  | "laudo"
  | "certidao"
  | "decisao"
  | "procuracao"
  | "honorarios"
  | "outros";

export interface Lead {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  legal_area: LegalArea;
  subarea: string | null;
  case_type: string | null;
  case_summary: string | null;
  urgency: Urgency;
  urgency_reason: string | null;
  commercial_status: CommercialStatus;
  legal_status: LegalStatus;
  financial_status: FinancialStatus;
  source: LeadSource;
  assigned_to: string | null;
  consent_given: boolean;
  consent_at: string | null;
  privacy_policy_version: string | null;
  process_number: string | null;
  has_existing_process: boolean;
  is_existing_client: boolean;
  preferred_contact_time: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEntry {
  id: string;
  lead_id: string;
  type: "note" | "status_change" | "document" | "appointment" | "message" | "task";
  title: string;
  description?: string;
  author?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_type: "user" | "bot" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface LegalDocument {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  case_id: string | null;
  process_id: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  category: DocumentCategory;
  uploaded_by: string | null;
  review_status: "pendente" | "revisado" | "rejeitado";
  created_at: string;
}

export interface Task {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  case_id: string | null;
  process_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  assigned_to: string | null;
  title: string;
  date: string;
  start_time: string;
  end_time: string | null;
  modality: "online" | "presencial" | "telefone";
  meeting_link: string | null;
  status: "agendada" | "concluida" | "cancelada" | "remarcada";
  notes: string | null;
  created_at: string;
}

export interface FollowUp {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  title: string;
  description: string | null;
  scheduled_at: string;
  status: "pendente" | "concluido" | "cancelado";
  assigned_to: string | null;
  created_at: string;
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  last_login: string | null;
  created_at: string;
}

export type NotificationType =
  | "novo_lead"
  | "lead_urgente"
  | "documento_enviado"
  | "consulta_agendada"
  | "tarefa_vencendo"
  | "tarefa_atrasada"
  | "lead_aguardando"
  | "follow_up_pendente"
  | "contrato_enviado"
  | "contrato_assinado"
  | "pagamento_atraso";

export interface AppNotification {
  id: string;
  user_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Fase 6 — Clientes, Casos, Processos, Contratos e Financeiro
// ---------------------------------------------------------------------------

export interface Client {
  id: string;
  lead_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  city: string | null;
  state: string | null;
  status: "ativo" | "inativo";
  created_at: string;
  updated_at: string;
}

export interface Case {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  title: string;
  legal_area: LegalArea;
  subarea: string | null;
  summary: string | null;
  status: LegalStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface Process {
  id: string;
  case_id: string | null;
  process_number: string | null;
  court: string | null;
  jurisdiction: string | null;
  class: string | null;
  subject: string | null;
  status: LegalStatus;
  next_deadline: string | null;
  created_at: string;
  updated_at: string;
}

export type ContractStatus =
  | "rascunho"
  | "enviado"
  | "assinado"
  | "cancelado";

export interface Contract {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  case_id: string | null;
  contract_type: string | null;
  status: ContractStatus;
  value: number | null;
  payment_terms: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = "pendente" | "pago" | "atrasado" | "cancelado";

export interface Payment {
  id: string;
  contract_id: string | null;
  client_id: string | null;
  description: string | null;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  status: PaymentStatus;
  created_at: string;
}


