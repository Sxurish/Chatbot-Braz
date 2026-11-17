# Saúde das automações (fase 5)

A página **Saúde das automações** (`/automacoes`, só Admin) mostra se as
rotinas automáticas do CRM estão rodando e se as conexões com os serviços de
fora estão certas. Quem não é Admin vê o aviso "Acesso restrito". Todos os
horários são de Brasília.

## Antes de usar

Rode `supabase/fase5-automacoes.sql` no SQL Editor do Supabase (depois da
fase 4). Ele cria a tabela `automation_runs`, onde cada rotina grava cada
execução. Só o Admin lê essa tabela; quem grava é o servidor. Execuções com
mais de 90 dias são apagadas sozinhas.

## O que a página mostra

### Cartões das rotinas

| Rotina | Quando roda | O que faz |
| --- | --- | --- |
| Andamentos dos tribunais | Todo dia às 6h | Busca no DataJud os andamentos novos dos processos com número CNJ |
| Resumo diário | Dias úteis às 9h | Monta e manda o resumo do dia pelo WhatsApp |
| Intimações | De hora em hora | Lê as intimações e cria os prazos (quando for ativada) |

Cada cartão traz:

- **Status** da última execução:
  - **Funcionou**: terminou sem erro.
  - **Falhou**: deu erro (o motivo aparece em "Últimos erros").
  - **Rodando**: começou há menos de 15 minutos e ainda não terminou.
  - **Interrompida**: começou há mais de 15 minutos e nunca terminou (a
    função passou do tempo limite ou caiu no meio).
  - **Ainda não ativada**: a rotina nunca rodou (ou ainda não existe).
- **Última execução**, **duração** e **resumo** (ex.: "12 processos
  consultados, 3 andamentos novos").
- **Falhou N vezes seguidas**, quando for o caso.
- **Últimos erros**: as 3 falhas mais recentes, com data e motivo.

Quando conta como falha:

- **Andamentos**: a rotina deu erro, ou **todas** as consultas ao DataJud
  falharam. Se só alguns processos falharam, conta como "funcionou" e o
  número de falhas aparece no resumo.
- **Resumo**: a rotina deu erro, ou **ninguém** recebeu o resumo (todos com
  erro de WhatsApp ou de gravação). Pessoa sem número cadastrado não é falha.

### Últimas 20 execuções

Lista de todas as rotinas juntas, da mais nova para a mais antiga, com
início, rotina, status, duração e resumo (ou o erro). "(manual)" indica que
alguém mandou rodar fora do horário.

### Diagnóstico

- **Variáveis de ambiente**: cada variável da Vercel aparece como
  **Configurada**, **Faltando** ou **Usando o padrão**, com para que serve e
  o que acontece se faltar. **O valor nunca aparece** (nem um pedaço), exceto
  `AI_PROVIDER`, que não é segredo.
- **Testar conexões**: testa, em até 8 segundos cada, o banco (Supabase), as
  tabelas das fases, a IA (Anthropic), o WhatsApp (Meta) e o DataJud.

## Alerta de falha

Quando a mesma rotina falha **2 vezes seguidas**:

1. Cada Admin ativo recebe uma notificação no CRM (sino de **Notificações**),
   com link para esta página.
2. Se o modelo `alerta_automacao` estiver aprovado na Meta e
   `WHATSAPP_ALERT_TEMPLATE` preenchido, os Admins com número de WhatsApp na
   Equipe recebem também a mensagem (passo a passo do modelo em
   [RESUMO-E-WHATSAPP.md](RESUMO-E-WHATSAPP.md)).

Não repete a cada falha: na 3ª, 4ª... fica quieto. Se a rotina voltar a
funcionar e depois falhar 2 vezes de novo, avisa de novo.

## O que fazer em cada erro

| Aparece | O que fazer |
| --- | --- |
| "Falta a tabela de execuções" | Rode `supabase/fase5-automacoes.sql` no SQL Editor |
| "Falta a tabela X: rode Y" (Testar conexões) | Rode o arquivo SQL indicado, na ordem das fases |
| Rotina "Ainda não ativada" há mais de um dia | Confira `CRON_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` na Vercel e se o deploy tem o `vercel.json` com os horários. Na Vercel, veja **Settings → Cron Jobs** |
| "Falta SUPABASE_SERVICE_ROLE_KEY" | Copie a chave *service_role* em Supabase → Project Settings → API e coloque na Vercel. Faça novo deploy |
| "O Supabase recusou a chave" | A chave foi trocada ou copiada errada. Copie de novo |
| "O Supabase não respondeu" | Veja se o projeto do Supabase está pausado (plano gratuito pausa por falta de uso) |
| "Todas as N consultas ao DataJud falharam" / "DataJud instável, tente mais tarde" | O DataJud oscila. Espere a próxima execução. Se durar mais de um dia, teste de novo aqui |
| "O DataJud recusou a chave de acesso" | O CNJ trocou a chave pública. Pegue a nova em datajud-wiki.cnj.jus.br/api-publica/acesso e coloque em `DATAJUD_API_KEY` |
| "A Anthropic recusou a chave" | Gere uma nova chave no painel da Anthropic e troque `ANTHROPIC_API_KEY` |
| "Limite de uso da Anthropic" / "instável" | Espere alguns minutos. Se repetir, confira o faturamento da conta |
| "O token do WhatsApp expirou ou é inválido" | Gere um token novo (de preferência de **usuário do sistema**, que não expira) e troque `WHATSAPP_ACCESS_TOKEN` |
| "A Meta não achou este número" | `WHATSAPP_PHONE_NUMBER_ID` é o **ID** do número (no WhatsApp Manager), não o telefone |
| "O modelo X não existe ou ainda não foi aprovado" (resumo ou alerta) | Confira o nome e o idioma do modelo na Meta e espere a aprovação |
| Status "Interrompida" | A rotina passou do tempo limite. Se repetir, há processos demais de uma vez: a próxima execução continua de onde parou |

Depois de mudar uma variável na Vercel, faça um **novo deploy** e clique em
**Testar conexões** de novo.

## Arquivos

| Peça | Arquivo |
| --- | --- |
| Tabela e RLS | `supabase/fase5-automacoes.sql` |
| Registro das execuções (`recordRun`) | `src/lib/automation/runs.ts` |
| Alerta na 2ª falha seguida | `src/lib/automation/alert.ts` |
| Variáveis e testes de conexão | `src/lib/automation/diagnostics.ts` |
| Rotinas e horários | `src/lib/automation/jobs.ts`, `vercel.json` |
| Página | `src/app/(crm)/automacoes/*`, `src/lib/data/automation-runs.ts`, `src/lib/automation/format.ts` |
| Testes | `tests/automation.test.ts` |
