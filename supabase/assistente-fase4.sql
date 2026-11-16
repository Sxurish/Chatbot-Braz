-- ============================================================================
-- Assistente virtual — Fase 4 (resumo diário e assistente pelo WhatsApp)
-- Rode UMA vez no SQL Editor do projeto "CRM/ChatBot-Jurídico", DEPOIS de
-- supabase/assistente-fase3.sql. É seguro rodar de novo.
--
-- 1. users ganha whatsapp_number (número autorizado a falar com o assistente
--    pelo WhatsApp) e daily_digest (recebe o resumo diário). Só o Admin altera,
--    pela tela Equipe (no servidor); a equipe não tem permissão de UPDATE em users.
-- 2. daily_digests: o resumo de cada dia, por pessoa, e se foi enviado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Número de WhatsApp e resumo diário por pessoa da equipe
-- ----------------------------------------------------------------------------
alter table public.users
  add column if not exists whatsapp_number text,
  add column if not exists daily_digest boolean not null default false;

-- Só dígitos, com DDI (ex.: 5511988887777). Um número por pessoa.
do $$ begin
  alter table public.users
    add constraint users_whatsapp_number_format
    check (whatsapp_number is null or whatsapp_number ~ '^[1-9][0-9]{9,14}$');
exception when duplicate_object then null; end $$;

create unique index if not exists uq_users_whatsapp_number
  on public.users(whatsapp_number) where whatsapp_number is not null;

-- ----------------------------------------------------------------------------
-- 2. Resumos diários
-- ----------------------------------------------------------------------------
create table if not exists public.daily_digests (
  id uuid primary key default gen_random_uuid(),
  digest_date date not null,
  user_id uuid not null references public.users(id) on delete cascade,
  -- Conteúdo estruturado (prazos, leads, andamentos, tarefas...).
  content jsonb not null,
  -- Linha curta usada no WhatsApp (modelo aprovado pela Meta).
  summary_line text not null,
  whatsapp_sent_at timestamptz,
  whatsapp_error text,
  created_at timestamptz not null default now(),
  unique (digest_date, user_id)
);
create index if not exists idx_daily_digests_user
  on public.daily_digests(user_id, digest_date desc);

alter table public.daily_digests enable row level security;

-- Cada pessoa vê os próprios resumos; o Admin vê todos. Quem grava é a rotina
-- diária no servidor (service role).
drop policy if exists "own_select_daily_digests" on public.daily_digests;
create policy "own_select_daily_digests" on public.daily_digests
  for select to authenticated
  using (public.is_team_member() and (user_id = auth.uid() or public.is_admin()));

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'users'
  and column_name in ('whatsapp_number', 'daily_digest');
