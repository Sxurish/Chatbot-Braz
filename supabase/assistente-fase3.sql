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
