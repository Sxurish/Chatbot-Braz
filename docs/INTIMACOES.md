# Intimações do DJEN (fase 5, parte B)

O CRM busca sozinho, de hora em hora, as intimações do Dr. Jean Braz
(OAB 459159/SP) no DJEN, o Diário de Justiça Eletrônico Nacional (API
Comunica PJe do CNJ). Cada intimação entra **para conferir**. A IA lê e sugere
o prazo, mas **nada vira prazo sem a conferência do advogado**.

Cada parte tem a sua seção abaixo: Captura, Agendamento, Leitura pela IA,
WhatsApp e Conferência.

## Captura

Rotina: `GET /api/cron/intimacoes` (arquivos `src/app/api/cron/intimacoes/route.ts`,
`src/lib/intimacoes/run.ts` e `src/lib/intimacoes/capture.ts`). Só roda com o
cabeçalho `Authorization: Bearer <CRON_SECRET>`.

Em cada execução, nesta ordem:

1. **Captura no DJEN** (detalhes abaixo).
2. **Leitura pela IA** das intimações pendentes.
3. **Aviso pelo WhatsApp** das intimações novas.

As etapas são separadas: se a IA ou o WhatsApp falharem, a captura continua
valendo, e o erro aparece no resumo da execução. Se o DJEN estiver fora do ar,
a IA e o aviso rodam mesmo assim (para as pendentes de antes).

### Como a captura funciona

- **Período buscado**: do último dia em que a busca deu certo, menos 1 dia
  (o DJEN às vezes publica com atraso), até hoje (horário de Brasília). Na
  primeira vez, os últimos 30 dias.
- **Só avança a data quando a busca inteira deu certo.** Se o DJEN falhar no
  meio, o que já foi lido é gravado, mas a data fica onde estava: a próxima
  execução busca o mesmo período de novo. Se a busca bater no limite de
  segurança (20 páginas de 100), também não avança e fica um aviso.
- **Só a OAB do escritório**: a busca já é pela OAB 459159/SP, e o CRM confere
  de novo se a comunicação cita a OAB (na lista de advogados do DJEN ou no
  texto, como "JEAN CARLOS BRAZ DE JESUS (OAB 459159/SP)"). As que não citam
  são ignoradas e só contadas no resumo ("outra_oab").
- **Sem duplicar**: cada intimação tem uma chave estável (o id do DJEN; sem
  id, o hash do DJEN; sem os dois, um resumo do texto). A gravação usa
  "insert ... on conflict do nothing" nessa chave.
- **Cancelada pelo tribunal**: se uma intimação já gravada aparecer cancelada
  no DJEN e ainda estiver **para conferir**, o CRM marca como cancelada (com o
  motivo). Intimação já confirmada ou descartada não muda.
- **Vínculo com o processo**: compara só os dígitos do número CNJ com o
  número dos processos do CRM. Se não achar, tenta os outros números citados
  no texto (ex.: "processo principal ..."). Número que bate com dois ou mais
  processos fica sem vínculo (a equipe escolhe na conferência). Se o processo
  for cadastrado depois, a próxima busca que trouxer a intimação faz o vínculo.
- **Data de publicação**: 1º dia útil seguinte à disponibilização, pela mesma
  conta da calculadora de prazos (`docs/PRAZOS.md`), com o calendário forense
  cadastrado.

### Resumo da execução

Fica em **Saúde das automações** (`/automacoes`), cartão "Intimações". Campos:

| Campo | O que é |
| --- | --- |
| `janela` | Período buscado no DJEN |
| `buscadas` | Comunicações lidas do DJEN |
| `novas` / `repetidas` | Gravadas agora / já estavam gravadas |
| `vinculadas` | Ligadas a um processo do CRM |
| `canceladas` | Já gravadas que o tribunal cancelou |
| `outra_oab` | Ignoradas por não citarem a OAB do escritório |
| `rejeitadas` | Itens do DJEN em formato que não deu para ler |
| `truncada` / `data_avancou` | Bateu no limite de páginas? A data avançou? |
| `geobloqueio` | O DJEN recusou o acesso por estar fora do Brasil |
| `captura_erro` | Motivo da falha na captura |
| `ia_*` | Leitura pela IA (lidas, falhas, custo) ou `ia_erro` |
| `whatsapp_*` | Avisos enviados ou `whatsapp_erro` |

