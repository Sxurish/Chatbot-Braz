-- ============================================================================
-- Fase 5 — Prazos e calendário forense (TJSP)
-- Rode UMA vez no SQL Editor do projeto "CRM/ChatBot-Jurídico", DEPOIS de
-- supabase/instalacao-completa.sql (ou das fases anteriores). É seguro rodar
-- de novo.
--
-- 1. forensic_calendar_days: dias sem expediente cadastrados pelo Admin
--    (Carnaval, Semana Santa, Corpus Christi, feriados municipais,
--    suspensões pontuais). Nunca apaga: "remover" = preencher removed_*,
--    com motivo. Feriados nacionais fixos, 9 de julho e recesso (20/12 a
--    20/01) são calculados pelo sistema e não ficam aqui.
-- 2. Semente com os dias móveis de 2026 e 2027 (o Admin pode remover).
-- 3. deadline_calculations: histórico dos cálculos de prazo (cálculo,
--    ajuste, confirmação, descarte). Só acrescenta: o banco recusa UPDATE,
--    DELETE e TRUNCATE para qualquer um, inclusive o service role.
-- ============================================================================

-- Quem pode gravar: membro ativo da equipe que não é só Visualizador.
create or replace function public.is_team_writer()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.active = true and u.role <> 'visualizador'
  );
$$;

revoke all on function public.is_team_writer() from public;
grant execute on function public.is_team_writer() to authenticated;

-- Bloqueio de TRUNCATE (vale para as duas tabelas desta fase).
create or replace function public.block_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A tabela % é um histórico e não pode ser esvaziada.', tg_table_name
    using errcode = 'P0001';
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Calendário forense
-- ----------------------------------------------------------------------------
create table if not exists public.forensic_calendar_days (
  id uuid primary key default gen_random_uuid(),
  court text not null default 'TJSP',
  day date not null,
  kind text not null check (kind in ('feriado', 'suspensao', 'ponto_facultativo', 'feriado_municipal')),
  -- null = vale para todas as comarcas.
  comarca text check (comarca is null or length(trim(comarca)) > 0),
  description text not null check (length(trim(description)) > 0),
  -- Fonte: lei, provimento, comunicado.
  source text not null check (length(trim(source)) > 0),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  created_by uuid,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid,
  removed_reason text,
  -- Feriado municipal sempre diz a comarca.
  check (kind <> 'feriado_municipal' or comarca is not null),
  check (removed_at is null or length(trim(coalesce(removed_reason, ''))) > 0)
);

create index if not exists idx_forensic_calendar_days_day
  on public.forensic_calendar_days(court, day);

-- Inserir: autor = quem está logado; nasce sem remoção.
-- Alterar: só preencher removed_* UMA vez. Apagar: nunca.
create or replace function public.forensic_calendar_days_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.removed_at := null;
    new.removed_by := null;
    new.removed_reason := null;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'O calendário não apaga dias. Use "remover", com o motivo.'
      using errcode = 'P0001';
  end if;

  if old.removed_at is not null then
    raise exception 'Este dia já foi removido e não pode ser alterado.'
      using errcode = 'P0001';
  end if;

  if (new.id, new.court, new.day, new.kind, new.comarca, new.description,
      new.source, new.source_url, new.created_by, new.created_at)
     is distinct from
     (old.id, old.court, old.day, old.kind, old.comarca, old.description,
      old.source, old.source_url, old.created_by, old.created_at) then
    raise exception 'Os dados do dia não mudam. Remova e cadastre de novo.'
      using errcode = 'P0001';
  end if;

  if new.removed_at is null or length(trim(coalesce(new.removed_reason, ''))) = 0 then
    raise exception 'Só é possível remover o dia, informando o motivo.'
      using errcode = 'P0001';
  end if;

  new.removed_at := now();
  new.removed_by := coalesce(auth.uid(), new.removed_by);
  return new;
end;
$$;

drop trigger if exists trg_forensic_calendar_days_guard_ins on public.forensic_calendar_days;
create trigger trg_forensic_calendar_days_guard_ins
  before insert on public.forensic_calendar_days
  for each row execute function public.forensic_calendar_days_guard();

drop trigger if exists trg_forensic_calendar_days_guard_upd on public.forensic_calendar_days;
create trigger trg_forensic_calendar_days_guard_upd
  before update or delete on public.forensic_calendar_days
  for each row execute function public.forensic_calendar_days_guard();

drop trigger if exists trg_forensic_calendar_days_truncate on public.forensic_calendar_days;
create trigger trg_forensic_calendar_days_truncate
  before truncate on public.forensic_calendar_days
  for each statement execute function public.block_truncate();

alter table public.forensic_calendar_days enable row level security;

drop policy if exists "team_select_forensic_calendar_days" on public.forensic_calendar_days;
create policy "team_select_forensic_calendar_days" on public.forensic_calendar_days
  for select to authenticated
  using (public.is_team_member());

drop policy if exists "admin_insert_forensic_calendar_days" on public.forensic_calendar_days;
create policy "admin_insert_forensic_calendar_days" on public.forensic_calendar_days
  for insert to authenticated
  with check (public.is_admin());

