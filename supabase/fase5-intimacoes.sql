-- ============================================================================
-- Fase 5, parte B — Intimações do DJEN (Comunica PJe do CNJ)
-- Rode UMA vez no SQL Editor do projeto "CRM/ChatBot-Jurídico", DEPOIS de
-- supabase/fase5-prazos.sql e supabase/fase5-automacoes.sql (ou de
-- supabase/instalacao-completa.sql). É seguro rodar de novo.
--
-- 1. court_publications: as intimações capturadas no DJEN. Só o servidor
--    (service role) grava intimações novas. A equipe lê; quem não é
--    Visualizador confere (confirma, descarta, vincula a um processo).
--    O banco garante: depois de confirmada ou descartada, a intimação não
--    volta para "para conferir", e o texto, as datas e a chave nunca mudam.
-- 2. publication_sync_state: até que dia a busca no DJEN deu certo. Só o
--    Admin lê; só o servidor grava.
-- 3. process_movements aceita andamentos de origem 'djen' (criados quando a
--    intimação é confirmada). Eles nascem travados.
--
-- O agendamento de hora em hora (pg_cron + pg_net) fica em outro arquivo:
-- supabase/fase5-intimacoes-agendamento.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Intimações
-- ----------------------------------------------------------------------------
create table if not exists public.court_publications (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'djen' check (source in ('djen')),
  -- Chave estável (djenKey): evita gravar a mesma intimação duas vezes.
  external_key text not null unique check (length(trim(external_key)) > 0),
  external_id text,
  hash text,
  -- Disponibilização no DJEN e publicação (1º dia útil seguinte).
  available_date date not null,
  publication_date date,
  tribunal text,
  organ text,
  kind text,
  document_type text,
  class_name text,
  -- Só dígitos (20).
  process_number text check (process_number is null or process_number ~ '^\d{20}$'),
  process_number_masked text,
  process_id uuid references public.processes(id) on delete set null,
  text text not null,
  parties jsonb not null default '[]'::jsonb check (jsonb_typeof(parties) = 'array'),
  lawyers jsonb not null default '[]'::jsonb check (jsonb_typeof(lawyers) = 'array'),
  link text,
  cancelled boolean not null default false,
  cancel_reason text,
  raw jsonb,
  status text not null default 'para_conferir'
    check (status in ('para_conferir', 'confirmada', 'descartada')),
  ai_status text not null default 'pendente'
    check (ai_status in ('pendente', 'pronta', 'falhou', 'desligada')),
  ai_reading jsonb,
  ai_read_at timestamptz,
  ai_error text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  -- Registro "confirmacao" em deadline_calculations (sem FK: o histórico é só-acréscimo).
  calculation_id uuid,
  task_id uuid references public.tasks(id) on delete set null,
  movement_id uuid references public.process_movements(id) on delete set null,
  whatsapp_notified_at timestamptz,
  whatsapp_notified_to uuid,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Custo da leitura pela IA (somado ao gasto do mês no código, não no banco).
alter table public.court_publications
  add column if not exists ai_model text,
  add column if not exists ai_cost_usd numeric(12,6) not null default 0,
  add column if not exists ai_input_tokens integer not null default 0,
  add column if not exists ai_output_tokens integer not null default 0;

create index if not exists idx_court_publications_status
  on public.court_publications(status, available_date desc);
create index if not exists idx_court_publications_available
  on public.court_publications(available_date desc);
create index if not exists idx_court_publications_process
  on public.court_publications(process_id)
  where process_id is not null;
create index if not exists idx_court_publications_number
  on public.court_publications(process_number)
  where process_number is not null;
-- Fila da leitura pela IA e do aviso pelo WhatsApp.
create index if not exists idx_court_publications_ai_pending
  on public.court_publications(captured_at)
  where ai_status = 'pendente';
create index if not exists idx_court_publications_to_notify
  on public.court_publications(captured_at)
  where status = 'para_conferir' and whatsapp_notified_at is null;
create index if not exists court_publications_wa_pending_idx
  on public.court_publications(whatsapp_notified_to, whatsapp_notified_at)
  where status = 'para_conferir';

-- Regras da intimação (valem para todos, inclusive o service role).
create or replace function public.court_publications_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Toda intimação nasce para conferir, sem conferência nem prazo.
    new.status := 'para_conferir';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    new.calculation_id := null;
    new.task_id := null;
    new.movement_id := null;
    new.captured_at := now();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'As intimações não podem ser apagadas. Use "descartar", com o motivo.'
      using errcode = 'P0001';
  end if;

  -- Os dados da intimação nunca mudam.
  if (new.id, new.source, new.external_key, new.external_id, new.hash,
      new.available_date, new.tribunal, new.organ, new.kind, new.document_type,
      new.class_name, new.process_number, new.process_number_masked, new.text,
      new.parties, new.lawyers, new.link, new.raw, new.captured_at, new.created_at)
     is distinct from
     (old.id, old.source, old.external_key, old.external_id, old.hash,
      old.available_date, old.tribunal, old.organ, old.kind, old.document_type,
      old.class_name, old.process_number, old.process_number_masked, old.text,
      old.parties, old.lawyers, old.link, old.raw, old.captured_at, old.created_at) then
    raise exception 'Os dados da intimação (texto, datas, chave) não podem ser alterados.'
      using errcode = 'P0001';
  end if;

  if old.status = 'para_conferir' then
    -- Fechando agora (confirmada ou descartada): anota quem e quando.
    if new.status <> 'para_conferir' then
      new.reviewed_at := coalesce(new.reviewed_at, now());
      if auth.uid() is not null then
        new.reviewed_by := auth.uid();
      end if;
    end if;
  else
    -- Já conferida: o status não volta e a conferência não muda.
    if new.status is distinct from old.status then
      raise exception 'Esta intimação já foi % e não pode mudar de situação.', old.status
        using errcode = 'P0001';
    end if;
    -- Exceção: o próprio banco limpando o vínculo quando o processo, a
    -- tarefa, o andamento ou a pessoa são apagados (on delete set null).
    if pg_trigger_depth() > 1 then
      if new.process_id is not null and new.process_id is distinct from old.process_id
         or new.reviewed_by is not null and new.reviewed_by is distinct from old.reviewed_by then
        raise exception 'A conferência desta intimação não pode ser alterada.'
          using errcode = 'P0001';
      end if;
    elsif (new.process_id, new.reviewed_by, new.reviewed_at, new.review_note,
           new.cancelled, new.cancel_reason, new.publication_date)
          is distinct from
          (old.process_id, old.reviewed_by, old.reviewed_at, old.review_note,
           old.cancelled, old.cancel_reason, old.publication_date) then
      raise exception 'A conferência desta intimação não pode ser alterada.'
        using errcode = 'P0001';
    end if;
    -- Prazo, tarefa e andamento: só preenche uma vez (ou o banco limpa).
    if old.calculation_id is not null and new.calculation_id is distinct from old.calculation_id
       or old.task_id is not null and new.task_id is not null and new.task_id <> old.task_id
       or old.task_id is not null and new.task_id is null and pg_trigger_depth() <= 1
       or old.movement_id is not null and new.movement_id is not null and new.movement_id <> old.movement_id
       or old.movement_id is not null and new.movement_id is null and pg_trigger_depth() <= 1 then
      raise exception 'O prazo, a tarefa e o andamento desta intimação já foram registrados.'
        using errcode = 'P0001';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_court_publications_guard_ins on public.court_publications;
create trigger trg_court_publications_guard_ins
  before insert on public.court_publications
  for each row execute function public.court_publications_guard();

drop trigger if exists trg_court_publications_guard_upd on public.court_publications;
create trigger trg_court_publications_guard_upd
  before update or delete on public.court_publications
  for each row execute function public.court_publications_guard();

drop trigger if exists trg_court_publications_truncate on public.court_publications;
create trigger trg_court_publications_truncate
  before truncate on public.court_publications
  for each statement execute function public.block_truncate();

alter table public.court_publications enable row level security;

drop policy if exists "team_select_court_publications" on public.court_publications;
create policy "team_select_court_publications" on public.court_publications
  for select to authenticated
  using (public.is_team_member());

-- Conferir (confirmar, descartar, vincular processo): quem não é Visualizador.
drop policy if exists "team_writer_update_court_publications" on public.court_publications;
create policy "team_writer_update_court_publications" on public.court_publications
  for update to authenticated
  using (public.is_team_writer())
  with check (public.is_team_writer());

-- Sem política de INSERT/DELETE: só o servidor grava; ninguém apaga.
revoke insert, update, delete, truncate on public.court_publications from anon, authenticated;
-- Pela tela, só as colunas da conferência.
grant update (status, reviewed_by, reviewed_at, review_note, calculation_id,
              task_id, movement_id, process_id)
  on public.court_publications to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Situação da busca no DJEN
-- ----------------------------------------------------------------------------
create table if not exists public.publication_sync_state (
  source text primary key check (source in ('djen')),
  -- Último dia (Brasília) até onde a busca inteira deu certo.
  last_success_date date,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create or replace function public.publication_sync_state_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_publication_sync_state_touch on public.publication_sync_state;
create trigger trg_publication_sync_state_touch
  before insert or update on public.publication_sync_state
  for each row execute function public.publication_sync_state_touch();

alter table public.publication_sync_state enable row level security;

drop policy if exists "admin_select_publication_sync_state" on public.publication_sync_state;
create policy "admin_select_publication_sync_state" on public.publication_sync_state
  for select to authenticated
  using (public.is_admin());

-- Sem política de escrita: só o service role grava.
revoke insert, update, delete, truncate on public.publication_sync_state from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Andamentos de origem 'djen' (intimação confirmada)
-- ----------------------------------------------------------------------------
alter table public.process_movements
  drop constraint if exists process_movements_source_check;
alter table public.process_movements
  add constraint process_movements_source_check
  check (source in ('datajud', 'manual', 'djen'));

-- Mesmo gatilho da fase 3, agora travando também o andamento 'djen'.
create or replace function public.process_movements_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.source in ('manual', 'djen') then
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

-- A equipe (quem não é Visualizador) lança o andamento da intimação confirmada.
drop policy if exists "team_writer_insert_djen_movements" on public.process_movements;
create policy "team_writer_insert_djen_movements" on public.process_movements
  for insert to authenticated
  with check (public.is_team_writer() and source = 'djen');

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select 'intimacoes' as item, count(*)::text as valor
from public.court_publications
union all
select 'para_conferir', count(*)::text
from public.court_publications where status = 'para_conferir'
union all
select 'busca_djen', coalesce((select 'até ' || last_success_date::text from public.publication_sync_state where source = 'djen'), 'ainda não rodou')
union all
select 'origens_andamento', pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.process_movements'::regclass and conname = 'process_movements_source_check'
union all
select 'gatilhos', string_agg(tgname, ', ' order by tgname)
from pg_trigger
where tgrelid in ('public.court_publications'::regclass, 'public.publication_sync_state'::regclass)
  and not tgisinternal
union all
select 'politicas', string_agg(tablename || ': ' || policyname, ', ' order by tablename, policyname)
from pg_policies
where schemaname = 'public'
  and (tablename in ('court_publications', 'publication_sync_state')
       or policyname = 'team_writer_insert_djen_movements');
