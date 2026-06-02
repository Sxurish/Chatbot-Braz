-- ============================================================================
-- Automação documental — templates de documentos DOCX.
-- Execute APÓS o schema.sql.
--
-- IMPORTANTE: além desta migração, é preciso criar manualmente no Supabase
-- Dashboard um bucket privado chamado "document_templates":
--   Storage → New bucket → Name: document_templates → Public: NO
-- ============================================================================

create table if not exists public.document_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  category text not null default 'outros',
  storage_path text not null,
  /** Placeholders detectados automaticamente no upload (ex: cliente.nome). */
  placeholders text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_templates_active
  on public.document_templates(active);
create index if not exists idx_templates_category
  on public.document_templates(category);

drop trigger if exists trg_document_templates_updated on public.document_templates;
create trigger trg_document_templates_updated before update on public.document_templates
  for each row execute function public.set_updated_at();

-- RLS — equipe autenticada lê/escreve (escrita real é controlada na app).
alter table public.document_templates enable row level security;

drop policy if exists "team_all_document_templates" on public.document_templates;
create policy "team_all_document_templates" on public.document_templates
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());
