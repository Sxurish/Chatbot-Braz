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
    'documents','appointments','tasks','follow_ups','consent_logs',
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
