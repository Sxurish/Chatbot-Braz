-- ============================================================================
-- Fase 5 — Saúde das automações
-- Rode UMA vez no SQL Editor do projeto "CRM/ChatBot-Jurídico", DEPOIS de
-- supabase/assistente-fase4.sql. É seguro rodar de novo.
--
-- automation_runs: cada execução das rotinas automáticas (andamentos do
-- DataJud, resumo diário, intimações): quando começou, quando terminou, se deu
-- certo, um resumo do que fez e o erro, se houve. A página /automacoes lê daqui.
--
-- - Só o Admin lê. Quem grava é o servidor (service role), que ignora o RLS.
-- - Limpeza: a própria rotina apaga as execuções com mais de 90 dias sempre que
--   grava uma nova. Para limpar à mão: select public.prune_automation_runs();
-- ============================================================================

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  -- Nome da rotina: 'andamentos', 'resumo', 'intimacoes'...
  job text not null,
  started_at timestamptz not null default now(),
  -- Vazio enquanto a rotina está rodando (ou se ela foi interrompida).
  finished_at timestamptz,
  -- true = deu certo; false = falhou; vazio = ainda rodando / interrompida.
  ok boolean,
  -- Números da execução (processos consultados, resumos enviados...).
  summary jsonb,
  error text,
  -- 'cron' = horário automático; 'manual' = alguém mandou rodar.
  trigger text not null default 'cron',
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.automation_runs
    add constraint automation_runs_trigger_check check (trigger in ('cron', 'manual'));
exception when duplicate_object then null; end $$;

create index if not exists idx_automation_runs_job_started
  on public.automation_runs(job, started_at desc);
create index if not exists idx_automation_runs_started
  on public.automation_runs(started_at desc);

alter table public.automation_runs enable row level security;

-- Só Admin ativo lê. Sem políticas de INSERT/UPDATE/DELETE: só o servidor grava.
drop policy if exists "admin_select_automation_runs" on public.automation_runs;
create policy "admin_select_automation_runs" on public.automation_runs
  for select to authenticated
  using (public.is_admin());

-- Limpeza: apaga execuções com mais de 90 dias. Devolve quantas apagou.
create or replace function public.prune_automation_runs(keep_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.automation_runs
  where started_at < now() - make_interval(days => greatest(keep_days, 1));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.prune_automation_runs(integer) from public;
revoke all on function public.prune_automation_runs(integer) from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'automation_runs'
order by ordinal_position;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'automation_runs';
