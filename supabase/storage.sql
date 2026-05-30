-- ============================================================================
-- Storage de documentos — bucket privado.
-- Execute APÓS o schema.sql.
-- ============================================================================

-- Cria o bucket privado "documents" (não público).
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Políticas: somente membros autenticados da equipe acessam os arquivos.
drop policy if exists "team_read_documents" on storage.objects;
create policy "team_read_documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_team_member());

drop policy if exists "team_insert_documents" on storage.objects;
create policy "team_insert_documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_team_member());

drop policy if exists "team_update_documents" on storage.objects;
create policy "team_update_documents" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.is_team_member());

drop policy if exists "team_delete_documents" on storage.objects;
create policy "team_delete_documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_team_member());

-- ----------------------------------------------------------------------------
-- Observação: uploads feitos pelo cliente final (chatbot anônimo) devem passar
-- pelo servidor usando a service role, que ignora RLS. Nunca exponha a service
-- role no client.
-- ----------------------------------------------------------------------------