-- "Remover" é um UPDATE (o gatilho só deixa preencher removed_*).
drop policy if exists "admin_remove_forensic_calendar_days" on public.forensic_calendar_days;
create policy "admin_remove_forensic_calendar_days" on public.forensic_calendar_days
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke truncate on public.forensic_calendar_days from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Semente: dias móveis que o TJSP costuma suspender (2026 e 2027).
--    Datas pela Páscoa (2026: 05/04; 2027: 28/03). Quarta-feira de Cinzas
--    NÃO entra (há expediente). Dia já cadastrado (mesmo removido) não volta.
-- ----------------------------------------------------------------------------
-- SEMENTE
insert into public.forensic_calendar_days (court, day, kind, comarca, description, source)
select 'TJSP', s.day::date, 'suspensao', null, s.description,
       'Calendário forense do TJSP (conferir o provimento do CSM do ano)'
from (values
  ('2026-02-16', 'Carnaval (segunda-feira)'),
  ('2026-02-17', 'Carnaval (terça-feira)'),
  ('2026-04-02', 'Quinta-feira Santa'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-06-04', 'Corpus Christi'),
  ('2027-02-08', 'Carnaval (segunda-feira)'),
  ('2027-02-09', 'Carnaval (terça-feira)'),
  ('2027-03-25', 'Quinta-feira Santa'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-05-27', 'Corpus Christi')
) as s(day, description)
where not exists (
  select 1 from public.forensic_calendar_days f
  where f.court = 'TJSP' and f.day = s.day::date and f.comarca is null and f.kind = 'suspensao'
);
-- FIM DA SEMENTE

-- ----------------------------------------------------------------------------
-- 3. Histórico de cálculos de prazo (só acrescenta)
-- ----------------------------------------------------------------------------
create table if not exists public.deadline_calculations (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references public.processes(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  -- Intimação de origem (a tabela de intimações vem na fase seguinte; sem FK).
  publication_id uuid,
  -- Registro anterior da mesma conta (ajuste, confirmação ou descarte).
  previous_id uuid references public.deadline_calculations(id),
  action text not null check (action in ('calculo', 'ajuste', 'confirmacao', 'descarte')),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  -- Passos e dias pulados, com a fonte de cada um.
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  final_date date,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (action = 'calculo' or previous_id is not null),
  check (action = 'descarte' or final_date is not null),
  check (action <> 'ajuste' or length(trim(coalesce(reason, ''))) > 0)
);

create index if not exists idx_deadline_calculations_process
  on public.deadline_calculations(process_id, created_at desc);
create index if not exists idx_deadline_calculations_created
  on public.deadline_calculations(created_at desc);
-- Uma conta só é confirmada ou descartada uma vez.
create unique index if not exists uq_deadline_calculations_closed
  on public.deadline_calculations(previous_id)
  where action in ('confirmacao', 'descarte');

create or replace function public.deadline_calculations_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    return new;
  end if;

  -- Única exceção: o próprio banco limpando o vínculo quando um processo ou
  -- uma tarefa é apagado (on delete set null, que roda dentro de outro
  -- gatilho). Nada além disso muda.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and (new.process_id is null or new.process_id = old.process_id)
     and (new.task_id is null or new.task_id = old.task_id)
     and (new.id, new.publication_id, new.previous_id, new.action, new.input,
          new.result, new.final_date, new.reason, new.created_by, new.created_at)
         is not distinct from
         (old.id, old.publication_id, old.previous_id, old.action, old.input,
          old.result, old.final_date, old.reason, old.created_by, old.created_at) then
    return new;
  end if;

  raise exception 'O histórico de prazos não pode ser alterado nem apagado. Registre um ajuste.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_deadline_calculations_guard_ins on public.deadline_calculations;
create trigger trg_deadline_calculations_guard_ins
  before insert on public.deadline_calculations
  for each row execute function public.deadline_calculations_guard();

drop trigger if exists trg_deadline_calculations_guard_upd on public.deadline_calculations;
create trigger trg_deadline_calculations_guard_upd
  before update or delete on public.deadline_calculations
  for each row execute function public.deadline_calculations_guard();

drop trigger if exists trg_deadline_calculations_truncate on public.deadline_calculations;
create trigger trg_deadline_calculations_truncate
  before truncate on public.deadline_calculations
  for each statement execute function public.block_truncate();

alter table public.deadline_calculations enable row level security;

drop policy if exists "team_select_deadline_calculations" on public.deadline_calculations;
create policy "team_select_deadline_calculations" on public.deadline_calculations
  for select to authenticated
  using (public.is_team_member());

drop policy if exists "team_insert_deadline_calculations" on public.deadline_calculations;
create policy "team_insert_deadline_calculations" on public.deadline_calculations
  for insert to authenticated
  with check (public.is_team_writer() and created_by = auth.uid());

-- Sem política de UPDATE/DELETE: ninguém altera (e o gatilho recusa mesmo
-- para o service role).
revoke update, delete, truncate on public.deadline_calculations from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select 'calendario' as item, count(*)::text as valor
from public.forensic_calendar_days where removed_at is null
union all
select 'semente_2026_2027', count(*)::text
from public.forensic_calendar_days
where kind = 'suspensao' and comarca is null and extract(year from day) in (2026, 2027)
union all
select 'gatilhos', string_agg(tgname, ', ' order by tgname)
from pg_trigger
where tgrelid in ('public.forensic_calendar_days'::regclass, 'public.deadline_calculations'::regclass)
  and not tgisinternal
union all
select 'politicas', string_agg(tablename || ': ' || policyname, ', ' order by tablename, policyname)
from pg_policies
where schemaname = 'public' and tablename in ('forensic_calendar_days', 'deadline_calculations');
