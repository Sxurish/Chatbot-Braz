-- ============================================================================
-- Documentos pelo assistente (2026-11-20): rode UMA vez no SQL Editor do
-- projeto "CRM/ChatBot-Jurídico". Idempotente: pode rodar de novo.
-- Rode DEPOIS de assistente-fase1.sql, fase2 e fase3 (ou da instalacao-completa.sql).
--
-- 1. Rascunho do tipo "modelo" (preencher modelos .docx pelo chat).
-- 2. Gasto do mês separado entre Haiku e Sonnet (tela Configurações).
-- 3. Minutas escritas pela IA (tabela assistant_minutas).
-- ============================================================================

-- 1. Aceita o tipo "modelo" nos rascunhos do assistente.
alter table public.assistant_drafts
  drop constraint if exists assistant_drafts_kind_check;
alter table public.assistant_drafts
  add constraint assistant_drafts_kind_check
  check (kind in ('processo', 'lead', 'tarefa', 'prazo', 'compromisso', 'documento', 'andamento', 'modelo'));

-- 2. Gasto do mês por modelo (toda a equipe; a RLS só mostraria as próprias linhas).
create or replace function public.assistant_month_cost_by_model()
returns table (model text, cost_usd numeric)
language sql
security definer
stable
set search_path = public
as $$
  select m.model, coalesce(sum(m.cost_usd), 0)
  from public.assistant_messages m
  where public.is_team_member()
    and m.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo')
                          at time zone 'America/Sao_Paulo'
  group by m.model;
$$;

revoke all on function public.assistant_month_cost_by_model() from public;
grant execute on function public.assistant_month_cost_by_model() to authenticated;

-- 3. Minutas escritas pela IA.

create table if not exists public.assistant_minutas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  conversation_id uuid references public.assistant_conversations(id) on delete set null,
  tipo text not null
    check (tipo in ('manifestacao', 'notificacao_extrajudicial', 'comunicacao_cliente', 'resumo_caso')),
  title text not null default '',
  body text not null default '',
  -- Pontos que a IA pediu para o advogado conferir.
  checks jsonb not null default '[]'::jsonb,
  -- {process_id, case_id, lead_id, client_id}
  refs jsonb not null default '{}'::jsonb,
  ref_label text,
  attachment_id uuid references public.assistant_attachments(id) on delete set null,
  -- "falhou": a IA não devolveu a minuta; a linha só guarda o custo.
  status text not null default 'rascunho'
    check (status in ('rascunho', 'salva', 'falhou')),
  document_id uuid references public.documents(id) on delete set null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assistant_minutas_conversation
  on public.assistant_minutas(conversation_id);
create index if not exists idx_assistant_minutas_created
  on public.assistant_minutas(created_at);

alter table public.assistant_minutas enable row level security;

drop policy if exists "own_select_assistant_minutas" on public.assistant_minutas;
create policy "own_select_assistant_minutas" on public.assistant_minutas
  for select to authenticated
  using (user_id = auth.uid() and public.is_team_member());

drop policy if exists "own_insert_assistant_minutas" on public.assistant_minutas;
create policy "own_insert_assistant_minutas" on public.assistant_minutas
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_team_member());

drop policy if exists "own_update_assistant_minutas" on public.assistant_minutas;
create policy "own_update_assistant_minutas" on public.assistant_minutas
  for update to authenticated
  using (user_id = auth.uid() and public.is_team_member())
  with check (user_id = auth.uid() and public.is_team_member());

drop policy if exists "own_delete_assistant_minutas" on public.assistant_minutas;
create policy "own_delete_assistant_minutas" on public.assistant_minutas
  for delete to authenticated
  using (user_id = auth.uid() and public.is_team_member());

-- Gasto do mês com minutas (toda a equipe), para o limite do assistente.
create or replace function public.assistant_minutas_month_cost()
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
  from public.assistant_minutas m
  where m.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo')
                          at time zone 'America/Sao_Paulo';
$$;

revoke all on function public.assistant_minutas_month_cost() from public;
grant execute on function public.assistant_minutas_month_cost() to authenticated;

-- Conferência: deve listar as quatro políticas.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'assistant_minutas'
order by policyname;
