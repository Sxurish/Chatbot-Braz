-- ============================================================================
-- INSTALAÇÃO COMPLETA do banco do CRM Jurídico (Dr. Jean Braz)
--
-- Use quando o projeto do Supabase ainda NÃO tem as tabelas do CRM
-- (erro "relation public.users does not exist").
--
-- ANTES DE RODAR: confira no topo do Supabase que o projeto aberto é o
-- "CRM/ChatBot-Jurídico". Rodar em outro projeto criaria as tabelas do CRM lá.
--
-- É seguro rodar de novo: tudo usa "if not exists" / "or replace".
-- Junta, nesta ordem: schema, auth, storage, channels, lgpd, templates,
-- atualizacao-2026-11-16, assistente-fase1, convites, assistente-fase2 e assistente-fase3. No fim, cria o perfil de quem
-- já existe em Authentication → Users e lista a equipe.
-- ============================================================================



-- ############################################################################
-- ### supabase/schema.sql
-- ############################################################################

-- ============================================================================
-- Schema do CRM Jurídico — Dr. Jean Braz
-- Banco: Supabase PostgreSQL
-- Execute no SQL Editor do Supabase (ou via migration).
-- ============================================================================

-- Extensões úteis
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- ENUMs
-- ----------------------------------------------------------------------------
do $$ begin
  create type legal_area as enum (
    'penal','civil','administrativo','previdenciario','bancario','imobiliario',
    'trabalhista','familia','consumidor','empresarial','tributario','contratos',
    'lgpd','outro','nao_confirmada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type urgency_level as enum ('alta','media','baixa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type commercial_status as enum (
    'novo_lead','em_qualificacao','aguardando_documentos','consulta_agendada',
    'consulta_realizada','proposta_enviada','negociacao','contrato_enviado',
    'contrato_assinado','cliente_ativo','perdido','nao_qualificado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type legal_status as enum (
    'triagem_inicial','analise_documental','estrategia_em_definicao',
    'aguardando_procuracao','aguardando_contrato','em_elaboracao','protocolado',
    'em_andamento','aguardando_audiencia','aguardando_decisao','recurso','encerrado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type financial_status as enum (
    'sem_cobranca','consulta_pendente','honorarios_pendentes','entrada_paga',
    'parcelamento_ativo','em_atraso','quitado','cobranca_necessaria'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('admin','advogado','atendente','financeiro','visualizador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('alta','media','baixa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('pendente','em_andamento','concluida','cancelada','atrasada');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- users (perfis vinculados ao auth.users do Supabase Auth)
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text unique not null,
  role user_role not null default 'atendente',
  active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- leads
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  phone text,
  email text,
  city text,
  state text,
  legal_area legal_area not null default 'nao_confirmada',
  subarea text,
  case_type text,
  case_summary text,
  urgency urgency_level not null default 'baixa',
  urgency_reason text,
  commercial_status commercial_status not null default 'novo_lead',
  legal_status legal_status not null default 'triagem_inicial',
  financial_status financial_status not null default 'sem_cobranca',
  source text not null default 'chatbot',
  assigned_to uuid references public.users(id) on delete set null,
  consent_given boolean not null default false,
  consent_at timestamptz,
  privacy_policy_version text,
  process_number text,
  has_existing_process boolean not null default false,
  is_existing_client boolean not null default false,
  preferred_contact_time text,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_urgency on public.leads(urgency);
create index if not exists idx_leads_area on public.leads(legal_area);
create index if not exists idx_leads_commercial on public.leads(commercial_status);

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  cpf_cnpj text,
  city text,
  state text,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- cases
-- ----------------------------------------------------------------------------
create table if not exists public.cases (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  legal_area legal_area not null default 'nao_confirmada',
  subarea text,
  summary text,
  status legal_status not null default 'triagem_inicial',
  assigned_to uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- processes
-- ----------------------------------------------------------------------------
create table if not exists public.processes (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid references public.cases(id) on delete cascade,
  process_number text,
  court text,
  jurisdiction text,
  class text,
  subject text,
  status legal_status not null default 'em_andamento',
  next_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- contracts
-- ----------------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  contract_type text,
  status text not null default 'rascunho',
  value numeric(12,2),
  payment_terms text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- conversations & messages
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete cascade,
  channel text not null default 'chatbot',
  status text not null default 'aberta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('user','bot','system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_conversation on public.messages(conversation_id);

-- ----------------------------------------------------------------------------
-- documents
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text not null,
  category text not null default 'outros',
  uploaded_by uuid references public.users(id) on delete set null,
  review_status text not null default 'pendente',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- appointments
-- ----------------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  title text not null,
  date date not null,
  start_time time not null,
  end_time time,
  modality text not null default 'online' check (modality in ('online','presencial','telefone')),
  meeting_link text,
  status text not null default 'agendada',
  notes text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- tasks
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  title text not null,
  description text,
  assigned_to uuid references public.users(id) on delete set null,
  due_date timestamptz,
  priority task_priority not null default 'media',
  status task_status not null default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- follow_ups
-- ----------------------------------------------------------------------------
create table if not exists public.follow_ups (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  description text,
  scheduled_at timestamptz not null,
  status text not null default 'pendente',
  assigned_to uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- payments (financeiro)
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid references public.contracts(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  description text,
  amount numeric(12,2) not null default 0,
  due_date timestamptz,
  paid_at timestamptz,
  status text not null default 'pendente',
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_status on public.payments(status);

-- ----------------------------------------------------------------------------
-- consent_logs (LGPD)
-- ----------------------------------------------------------------------------
create table if not exists public.consent_logs (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete cascade,
  consent_type text not null default 'atendimento',
  consent_given boolean not null,
  policy_version text,
  ip_address text,
  user_agent text,
  channel text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- knowledge_base
-- ----------------------------------------------------------------------------
create table if not exists public.knowledge_base (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text,
  content text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read boolean not null default false,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- audit_logs
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- settings (configurações do escritório / chatbot)
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1,
  office_name text default 'Escritório Dr. Jean Braz',
  privacy_policy_version text default '1.0.0',
  ai_provider text default 'mock',
  ai_model text,
  data jsonb,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

-- ----------------------------------------------------------------------------
-- Trigger genérico para updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['leads','clients','cases','processes','contracts','conversations','tasks','follow_ups','knowledge_base','settings']
  loop
    execute format(
      'drop trigger if exists trg_%I_updated on public.%I;
       create trigger trg_%I_updated before update on public.%I
       for each row execute function public.set_updated_at();', t, t, t, t);
  end loop;
end $$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Estratégia: equipe autenticada acessa os dados; inserção pública controlada
-- (chatbot grava leads/consent via service role no server). Ajuste conforme
-- a política definitiva do escritório.
-- ============================================================================
alter table public.leads enable row level security;
alter table public.clients enable row level security;
alter table public.cases enable row level security;
alter table public.processes enable row level security;
alter table public.contracts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.appointments enable row level security;
alter table public.tasks enable row level security;
alter table public.follow_ups enable row level security;
alter table public.payments enable row level security;
alter table public.consent_logs enable row level security;
alter table public.knowledge_base enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;
alter table public.users enable row level security;

-- Helper: usuário autenticado e ativo faz parte da equipe.
create or replace function public.is_team_member()
returns boolean as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.active = true
  );
$$ language sql security definer stable;

-- Política padrão: membros da equipe têm acesso total (leitura/escrita).
do $$
declare t text;
begin
  foreach t in array array[
    'leads','clients','cases','processes','contracts','conversations','messages',
    'documents','appointments','tasks','follow_ups','payments','consent_logs',
    'knowledge_base','notifications','audit_logs','settings'
  ]
  loop
    execute format('drop policy if exists "team_all_%I" on public.%I;', t, t);
    execute format(
      'create policy "team_all_%I" on public.%I
       for all to authenticated
       using (public.is_team_member())
       with check (public.is_team_member());', t, t);
  end loop;
end $$;

-- Usuários podem ler/atualizar o próprio perfil.
drop policy if exists "users_self_read" on public.users;
create policy "users_self_read" on public.users
  for select to authenticated using (id = auth.uid() or public.is_team_member());

-- Knowledge base: leitura pública (consumida pelo chatbot anônimo).
drop policy if exists "kb_public_read" on public.knowledge_base;
create policy "kb_public_read" on public.knowledge_base
  for select to anon using (is_active = true);

-- ============================================================================
-- Observação: a gravação de leads/consentimentos a partir do chatbot anônimo
-- deve ser feita no servidor usando a SERVICE ROLE KEY (ignora RLS), garantindo
-- validação e sanitização antes da persistência.
-- ============================================================================


-- ############################################################################
-- ### supabase/auth.sql
-- ############################################################################

-- ============================================================================
-- Provisionamento automático de perfil ao criar usuário no Supabase Auth.
-- Execute APÓS o schema.sql.
-- ============================================================================

-- Cria automaticamente um registro em public.users quando um usuário é criado
-- no auth.users. O papel padrão é 'atendente'; ajuste manualmente para
-- 'admin'/'advogado' conforme necessário.
--
-- Observações importantes:
--  * SECURITY DEFINER + search_path fixo em 'public' para que o tipo enum
--    user_role e a tabela public.users sejam sempre resolvidos.
--  * O tipo é schema-qualificado (public.user_role) por segurança.
--  * O papel NUNCA vem dos metadados do cadastro: quem se cadastra escolhe
--    esses metadados, então aceitar 'role' dali deixaria qualquer pessoa
--    virar admin. Todo usuário novo nasce 'atendente'; promova pelo SQL.
--  * Mantenha "Allow new users to sign up" DESLIGADO no Supabase Auth:
--    a equipe é criada pelo painel (Authentication → Users → Add user).
--  * Toda a inserção é protegida por EXCEPTION para nunca bloquear o signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  -- Papel fixo: nunca confiar em metadados enviados pelo próprio usuário.
  v_role := 'atendente'::public.user_role;

  begin
    insert into public.users (id, name, email, role, active)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email,
      v_role,
      true
    )
    on conflict (id) do nothing;
  exception when others then
    -- Não bloqueia a criação do usuário no Auth caso o perfil já exista
    -- ou ocorra qualquer erro inesperado; o perfil pode ser ajustado depois.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Promover o primeiro usuário a admin (rode após criar o usuário no painel):
--   update public.users set role = 'admin' where email = 'jean@escritoriobraz.adv.br';
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Já criou um usuário no Auth ANTES de aplicar esta correção? Ele pode ter
-- ficado sem perfil em public.users. Rode este backfill para criar os perfis
-- faltantes a partir do auth.users:
--
-- insert into public.users (id, name, email, role, active)
-- select u.id,
--        coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
--        u.email,
--        'atendente'::public.user_role,
--        true
-- from auth.users u
-- left join public.users p on p.id = u.id
-- where p.id is null;
-- ----------------------------------------------------------------------------


-- ############################################################################
-- ### supabase/storage.sql
-- ############################################################################

-- ============================================================================
-- Storage de documentos — bucket privado.
-- Execute APÓS o schema.sql.
-- ============================================================================

-- Cria o bucket privado "documents" (não público).
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Políticas: somente membros autenticados da equipe acessam os arquivos.
drop policy if exists "team_read_documents" on storage.objects;
create policy "team_read_documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_team_member());

drop policy if exists "team_insert_documents" on storage.objects;
create policy "team_insert_documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_team_member());

drop policy if exists "team_update_documents" on storage.objects;
create policy "team_update_documents" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.is_team_member());

drop policy if exists "team_delete_documents" on storage.objects;
create policy "team_delete_documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_team_member());

-- ----------------------------------------------------------------------------
-- Observação: uploads feitos pelo cliente final (chatbot anônimo) devem passar
-- pelo servidor usando a service role, que ignora RLS. Nunca exponha a service
-- role no client.
-- ----------------------------------------------------------------------------


-- ############################################################################
-- ### supabase/channels.sql
-- ############################################################################

-- ============================================================================
-- Integração de canais (WhatsApp / Instagram) — colunas e índices.
-- Execute APÓS o schema.sql.
-- ============================================================================

-- A conversa passa a guardar o identificador externo do contato (telefone do
-- WhatsApp ou IGSID do Instagram), permitindo retomar o estado a cada webhook.
alter table public.conversations
  add column if not exists external_contact_id text,
  add column if not exists contact_name text;

-- Índice para localizar rapidamente a conversa aberta de um contato por canal.
create index if not exists idx_conversations_channel_contact
  on public.conversations (channel, external_contact_id);

-- Estado da triagem (etapa do funil, consentimento, área/urgência correntes)
-- guardado por conversa para orientar as próximas respostas.
alter table public.conversations
  add column if not exists triage_state jsonb not null default '{}'::jsonb;

-- Deduplicação de webhooks: a Meta pode reenviar o mesmo evento.
-- Guarda os IDs de mensagens já processadas.
create table if not exists public.channel_events (
  id uuid primary key default uuid_generate_v4(),
  channel text not null,
  external_message_id text not null,
  created_at timestamptz not null default now(),
  unique (channel, external_message_id)
);

alter table public.channel_events enable row level security;

drop policy if exists "team_read_channel_events" on public.channel_events;
create policy "team_read_channel_events" on public.channel_events
  for select to authenticated using (public.is_team_member());

-- Observação: a escrita em conversations/messages/leads/channel_events a partir
-- dos webhooks é feita no servidor com a SERVICE ROLE (ignora RLS).


-- ############################################################################
-- ### supabase/lgpd.sql
-- ############################################################################

-- ============================================================================
-- LGPD — Solicitações de titulares de dados (DSAR).
-- Execute APÓS o schema.sql.
-- ============================================================================

create table if not exists public.dsr_requests (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete set null,
  requester_name text not null,
  requester_email text,
  requester_phone text,
  request_type text not null check (request_type in (
    'exclusao','correcao','exportacao','revogacao','informacao','outro'
  )),
  description text,
  status text not null default 'recebida' check (status in (
    'recebida','em_analise','concluida','negada'
  )),
  resolution_notes text,
  received_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dsr_email on public.dsr_requests(requester_email);
create index if not exists idx_dsr_status on public.dsr_requests(status);
create index if not exists idx_dsr_received on public.dsr_requests(received_at desc);

-- updated_at automático
drop trigger if exists trg_dsr_requests_updated on public.dsr_requests;
create trigger trg_dsr_requests_updated before update on public.dsr_requests
  for each row execute function public.set_updated_at();

-- RLS — segue o padrão de equipe autenticada (is_team_member).
alter table public.dsr_requests enable row level security;

drop policy if exists "team_all_dsr_requests" on public.dsr_requests;
create policy "team_all_dsr_requests" on public.dsr_requests
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());


-- ############################################################################
-- ### supabase/templates.sql
-- ############################################################################

-- ============================================================================
-- Automação documental — templates de documentos DOCX.
-- Execute APÓS o schema.sql.
--
-- IMPORTANTE: além desta migração, é preciso criar manualmente no Supabase
-- Dashboard um bucket privado chamado "document_templates":
--   Storage → New bucket → Name: document_templates → Public: NO
-- ============================================================================

create table if not exists public.document_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  category text not null default 'outros',
  storage_path text not null,
  /** Placeholders detectados automaticamente no upload (ex: cliente.nome). */
  placeholders text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_templates_active
  on public.document_templates(active);
create index if not exists idx_templates_category
  on public.document_templates(category);

drop trigger if exists trg_document_templates_updated on public.document_templates;
create trigger trg_document_templates_updated before update on public.document_templates
  for each row execute function public.set_updated_at();

-- RLS — equipe autenticada lê/escreve (escrita real é controlada na app).
alter table public.document_templates enable row level security;

drop policy if exists "team_all_document_templates" on public.document_templates;
create policy "team_all_document_templates" on public.document_templates
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());


-- ############################################################################
-- ### supabase/atualizacao-2026-11-16.sql
-- ############################################################################

-- ============================================================================
-- Atualização de 2026-11-16 — rode UMA vez no SQL Editor do projeto
-- "CRM/ChatBot-Jurídico" (é seguro rodar de novo).
--
-- 1. Segurança: o papel de usuário novo deixa de vir dos metadados do cadastro
--    (antes, quem se cadastrasse podia mandar role = 'admin').
-- 2. Confere se algum perfil virou admin/advogado sem você saber.
-- 3. Grava o número da OAB do Dr. Jean (459.159) nas configurações.
-- ============================================================================

-- 1. Gatilho de criação de perfil (mesmo conteúdo de supabase/auth.sql)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  -- Papel fixo: nunca confiar em metadados enviados pelo próprio usuário.
  v_role := 'atendente'::public.user_role;

  begin
    insert into public.users (id, name, email, role, active)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email,
      v_role,
      true
    )
    on conflict (id) do nothing;
  exception when others then
    -- Não bloqueia a criação do usuário no Auth caso o perfil já exista
    -- ou ocorra qualquer erro inesperado; o perfil pode ser ajustado depois.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Conferência: lista quem tem acesso hoje. Confira se todos são da equipe.
--    Se aparecer alguém desconhecido, desative:
--      update public.users set active = false where email = 'email@desconhecido';
select u.email, u.role, u.active, a.created_at as criado_em, a.last_sign_in_at as ultimo_login
from public.users u
join auth.users a on a.id = u.id
order by a.created_at;

-- 3. Número da OAB nas configurações do escritório (usado nos documentos).
update public.settings
set data = coalesce(data, '{}'::jsonb)
           || jsonb_build_object(
                'office',
                coalesce(data->'office', '{}'::jsonb) || '{"oab": "OAB/SP 459.159"}'::jsonb
              ),
    updated_at = now()
where id = 1;


-- ############################################################################
-- ### supabase/assistente-fase1.sql
-- ############################################################################

-- ============================================================================
-- Assistente virtual — Fase 1 (consulta no painel)
-- Rode UMA vez no SQL Editor do projeto "CRM/ChatBot-Jurídico", DEPOIS de
-- supabase/atualizacao-2026-11-16.sql. É seguro rodar de novo.
--
-- 1. Financeiro só para Admin, no banco: pagamentos e contratos passam a ser
--    lidos e gravados apenas por quem tem papel "admin".
-- 2. Configurações do escritório: toda a equipe lê, só Admin altera.
-- 3. Tabelas do assistente: conversas e mensagens por usuário, com tokens e
--    custo de cada resposta (para o limite de gasto mensal).
-- 4. Função que soma o gasto do mês de toda a equipe (sem expor as conversas).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper: usuário autenticado, ativo e com papel admin.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.active = true and u.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Pagamentos e contratos: só Admin (antes: qualquer membro ativo da equipe).
do $$
declare t text;
begin
  foreach t in array array['payments', 'contracts']
  loop
    execute format('drop policy if exists "team_all_%I" on public.%I;', t, t);
    execute format('drop policy if exists "admin_all_%I" on public.%I;', t, t);
    execute format(
      'create policy "admin_all_%I" on public.%I
       for all to authenticated
       using (public.is_admin())
       with check (public.is_admin());', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Configurações: leitura pela equipe, escrita só por Admin.
--    (Guarda o limite de gasto do assistente; antes qualquer membro alterava.)
-- ----------------------------------------------------------------------------
drop policy if exists "team_all_settings" on public.settings;
drop policy if exists "team_read_settings" on public.settings;
drop policy if exists "admin_write_settings" on public.settings;

create policy "team_read_settings" on public.settings
  for select to authenticated
  using (public.is_team_member());

create policy "admin_write_settings" on public.settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Limite mensal inicial do assistente: US$ 50 (alterável em Configurações).
insert into public.settings (id) values (1) on conflict (id) do nothing;
update public.settings
set data = coalesce(data, '{}'::jsonb)
           || jsonb_build_object(
                'assistant',
                jsonb_build_object('enabled', true, 'monthly_limit_usd', 50)
                  || coalesce(data->'assistant', '{}'::jsonb)
              )
where id = 1;

-- ----------------------------------------------------------------------------
-- 3. Conversas e mensagens do assistente.
-- ----------------------------------------------------------------------------
create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.users(id) on delete cascade,
  channel text not null default 'painel'
    check (channel in ('painel', 'whatsapp')),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assistant_conversations_user
  on public.assistant_conversations(user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.assistant_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid()
    references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  page_context text,
  tools_used jsonb not null default '[]'::jsonb,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_messages_conversation
  on public.assistant_messages(conversation_id, created_at);
create index if not exists idx_assistant_messages_created
  on public.assistant_messages(created_at);

drop trigger if exists trg_assistant_conversations_updated on public.assistant_conversations;
create trigger trg_assistant_conversations_updated
  before update on public.assistant_conversations
  for each row execute function public.set_updated_at();

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

-- Cada pessoa vê e mexe só nas próprias conversas.
drop policy if exists "own_assistant_conversations" on public.assistant_conversations;
create policy "own_assistant_conversations" on public.assistant_conversations
  for all to authenticated
  using (user_id = auth.uid() and public.is_team_member())
  with check (user_id = auth.uid() and public.is_team_member());

-- Mensagens: lê e grava só nas próprias conversas. Não há política de UPDATE:
-- uma mensagem gravada (e o custo dela) não pode ser alterada pelo navegador.
drop policy if exists "own_assistant_messages_select" on public.assistant_messages;
create policy "own_assistant_messages_select" on public.assistant_messages
  for select to authenticated
  using (user_id = auth.uid() and public.is_team_member());

drop policy if exists "own_assistant_messages_insert" on public.assistant_messages;
create policy "own_assistant_messages_insert" on public.assistant_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_team_member()
    and exists (
      select 1 from public.assistant_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "own_assistant_messages_delete" on public.assistant_messages;
create policy "own_assistant_messages_delete" on public.assistant_messages
  for delete to authenticated
  using (user_id = auth.uid() and public.is_team_member());

-- ----------------------------------------------------------------------------
-- 4. Gasto do mês com o assistente (toda a equipe), em dólares.
--    Security definer: soma os custos sem dar acesso às conversas dos outros.
-- ----------------------------------------------------------------------------
create or replace function public.assistant_month_cost()
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select case
    when public.is_team_member() then coalesce(sum(m.cost_usd), 0)
    else 0
  end
  from public.assistant_messages m
  where m.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo')
                          at time zone 'America/Sao_Paulo';
$$;

revoke all on function public.assistant_month_cost() from public;
grant execute on function public.assistant_month_cost() to authenticated;

-- ----------------------------------------------------------------------------
-- Conferência: deve listar as políticas novas.
-- ----------------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('payments', 'contracts', 'settings',
                    'assistant_conversations', 'assistant_messages')
order by tablename, policyname;


-- ############################################################################
-- ### supabase/convites.sql
-- ############################################################################

-- ============================================================================
-- Primeiro acesso por convite — rode UMA vez no SQL Editor do projeto
-- "CRM/ChatBot-Jurídico" (é seguro rodar de novo).
--
-- O Admin cadastra nome, e-mail e papel. A pessoa entra em "Primeiro acesso"
-- na tela de login, recebe um código de 6 dígitos por e-mail e cria a senha.
-- Só quem tem convite pendente e dentro da validade (7 dias) consegue.
-- ============================================================================

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  name text not null,
  role public.user_role not null default 'atendente',
  status text not null default 'pendente'
    check (status in ('pendente', 'aceito', 'cancelado')),
  invited_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Um único convite pendente por e-mail.
create unique index if not exists uq_team_invites_pending_email
  on public.team_invites(email) where status = 'pendente';

alter table public.team_invites enable row level security;

-- Só Admin vê e gerencia convites pelo painel. O fluxo de primeiro acesso
-- (pessoa ainda sem login) roda no servidor com a service role.
drop policy if exists "admin_all_team_invites" on public.team_invites;
create policy "admin_all_team_invites" on public.team_invites
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Conferência
select 'team_invites' as tabela, count(*) as convites from public.team_invites;


-- ############################################################################
-- ### supabase/assistente-fase2.sql
-- ############################################################################

-- ============================================================================
-- Assistente virtual — Fase 2 (cadastro com confirmação + leitura de documentos)
-- Rode UMA vez no SQL Editor do projeto "CRM/ChatBot-Jurídico", DEPOIS de
-- supabase/assistente-fase1.sql. É seguro rodar de novo.
--
-- 1. Rascunhos: o assistente nunca grava direto. Ele prepara um rascunho e
--    só o botão "Confirmar" (no servidor, com o login de quem confirma)
--    transforma o rascunho em cadastro.
-- 2. Anexos: PDFs e prints enviados ao assistente ficam no bucket privado
--    "documents", na pasta assistente/<usuário>/. Os que não viram documento
--    do CRM são apagados depois de 7 dias.
-- 3. Mensagens do assistente guardam o nome dos anexos (para o histórico).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Anexos enviados ao assistente
-- ----------------------------------------------------------------------------
create table if not exists public.assistant_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  conversation_id uuid references public.assistant_conversations(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  size_bytes bigint not null check (size_bytes > 0),
  -- Preenchido quando o arquivo vira documento do CRM (aí não é mais apagado).
  document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_assistant_attachments_user
  on public.assistant_attachments(user_id, created_at);

alter table public.assistant_attachments enable row level security;

drop policy if exists "own_select_assistant_attachments" on public.assistant_attachments;
create policy "own_select_assistant_attachments" on public.assistant_attachments
  for select to authenticated
  using (user_id = auth.uid() and public.is_team_member());

drop policy if exists "own_insert_assistant_attachments" on public.assistant_attachments;
create policy "own_insert_assistant_attachments" on public.assistant_attachments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_team_member()
    and storage_path like 'assistente/' || auth.uid()::text || '/%'
  );

drop policy if exists "own_update_assistant_attachments" on public.assistant_attachments;
create policy "own_update_assistant_attachments" on public.assistant_attachments
  for update to authenticated
  using (user_id = auth.uid() and public.is_team_member())
  with check (user_id = auth.uid());

drop policy if exists "own_delete_assistant_attachments" on public.assistant_attachments;
create policy "own_delete_assistant_attachments" on public.assistant_attachments
  for delete to authenticated
  using (user_id = auth.uid() and public.is_team_member());

-- ----------------------------------------------------------------------------
-- 2. Rascunhos de cadastro
-- ----------------------------------------------------------------------------
create table if not exists public.assistant_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  conversation_id uuid references public.assistant_conversations(id) on delete set null,
  kind text not null
    check (kind in ('processo', 'lead', 'tarefa', 'prazo', 'compromisso', 'documento')),
  data jsonb not null default '{}'::jsonb,
  -- Campos que a IA não teve certeza (aparecem em amarelo no cartão).
  uncertain text[] not null default '{}',
  -- Registros parecidos encontrados antes de criar (aviso de duplicado).
  duplicates jsonb not null default '[]'::jsonb,
  attachment_id uuid references public.assistant_attachments(id) on delete set null,
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmando', 'confirmado', 'descartado')),
  result_table text,
  result_id uuid,
  result_link text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_assistant_drafts_conversation
  on public.assistant_drafts(conversation_id);

alter table public.assistant_drafts enable row level security;

drop policy if exists "own_select_assistant_drafts" on public.assistant_drafts;
create policy "own_select_assistant_drafts" on public.assistant_drafts
  for select to authenticated
  using (user_id = auth.uid() and public.is_team_member());

drop policy if exists "own_insert_assistant_drafts" on public.assistant_drafts;
create policy "own_insert_assistant_drafts" on public.assistant_drafts
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_team_member() and status = 'pendente');

drop policy if exists "own_update_assistant_drafts" on public.assistant_drafts;
create policy "own_update_assistant_drafts" on public.assistant_drafts
  for update to authenticated
  using (user_id = auth.uid() and public.is_team_member())
  with check (user_id = auth.uid());
-- Sem política de delete: descartar é mudar o status (fica o histórico).

-- ----------------------------------------------------------------------------
-- 3. Nome dos anexos nas mensagens
-- ----------------------------------------------------------------------------
alter table public.assistant_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('assistant_attachments', 'assistant_drafts')
order by tablename, policyname;


-- ############################################################################
-- ### supabase/assistente-fase3.sql
-- ############################################################################

-- ============================================================================
-- Assistente virtual — Fase 3 (andamentos dos processos)
-- Rode UMA vez no SQL Editor do projeto "CRM/ChatBot-Jurídico", DEPOIS de
-- supabase/assistente-fase2.sql. É seguro rodar de novo.
--
-- 1. process_movements: andamentos de cada processo, vindos do DataJud (CNJ)
--    ou lançados pela equipe.
-- 2. A trava fica no banco: a busca automática só ACRESCENTA andamentos
--    (função merge_datajud_movements). Andamento manual ou editado pela
--    equipe fica travado e nenhuma rotina sem login pode alterá-lo ou apagá-lo.
-- 3. processes ganha last_synced_at, sync_enabled e sync_error.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas em processes
-- ----------------------------------------------------------------------------
alter table public.processes
  add column if not exists sync_enabled boolean not null default true,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_error text;

-- ----------------------------------------------------------------------------
-- 2. Andamentos
-- ----------------------------------------------------------------------------
create table if not exists public.process_movements (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete cascade,
  occurred_at timestamptz not null,
  description text not null check (length(trim(description)) > 0),
  -- Código do movimento na Tabela Processual Unificada do CNJ (quando houver).
  movement_code integer,
  source text not null check (source in ('datajud', 'manual')),
  -- Chave do tribunal: evita duplicar o mesmo andamento a cada busca.
  external_key text,
  -- Grau/instância de onde veio (G1, G2, JE, TR...).
  instance text,
  locked boolean not null default false,
  hidden boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  edited_by uuid references public.users(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source = 'manual' or external_key is not null)
);

create unique index if not exists uq_process_movements_external
  on public.process_movements(process_id, external_key)
  where external_key is not null;
create index if not exists idx_process_movements_process
  on public.process_movements(process_id, occurred_at desc);
create index if not exists idx_process_movements_created
  on public.process_movements(created_at desc);

-- Andamento manual nasce travado e com o autor; edição da equipe trava.
create or replace function public.process_movements_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.source = 'manual' then
      new.locked := true;
      new.created_by := coalesce(new.created_by, auth.uid());
    end if;
    return new;
  end if;

  -- Sem login (rotina automática, service role): nunca mexe em travados.
  if auth.uid() is null and (old.locked or old.source = 'manual') then
    raise exception 'Andamento travado: a busca automática não pode alterá-lo.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Origem, chave do tribunal e processo não mudam depois de criados.
  new.source := old.source;
  new.external_key := old.external_key;
  new.process_id := old.process_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();

  if auth.uid() is not null then
    new.locked := true;
    new.edited_by := auth.uid();
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_process_movements_guard_ins on public.process_movements;
create trigger trg_process_movements_guard_ins
  before insert on public.process_movements
  for each row execute function public.process_movements_guard();

drop trigger if exists trg_process_movements_guard_upd on public.process_movements;
create trigger trg_process_movements_guard_upd
  before update or delete on public.process_movements
  for each row execute function public.process_movements_guard();

alter table public.process_movements enable row level security;

drop policy if exists "team_select_process_movements" on public.process_movements;
create policy "team_select_process_movements" on public.process_movements
  for select to authenticated
  using (public.is_team_member());

-- A equipe só LANÇA andamentos manuais; os do tribunal entram pela função.
drop policy if exists "team_insert_manual_movements" on public.process_movements;
create policy "team_insert_manual_movements" on public.process_movements
  for insert to authenticated
  with check (public.is_team_member() and source = 'manual');

drop policy if exists "team_update_process_movements" on public.process_movements;
create policy "team_update_process_movements" on public.process_movements
  for update to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

-- Apagar só andamento manual (o do tribunal pode ser ocultado).
drop policy if exists "team_delete_manual_movements" on public.process_movements;
create policy "team_delete_manual_movements" on public.process_movements
  for delete to authenticated
  using (public.is_team_member() and source = 'manual');

-- ----------------------------------------------------------------------------
-- 3. Busca automática: só acrescenta o que falta.
--    p_rows = [{"external_key","occurred_at","description","movement_code","instance"}]
--    p_rows nulo = a consulta ao tribunal falhou (só registra p_error).
--    p_error com p_rows = consulta feita, com aviso (ex.: não encontrado).
--    Devolve quantos andamentos novos entraram e se era a primeira carga
--    (na primeira não se avisa a equipe, para não virar uma enxurrada).
-- ----------------------------------------------------------------------------
create or replace function public.merge_datajud_movements(
  p_process_id uuid,
  p_rows jsonb,
  p_error text default null
)
returns table (inserted integer, first_sync boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first boolean;
  v_count integer := 0;
begin
  -- Chamada por alguém logado: precisa ser da equipe.
  if auth.uid() is not null and not public.is_team_member() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  perform 1 from public.processes where id = p_process_id;
  if not found then
    raise exception 'Processo não encontrado.' using errcode = 'P0002';
  end if;
  v_first := not exists (
    select 1 from public.process_movements
    where process_id = p_process_id and source = 'datajud'
  );

  if p_rows is not null then
    insert into public.process_movements
      (process_id, occurred_at, description, movement_code, source, external_key, instance)
    select p_process_id,
           (r->>'occurred_at')::timestamptz,
           left(r->>'description', 2000),
           nullif(r->>'movement_code', '')::integer,
           'datajud',
           r->>'external_key',
           nullif(r->>'instance', '')
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where coalesce(r->>'external_key', '') <> ''
      and coalesce(trim(r->>'description'), '') <> ''
      and r->>'occurred_at' is not null
    on conflict (process_id, external_key) where external_key is not null do nothing;
    get diagnostics v_count = row_count;
  end if;

  update public.processes
     set last_synced_at = case when p_rows is not null then now() else last_synced_at end,
         sync_error = p_error
   where id = p_process_id;

  return query select v_count, v_first;
end;
$$;

revoke all on function public.merge_datajud_movements(uuid, jsonb, text) from public;
grant execute on function public.merge_datajud_movements(uuid, jsonb, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'process_movements'
order by policyname;

-- ----------------------------------------------------------------------------
-- 4. Assistente: rascunho "Registrar andamento" (kind = 'andamento').
--    Recria a checagem de tipos de assistant_drafts (criada na fase 2).
-- ----------------------------------------------------------------------------
alter table public.assistant_drafts
  drop constraint if exists assistant_drafts_kind_check;
alter table public.assistant_drafts
  add constraint assistant_drafts_kind_check
  check (kind in ('processo', 'lead', 'tarefa', 'prazo', 'compromisso', 'documento', 'andamento'));


-- ############################################################################
-- ### Perfis de quem já estava cadastrado em Authentication → Users
-- ############################################################################
-- O gatilho só cria perfil para usuários NOVOS. Quem já existia no Auth
-- ganha perfil agora, como "atendente".
insert into public.users (id, name, email, role, active)
select a.id,
       coalesce(a.raw_user_meta_data->>'name', split_part(a.email, '@', 1)),
       a.email,
       'atendente'::public.user_role,
       true
from auth.users a
where not exists (select 1 from public.users u where u.id = a.id);

-- Depois, promova o(s) administrador(es), trocando o e-mail:
--   update public.users set role = 'admin' where email = 'email-do-admin@exemplo.com';

select email, role, active from public.users order by created_at;
