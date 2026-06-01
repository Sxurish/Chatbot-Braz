-- ============================================================================
-- Provisionamento automático de perfil ao criar usuário no Supabase Auth.
-- Execute APÓS o schema.sql.
-- ============================================================================

-- Cria automaticamente um registro em public.users quando um usuário é criado
-- no auth.users. O papel padrão é 'atendente'; ajuste manualmente para
-- 'admin'/'advogado' conforme necessário.
--
-- Observações importantes:
--  * SECURITY DEFINER + search_path fixo em 'public' para que o tipo enum
--    user_role e a tabela public.users sejam sempre resolvidos.
--  * O tipo é schema-qualificado (public.user_role) por segurança.
--  * O cast do role é tolerante: se vier um valor inválido nos metadados,
--    cai para 'atendente' em vez de derrubar a criação do usuário.
--  * Toda a inserção é protegida por EXCEPTION para nunca bloquear o signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  -- Resolve o papel a partir dos metadados, com fallback seguro.
  begin
    v_role := coalesce(
      (new.raw_user_meta_data->>'role')::public.user_role,
      'atendente'::public.user_role
    );
  exception when others then
    v_role := 'atendente'::public.user_role;
  end;

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

-- ----------------------------------------------------------------------------
-- Promover o primeiro usuário a admin (rode após criar o usuário no painel):
--   update public.users set role = 'admin' where email = 'jean@escritoriobraz.adv.br';
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Já criou um usuário no Auth ANTES de aplicar esta correção? Ele pode ter
-- ficado sem perfil em public.users. Rode este backfill para criar os perfis
-- faltantes a partir do auth.users:
--
-- insert into public.users (id, name, email, role, active)
-- select u.id,
--        coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
--        u.email,
--        'atendente'::public.user_role,
--        true
-- from auth.users u
-- left join public.users p on p.id = u.id
-- where p.id is null;
-- ----------------------------------------------------------------------------
