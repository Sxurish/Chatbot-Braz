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
