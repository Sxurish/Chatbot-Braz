-- ============================================================================
-- Editar e remover registros (entrega 1 da revisão de 2026-11-21)
-- Rode no SQL Editor do Supabase. É seguro rodar de novo.
--
-- Antes, apagar um lead apagava junto as conversas e os registros de
-- consentimento LGPD dele, e apagar um caso apagava os processos. Agora o
-- banco GUARDA esses registros: o vínculo só fica vazio.
-- (O CRM também não deixa remover lead, cliente ou caso com caso, processo,
-- contrato ou pagamento ligado: a saída é inativar ou encerrar.)
-- ============================================================================

do $$
declare
  r record;
  fk text;
begin
  for r in
    select * from (values
      ('consent_logs',  'lead_id', 'leads'),
      ('conversations', 'lead_id', 'leads'),
      ('processes',     'case_id', 'cases')
    ) as t(tbl, col, ref)
  loop
    -- Acha o nome da regra de vínculo (foreign key) atual da coluna.
    select c.conname into fk
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.conrelid = format('public.%I', r.tbl)::regclass
      and a.attname = r.col
    limit 1;

    if fk is not null then
      execute format('alter table public.%I drop constraint %I', r.tbl, fk);
    end if;
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete set null',
      r.tbl, r.tbl || '_' || r.col || '_fkey', r.col, r.ref
    );
  end loop;
end $$;

-- Follow-ups: garante a coluna updated_at (sem ela, editar um follow-up falha).
alter table public.follow_ups
  add column if not exists updated_at timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- Conferência (deve mostrar 3 linhas, todas com "SET NULL")
-- ----------------------------------------------------------------------------
select c.conrelid::regclass as tabela,
       a.attname as coluna,
       case c.confdeltype when 'n' then 'SET NULL' when 'c' then 'CASCADE' else c.confdeltype::text end as ao_apagar
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f'
  and (c.conrelid, a.attname) in (
    ('public.consent_logs'::regclass, 'lead_id'),
    ('public.conversations'::regclass, 'lead_id'),
    ('public.processes'::regclass, 'case_id')
  );
