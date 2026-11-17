-- ============================================================================
-- Fase 5, parte B — Agendamento da busca de intimações (de hora em hora)
--
-- O plano gratuito da Vercel só roda cron uma vez por dia. Por isso quem
-- chama a rotina de hora em hora é o próprio Supabase, com as extensões
-- pg_cron (agenda) e pg_net (faz a chamada HTTP). A Vercel continua com um
-- cron diário de reserva (vercel.json).
--
-- Rode DEPOIS de supabase/fase5-intimacoes.sql. É seguro rodar de novo
-- (o agendamento é recriado, sem duplicar).
--
-- ---------------------------------------------------------------------------
-- PASSO 1 (à mão, uma vez só): guardar o CRON_SECRET no Vault do Supabase
-- ---------------------------------------------------------------------------
-- O segredo NUNCA fica neste arquivo. No SQL Editor, rode sozinho o comando
-- abaixo, trocando COLE_AQUI_O_CRON_SECRET pelo mesmo valor da variável
-- CRON_SECRET da Vercel (Settings → Environment Variables). Digite o valor
-- só no editor; não salve a consulta com ele.
--
--   select vault.create_secret(
--     'COLE_AQUI_O_CRON_SECRET',
--     'cron_secret_intimacoes',
--     'CRON_SECRET da Vercel, usado pela busca de intimações'
--   );
--
-- Para trocar o valor depois (se mudar o CRON_SECRET na Vercel):
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'cron_secret_intimacoes'),
--     'COLE_AQUI_O_NOVO_VALOR'
--   );
--
-- ---------------------------------------------------------------------------
-- PASSO 2: rodar este arquivo inteiro
-- ---------------------------------------------------------------------------
-- Ele liga as extensões, confere se o segredo está no Vault e agenda a
-- chamada de GET https://chatbot-braz.vercel.app/api/cron/intimacoes com o
-- cabeçalho "Authorization: Bearer <CRON_SECRET>".
--
-- Horário: de hora em hora, das 6h às 22h de Brasília (17 vezes por dia).
-- O pg_cron do Supabase usa o horário UTC, que é 3 horas a mais que
-- Brasília (o Brasil não tem horário de verão desde 2019):
--   6h de Brasília = 9h UTC ... 20h = 23h UTC, 21h = 0h UTC, 22h = 1h UTC.
-- Por isso a expressão é '0 0,1,9-23 * * *' (minuto 0 das horas 0, 1 e 9
-- a 23 em UTC).
--
-- ---------------------------------------------------------------------------
-- Conferir se está rodando
-- ---------------------------------------------------------------------------
--   select jobid, jobname, schedule, active from cron.job;
--   select status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
--   -- Resposta da Vercel (200 = ok, 401 = segredo errado):
--   select status_code, left(content, 300) as resposta, created
--     from net._http_response order by created desc limit 10;
-- E no CRM: página Saúde das automações (/automacoes), cartão "Intimações".
--
-- ---------------------------------------------------------------------------
-- Pausar ou desligar
-- ---------------------------------------------------------------------------
--   Pausar (mantém o agendamento, só para de chamar):
--     select cron.alter_job(
--       (select jobid from cron.job where jobname = 'intimacoes-djen'),
--       active := false
--     );
--   Voltar: o mesmo comando com active := true.
--   Desligar de vez: select cron.unschedule('intimacoes-djen');
--   (Para religar, rode este arquivo de novo.)
-- ============================================================================

-- Extensões (no Supabase: Database → Extensions mostra as duas ligadas).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- O segredo precisa estar no Vault (passo 1).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret_intimacoes') then
    raise exception 'Falta guardar o CRON_SECRET no Vault. Faça o passo 1 do cabeçalho deste arquivo e rode de novo.';
  end if;
end;
$$;

-- Recria o agendamento (sem duplicar).
select cron.unschedule(jobid) from cron.job where jobname = 'intimacoes-djen';

select cron.schedule(
  'intimacoes-djen',
  '0 0,1,9-23 * * *',
  $job$
  select net.http_get(
    url := 'https://chatbot-braz.vercel.app/api/cron/intimacoes',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_intimacoes')
    ),
    timeout_milliseconds := 300000
  );
  $job$
);

-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------
select jobid, jobname, schedule, active
from cron.job
where jobname = 'intimacoes-djen';