A execução conta como **falha** quando a captura no DJEN falha. Erro só na IA
ou no WhatsApp não é falha da rotina: aparece no resumo.

### Acesso de fora do Brasil

A API do DJEN só aceita acesso a partir do Brasil (fora daqui responde 403).
O CRM roda na região de São Paulo da Vercel (`gru1`, no `vercel.json`). Se
aparecer "O DJEN só aceita acesso a partir do Brasil", confira a região.

### Banco de dados

Arquivo `supabase/fase5-intimacoes.sql` (seguro rodar de novo):

- `court_publications`: as intimações. A equipe lê; quem não é Visualizador
  confere. Só o servidor grava intimações novas. Ninguém apaga. Depois de
  confirmada ou descartada, a intimação não volta para "para conferir", e o
  texto, as datas e a chave nunca mudam (o banco recusa).
- `publication_sync_state`: até que dia a busca deu certo, a última execução
  e o último erro. Só o Admin lê.
- `process_movements` passa a aceitar andamentos de origem `djen` (criados na
  confirmação), que nascem travados.

## Agendamento

A Vercel no plano gratuito só roda cron uma vez por dia. Por isso:

- **De hora em hora, das 6h às 22h de Brasília**: o próprio Supabase chama a
  rotina, com as extensões `pg_cron` (agenda) e `pg_net` (chamada HTTP).
  Arquivo `supabase/fase5-intimacoes-agendamento.sql`.
- **Reserva diária**: a Vercel Cron chama a mesma rota uma vez por dia
  (`vercel.json`).

### Como ligar (uma vez)

1. Rode `supabase/fase5-intimacoes.sql`.
2. No SQL Editor do Supabase, guarde o `CRON_SECRET` no Vault (o mesmo valor
   da variável `CRON_SECRET` da Vercel). Rode sozinho, digitando o valor:

   ```sql
   select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'cron_secret_intimacoes',
     'CRON_SECRET da Vercel, usado pela busca de intimações');
   ```

   O segredo nunca fica em arquivo do projeto.
3. Rode `supabase/fase5-intimacoes-agendamento.sql` inteiro.

O pg_cron usa o horário UTC (3 horas a mais que Brasília). A expressão
`0 0,1,9-23 * * *` quer dizer: no minuto 0 das 9h às 23h UTC (6h às 20h de
Brasília) e à 0h e 1h UTC (21h e 22h de Brasília).

### Conferir, pausar, desligar

- Agendamento: `select jobname, schedule, active from cron.job;`
- Últimas chamadas: `select status_code, created from net._http_response order by created desc limit 10;`
  (200 = ok; 401 = o segredo do Vault não bate com o da Vercel).
- No CRM: `/automacoes`, cartão "Intimações".
- **Pausar**: `select cron.alter_job((select jobid from cron.job where jobname = 'intimacoes-djen'), active := false);`
  (voltar: o mesmo com `active := true`).
- **Desligar**: `select cron.unschedule('intimacoes-djen');` (para religar,
  rode o arquivo de agendamento de novo).
- Trocou o `CRON_SECRET` na Vercel? Atualize o Vault:
  `select vault.update_secret((select id from vault.secrets where name = 'cron_secret_intimacoes'), 'NOVO_VALOR');`

### Testar fora da produção

O DJEN bloqueia acesso de fora do Brasil. Para testar em outro lugar, aponte
`DJEN_BASE_URL` para um servidor com respostas falsas (veja
`tests/intimacoes-capture.test.ts`).

## Conferência

Nada vira prazo sem a conferência do advogado. A conferência é feita na tela
**Intimações** (`/intimacoes`) ou com "OK" no WhatsApp (veja a seção WhatsApp).

### A lista

- No alto: quantas estão **para conferir**, quantas foram **confirmadas hoje**
  e quantas estão **sem processo vinculado** (clique para filtrar).
