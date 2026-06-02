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
