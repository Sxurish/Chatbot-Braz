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
--  * O papel NUNCA vem dos metadados do cadastro: quem se cadastra escolhe
--    esses metadados, então aceitar 'role' dali deixaria qualquer pessoa
--    virar admin. Todo usuário novo nasce 'atendente'; promova pelo SQL.
--  * Mantenha "Allow new users to sign up" DESLIGADO no Supabase Auth:
--    a equipe é criada pelo painel (Authentication → Users → Add user).
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
