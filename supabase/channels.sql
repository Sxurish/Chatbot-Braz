-- ============================================================================
-- Integração de canais (WhatsApp / Instagram) — colunas e índices.
-- Execute APÓS o schema.sql.
-- ============================================================================

-- A conversa passa a guardar o identificador externo do contato (telefone do
-- WhatsApp ou IGSID do Instagram), permitindo retomar o estado a cada webhook.
alter table public.conversations
  add column if not exists external_contact_id text,
  add column if not exists contact_name text;

-- Índice para localizar rapidamente a conversa aberta de um contato por canal.
create index if not exists idx_conversations_channel_contact
  on public.conversations (channel, external_contact_id);

-- Estado da triagem (etapa do funil, consentimento, área/urgência correntes)
-- guardado por conversa para orientar as próximas respostas.
alter table public.conversations
  add column if not exists triage_state jsonb not null default '{}'::jsonb;

-- Deduplicação de webhooks: a Meta pode reenviar o mesmo evento.
-- Guarda os IDs de mensagens já processadas.
create table if not exists public.channel_events (
  id uuid primary key default uuid_generate_v4(),
  channel text not null,
  external_message_id text not null,
  created_at timestamptz not null default now(),
  unique (channel, external_message_id)
);

alter table public.channel_events enable row level security;

drop policy if exists "team_read_channel_events" on public.channel_events;
create policy "team_read_channel_events" on public.channel_events
  for select to authenticated using (public.is_team_member());

-- Observação: a escrita em conversations/messages/leads/channel_events a partir
-- dos webhooks é feita no servidor com a SERVICE ROLE (ignora RLS).