- Filtros na URL: `status` (para_conferir, confirmada, descartada, todas),
  `vinculo` (com ou sem processo no CRM), `de` e `ate` (data de
  disponibilização). Abre em "para conferir".
- Ordem: as para conferir primeiro, **da mais antiga para a mais nova** (a mais
  antiga é a que vence antes). Depois as já conferidas, das mais recentes.
- Cada linha mostra o selo da situação e o da IA (confiança alta, média ou
  baixa; ou "leitura pendente", "falhou", "sem leitura da IA").

### A página da intimação

- Texto completo em letra grande, com o trecho que a IA usou em destaque.
- Partes, advogados, órgão, classe, datas e o link para o site do tribunal.
- Leitura da IA: resumo, prazo sugerido, contagem, início, dobro, base legal.
  Campos em que a IA ficou em dúvida aparecem **em âmbar**, aqui e no
  formulário.
- Formulário de confirmação **já preenchido** com a sugestão (dias, contagem,
  início, dobro, título da tarefa, processo).
- **Conta ao vivo**: muda na hora, com os passos e os dias pulados (mesma conta
  da tela Prazos, com o calendário forense cadastrado e a comarca do processo).
- Se o advogado escolher contar da **ciência**, a conta usa a data da
  disponibilização como data da ciência (o DJEN não informa outra) e avisa.
- **Ajustar a data**: marque "a data final é outra", escolha a data e diga o
  motivo (obrigatório).
- **Descartar**: com motivo obrigatório. Nenhum prazo é criado.
- **Vincular processo**: escolha outro processo do CRM e clique em "Só vincular
  este processo" (ou confirme direto com ele escolhido).
- Perfil **visualizador** só lê: vê tudo e a conta, mas não confirma.
- Intimação **cancelada no DJEN** não pode ser confirmada: descarte com o motivo.

### O que acontece ao confirmar

Feito por `confirmPublication` (`src/lib/intimacoes/confirm.ts`), o mesmo para
a tela e para o WhatsApp:

1. Registro **"calculo"** no histórico de prazos (`deadline_calculations`),
   com `publication_id`.
2. Se a data foi ajustada: registro **"ajuste"** com o motivo, ligado ao
   anterior.
3. Tarefa **"Prazo: <título>"**, prioridade alta, pendente, vencendo às 23:59
   (São Paulo) da data final, para quem confirmou, no processo.
4. Registro **"confirmacao"** ligado ao último registro e à tarefa. Se este
   passo falhar, a tarefa é apagada (sem histórico, ela não vale).
5. Andamento no processo (origem DJEN, travado): "Intimação (DJEN): <ato> —
   prazo até DD/MM/AAAA", na data da disponibilização. Só quando há processo.
6. Próximo prazo do processo atualizado (padrão: sim, quando há processo).
7. Intimação marcada **confirmada**, com quem, quando e os vínculos (cálculo,
   tarefa, andamento). Se outra pessoa conferiu ao mesmo tempo, a tarefa desta
   tentativa é apagada e aparece "Esta intimação já foi conferida."
8. Auditoria (`audit_logs`, ação `confirm_publication`) com o canal (painel ou
   WhatsApp). Descarte: `discard_publication`; vínculo: `link_publication_process`.

O histórico de prazos só acrescenta: nada ali é alterado ou apagado.

### "OK" pelo WhatsApp

`defaultConfirmInput` monta a confirmação a partir da leitura da IA. Ele não
confirma (e manda abrir o painel) quando: a leitura não está pronta; a IA não
sugeriu dias e contagem; a intimação não pede providência; a confiança é baixa;
ou a IA ficou em dúvida em dias, contagem, início ou dobro.

### Modo demonstração

Sem o Supabase, a tela mostra 5 intimações fictícias (uma ligada ao processo,
uma sem processo no CRM, uma com dúvida da IA, uma confirmada e uma
descartada). A conta ao vivo funciona; confirmar, descartar e vincular não
gravam nada. Com o Supabase ligado, nunca aparecem dados fictícios.

## Leitura pela IA

