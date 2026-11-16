-- ============================================================================
-- Assistente virtual — Fase 2 (cadastro com confirmação + leitura de documentos)
-- Rode UMA vez no SQL Editor do projeto "CRM/ChatBot-Jurídico", DEPOIS de
-- supabase/assistente-fase1.sql. É seguro rodar de novo.
--
-- 1. Rascunhos: o assistente nunca grava direto. Ele prepara um rascunho e
--    só o botão "Confirmar" (no servidor, com o login de quem confirma)
--    transforma o rascunho em cadastro.
-- 2. Anexos: PDFs e prints enviados ao assistente ficam no bucket privado
--    "documents", na pasta assistente/<usuário>/. Os que não viram documento
--    do CRM são apagados depois de 7 dias.
-- 3. Mensagens do assistente guardam o nome dos anexos (para o histórico).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Anexos enviados ao assistente
-- ----------------------------------------------------------------------------
create table if not exists public.assistant_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  conversation_id uuid references public.assistant_conversations(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  size_bytes bigint not null check (size_bytes > 0),
  -- Preenchido quando o arquivo vira documento do CRM (aí não é mais apagado).
  document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_assistant_attachments_user
  on public.assistant_attachments(user_id, created_at);

alter table public.assistant_attachments enable row level security;

drop policy if exists "own_select_assistant_attachments" on public.assistant_attachments;
create policy "own_select_assistant_attachments" on public.assistant_attachments
  for select to authenticated
  using (user_id = auth.uid() and public.is_team_member());

drop policy if exists "own_insert_assistant_attachments" on public.assistant_attachments;
create policy "own_insert_assistant_attachments" on public.assistant_attachments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_team_member()
    and storage_path like 'assistente/' || auth.uid()::text || '/%'
  );

drop policy if exists "own_update_assistant_attachments" on public.assistant_attachments;
create policy "own_update_assistant_attachments" on public.assistant_attachments
  for update to authenticated
  using (user_id = auth.uid() and public.is_team_member())
  with check (user_id = auth.uid());

drop policy if exists "own_delete_assistant_attachments" on public.assistant_attachments;
create policy "own_delete_assistant_attachments" on public.assistant_attachments
  for delete to authenticated
  using (user_id = auth.uid() and public.is_team_member());

-- ----------------------------------------------------------------------------
-- 2. Rascunhos de cadastro
-- ----------------------------------------------------------------------------
create table if not exists public.assistant_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  conversation_id uuid references public.assistant_conversations(id) on delete set null,
  kind text not null
    check (kind in ('processo', 'lead', 'tarefa', 'prazo', 'compromisso', 'documento')),
  data jsonb not null default '{}'::jsonb,
  -- Campos que a IA não teve certeza (aparecem em amarelo no cartão).
  uncertain text[] not null default '{}',
  -- Registros parecidos encontrados antes de criar (aviso de duplicado).
  duplicates jsonb not null default '[]'::jsonb,
  attachment_id uuid references public.assistant_attachments(id) on delete set null,
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmando', 'confirmado', 'descartado')),
  result_table text,
  result_id uuid,
  result_link text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_assistant_drafts_conversation
  on public.assistant_drafts(conversation_id);

alter table public.assistant_drafts enable row level security;

drop policy if exists "own_select_assistant_drafts" on public.assistant_drafts;
create policy "own_select_assistant_drafts" on public.assistant_drafts
  for select to authenticated
  using (user_id = auth.uid() and public.is_team_member());

drop policy if exists "own_insert_assistant_drafts" on public.assistant_drafts;
create policy "own_insert_assistant_drafts" on public.assistant_drafts
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_team_member() and status = 'pendente');

drop policy if exists "own_update_assistant_drafts" on public.assistant_drafts;
create policy "own_update_assistant_drafts" on public.assistant_drafts
  for update to authenticated
  using (user_id = auth.uid() and public.is_team_member())
  with check (user_id = auth.uid());
-- Sem política de delete: descartar é mudar o status (fica o histórico).

-- ----------------------------------------------------------------------------
-- 3. Nome dos anexos nas mensagens
-- ----------------------------------------------------------------------------
alter table public.assistant_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('assistant_attachments', 'assistant_drafts')
order by tablename, policyname;
