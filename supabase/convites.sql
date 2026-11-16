-- ============================================================================
-- Primeiro acesso por convite — rode UMA vez no SQL Editor do projeto
-- "CRM/ChatBot-Jurídico" (é seguro rodar de novo).
--
-- O Admin cadastra nome, e-mail e papel. A pessoa entra em "Primeiro acesso"
-- na tela de login, recebe um código de 6 dígitos por e-mail e cria a senha.
-- Só quem tem convite pendente e dentro da validade (7 dias) consegue.
-- ============================================================================

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  name text not null,
  role public.user_role not null default 'atendente',
  status text not null default 'pendente'
    check (status in ('pendente', 'aceito', 'cancelado')),
  invited_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Um único convite pendente por e-mail.
create unique index if not exists uq_team_invites_pending_email
  on public.team_invites(email) where status = 'pendente';

alter table public.team_invites enable row level security;

-- Só Admin vê e gerencia convites pelo painel. O fluxo de primeiro acesso
-- (pessoa ainda sem login) roda no servidor com a service role.
drop policy if exists "admin_all_team_invites" on public.team_invites;
create policy "admin_all_team_invites" on public.team_invites
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Conferência
select 'team_invites' as tabela, count(*) as convites from public.team_invites;