Depois da captura, a rotina pede à IA que leia cada intimação nova e sugira o
prazo. É sempre uma **sugestão**: nada vira prazo sem a conferência do
advogado (tela ou "OK" no WhatsApp).

### Como funciona

- Arquivo: `src/lib/intimacoes/ai-read.ts` (`readPendingPublications`). As
  instruções, o formato da resposta e a validação ficam em
  `src/lib/intimacoes/ai-prompt.ts`.
- Mesmo provedor e mesma chave do assistente (`ANTHROPIC_API_KEY`). Usa o
  modelo de leitura de documentos do assistente (`ASSISTANT_DOC_MODEL`, em
  `src/lib/assistant/config.ts`), o mais preciso em números, datas e nomes.
- Lê no máximo **10 intimações por execução** (as mais antigas primeiro) e
  para depois de 150 segundos; o resto fica para a próxima hora.
- Texto com mais de 12 mil caracteres vai cortado: começo e fim ficam (a
  ordem do juiz costuma estar no fim). Texto cortado nunca dá confiança alta.
- Canceladas no DJEN e já conferidas não são lidas.

### O que a IA devolve

Resposta em JSON com formato fixo (saída estruturada da API), conferida com
Zod antes de gravar em `ai_reading`: tipo do ato, resumo, se pede providência,
dias e contagem sugeridos, de onde conta, dobro, título da tarefa, base legal,
o **trecho exato** que embasa o prazo (`quote`), campos em dúvida e confiança.

As instruções ensinam:

- o prazo fixado pelo juiz no texto vale mais que a regra geral;
- CPC: dias úteis (art. 219); contestação e réplica em 15 dias; recursos em
  15 dias (art. 1.003, § 5º); embargos de declaração em 5 dias (art. 1.023);
  ato sem prazo na lei nem do juiz, 5 dias (art. 218, § 3º);
- Juizado Especial (Lei 9.099/95): recurso inominado em 10 dias, embargos em
  5, contados em dias úteis desde a Lei 13.728/2018;
- dobro: Fazenda Pública, MP e Defensoria têm dobro para as **próprias**
  manifestações; isso não dá dobro ao advogado particular da outra parte; nos
  Juizados não há dobro; litisconsortes só em autos físicos;
- processo penal conta em dias corridos (marca "unidade" em dúvida);
- no DJEN o prazo conta da disponibilização (a conta da publicação e do início
  é do motor de prazos, não da IA);
- **em dúvida, marcar o campo em `uncertain` e baixar a confiança; nunca
  inventar**.

Travas depois da resposta (no código, não só nas instruções):

- trecho citado que não está no texto da intimação é descartado, o prazo fica
  com dúvida em "dias" e a confiança cai para média;
- dias sem contagem (ou o contrário) vira dúvida;
- dúvidas só com os nomes que a tela conhece (dias, unidade, inicio, dobro,
  processo).

### Situação da leitura (`ai_status`)

| Situação | Quando |
| --- | --- |
| `pendente` | Acabou de chegar; a próxima execução lê. |
| `pronta` | Lida; a sugestão está em `ai_reading`. |
| `falhou` | A IA não respondeu, recusou, ou respondeu fora do formato. O motivo curto fica em `ai_error`. Não tenta de novo sozinha: confira manualmente. |
| `desligada` | Sem `ANTHROPIC_API_KEY` ou com o limite de gasto do mês estourado. A conferência manual continua normal. Quando a IA volta, as desligadas capturadas nos últimos 7 dias são lidas de novo. |

### Gasto

- Cada leitura grava `ai_model`, `ai_cost_usd`, `ai_input_tokens` e
  `ai_output_tokens` na própria intimação (colunas em
  `supabase/fase5-intimacoes.sql`).
- O custo entra no **mesmo limite mensal do assistente** (Configurações →
  Assistente): o gasto mostrado lá soma as conversas e as leituras de
  intimações (`src/lib/intimacoes/ai-cost.ts`).
- A leitura usa a mesma regra da leitura de documentos do assistente: a
  partir de 100% do limite ela pausa (fica `desligada`). Uma leitura típica
  custa cerca de 1 a 3 centavos de dólar.
