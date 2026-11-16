-- ============================================================================
-- Atualização de 2026-11-16 — rode UMA vez no SQL Editor do projeto
-- "CRM/ChatBot-Jurídico" (é seguro rodar de novo).
--
-- 1. Segurança: o papel de usuário novo deixa de vir dos metadados do cadastro
--    (antes, quem se cadastrasse podia mandar role = 'admin').
-- 2. Confere se algum perfil virou admin/advogado sem você saber.
-- 3. Grava o número da OAB do Dr. Jean (459.159) nas configurações.
-- ============================================================================

-- 1. Gatilho de criação de perfil (mesmo conteúdo de supabase/auth.sql)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  -- Papel fixo: nunca confiar em metadados enviados pelo próprio usuário.
  v_role := 'atendente'::public.user_role;

  begin
    insert into public.users (id, name, email, role, active)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email,
      v_role,
      true
    )
    on conflict (id) do nothing;
  exception when others then
    -- Não bloqueia a criação do usuário no Auth caso o perfil já exista
    -- ou ocorra qualquer erro inesperado; o perfil pode ser ajustado depois.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Conferência: lista quem tem acesso hoje. Confira se todos são da equipe.
--    Se aparecer alguém desconhecido, desative:
--      update public.users set active = false where email = 'email@desconhecido';
select u.email, u.role, u.active, a.created_at as criado_em, a.last_sign_in_at as ultimo_login
from public.users u
join auth.users a on a.id = u.id
order by a.created_at;

-- 3. Número da OAB nas configurações do escritório (usado nos documentos).
update public.settings
set data = coalesce(data, '{}'::jsonb)
           || jsonb_build_object(
                'office',
                coalesce(data->'office', '{}'::jsonb) || '{"oab": "OAB/SP 459.159"}'::jsonb
              ),
    updated_at = now()
where id = 1;
