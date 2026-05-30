-- ============================================================================
-- Provisionamento automático de perfil ao criar usuário no Supabase Auth.
-- Execute APÓS o schema.sql.
-- ============================================================================

-- Cria automaticamente um registro em public.users quando um usuário é criado
-- no auth.users. O papel padrão é 'atendente'; ajuste manualmente para
-- 'admin'/'advogado' conforme necessário.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'atendente'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Promover o primeiro usuário a admin (rode após criar o usuário no painel):
--   update public.users set role = 'admin' where email = 'jean@escritoriobraz.adv.br';
-- ----------------------------------------------------------------------------