- O total gasto em cada execução aparece em Saúde das automações
  (`ia_custo_usd`).

## WhatsApp

### Aviso de intimação nova

Arquivo: `src/lib/intimacoes/notify.ts` (`notifyNewPublications`), chamado
pela rotina logo depois da leitura pela IA.

- **Uma mensagem por intimação**, com o modelo aprovado da Meta
  (`WHATSAPP_INTIMACAO_TEMPLATE`, texto em
  [RESUMO-E-WHATSAPP.md](RESUMO-E-WHATSAPP.md)): processo, resumo, prazo
  sugerido, data final calculada (mesma conta da tela e da confirmação) e o
  link da intimação no painel. Não agrupa: o modelo da Meta não aceita quebra
  de linha nas variáveis, e uma mensagem por intimação deixa claro o que o
  "OK" confirma.
- **Quem recebe**: uma pessoa por intimação, ativa, com papel Admin ou
  Advogado e WhatsApp cadastrado na Equipe. Vai para quem tem o nome igual
  (primeiro e último nome) a um dos advogados intimados; se ninguém bater,
  para o Admin mais antigo. Na prática, o Dr. Jean. Fica gravado em
  `whatsapp_notified_to` (e a hora em `whatsapp_notified_at`).
- Avisa as intimações para conferir, não canceladas, capturadas há até 3 dias
  e já passadas pela IA (lida, falhou ou sem leitura; nas duas últimas a
  mensagem diz "sem leitura da IA, confira no painel"). As que esperam a
  leitura são avisadas na próxima hora. No máximo 10 por execução.
- Sem `WHATSAPP_INTIMACAO_TEMPLATE` (não há nome padrão), sem as credenciais
  do WhatsApp, ou sem ninguém para receber: não manda e conta como "pulada".
  Falha da Meta: conta como erro e tenta de novo na próxima hora.

### "OK" para confirmar

Arquivo: `src/lib/intimacoes/whatsapp-ok.ts`, ligado em
`src/lib/assistant/whatsapp.ts`.

- **Rascunho do assistente tem prioridade.** Se a pessoa tem um cadastro do
  assistente esperando o "OK" (até 2 horas), o "OK" grava o rascunho, como
  antes.
- Sem rascunho, e com intimação avisada a essa pessoa ainda para conferir:
  - **uma** esperando: "OK" confirma;
  - **várias**: "OK" sozinho não confirma nada; a resposta traz a lista
    numerada (da mais antiga avisada para a mais nova) e pede **"OK 1"**,
    **"OK 2"**... ou **"OK todas"**. Depois de cada confirmação, a resposta
    traz a lista do que falta, já renumerada: vale sempre a última lista
    mandada;
  - "OK 2", "ok #2", "confirmo 2", "OK todas" e "pode confirmar todas" são
    entendidos.
- "OK" sozinho que responde a outra coisa não confirma intimação: se o resumo
  diário ou uma resposta do assistente chegou **depois** do aviso, o "OK"
  segue o caminho de antes (resumo ou assistente). "OK 1" e "OK todas" são
  explícitos e sempre valem.
- Só confirma o que a pessoa viu: a leitura da IA tem de ser anterior ao aviso
  e `defaultConfirmInput` não pode ser nulo (sugestão segura: dias e
  contagem, sem dúvida nesses campos, confiança média ou alta). Senão a
  resposta explica e manda o link da intimação no painel.
- Quem confirma é a pessoa do número (users.id), com canal `whatsapp` na
  auditoria. A resposta traz a data final e o link.
- Visualizador nunca confirma (a resposta explica).
- Funciona mesmo com a IA desligada ou sem verba: só grava a sugestão já
  recebida.

### Resumo diário

O resumo das 9h ganhou a parte **Intimações para conferir**: a quantidade e as
3 mais antigas (por disponibilização), com link. Ela vai na linha do modelo
(`{{2}}`, ex.: "2 intimações para conferir · 3 prazos..."), no resumo completo
pelo WhatsApp e no cartão do Dashboard. Sem nenhuma para conferir, não
aparece.
