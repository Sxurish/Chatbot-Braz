-- ============================================================================
-- Correção dos cadastros manuais do CRM
-- Rode no SQL Editor do Supabase DEPOIS da instalação completa.
-- É seguro rodar de novo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Follow-ups: a tabela tinha o gatilho que atualiza updated_at, mas não tinha
-- a coluna. Qualquer alteração em um follow-up falhava com
-- 'record "new" has no field "updated_at"'.
-- ----------------------------------------------------------------------------
alter table public.follow_ups
  add column if not exists updated_at timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- Templates de documentos: o envio de template (.docx) usa o bucket
-- "document_templates", que não era criado e não tinha regras de acesso.
-- Sem as regras, o envio falhava mesmo com o bucket criado à mão.
-- Bucket privado. A equipe lê (para gerar documentos); só o Admin envia,
-- troca ou apaga arquivos de template.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('document_templates', 'document_templates', false)
on conflict (id) do nothing;

drop policy if exists "team_read_document_templates" on storage.objects;
create policy "team_read_document_templates" on storage.objects
  for select to authenticated
  using (bucket_id = 'document_templates' and public.is_team_member());

drop policy if exists "admin_insert_document_templates" on storage.objects;
create policy "admin_insert_document_templates" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'document_templates' and public.is_admin());

drop policy if exists "admin_update_document_templates" on storage.objects;
create policy "admin_update_document_templates" on storage.objects
  for update to authenticated
  using (bucket_id = 'document_templates' and public.is_admin());

drop policy if exists "admin_delete_document_templates" on storage.objects;
create policy "admin_delete_document_templates" on storage.objects
  for delete to authenticated
  using (bucket_id = 'document_templates' and public.is_admin());

-- ----------------------------------------------------------------------------
-- Conferência (deve mostrar: follow_ups_updated_at = 1, bucket = 1, regras = 4)
-- ----------------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'follow_ups'
      and column_name = 'updated_at') as follow_ups_updated_at,
  (select count(*) from storage.buckets where id = 'document_templates') as bucket,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like '%document_templates') as regras;
