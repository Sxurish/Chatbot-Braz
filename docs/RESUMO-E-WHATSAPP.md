# Resumo diário e assistente pelo WhatsApp (fase 4)

## Resumo diário

Todo dia útil, às 9h (Brasília), sai um resumo do CRM. Ele fica no painel
(Dashboard, cartão **Resumo do dia**) e vai por WhatsApp para quem estiver
marcado na Equipe (no início, só o Dr. Jean).

### O que tem no resumo

| Parte | O que entra | Link no CRM |
| --- | --- | --- |
| **Prazos (7 dias)** | Próximo prazo dos processos, tarefas em aberto com vencimento e compromissos da agenda (agendados ou remarcados) de hoje até daqui a 7 dias. Diz quantos são **hoje** e **amanhã**. Prazos de processo **já vencidos** aparecem primeiro, em vermelho | `/processos/{id}`, `/tarefas`, `/agenda` |
| **Leads novos** | Leads que chegaram desde o dia útil anterior às 9h (na segunda, cobre o fim de semana desde sexta às 9h) | `/leads/{id}` |
| **Leads urgentes** | Leads de urgência alta ainda em aberto (sem contrato assinado, não perdidos, não descartados) | `/leads/{id}` |
| **Andamentos novos** | Andamentos que chegaram ao CRM desde o mesmo horário, agrupados por processo. Não entram os ocultos nem o histórico antigo trazido na primeira busca de um processo | `/processos/{id}` |
| **Tarefas atrasadas** | Tarefas não concluídas (nem canceladas) com vencimento antes de hoje | `/tarefas` |
| **Financeiro** (só Admin, só no painel) | Valores a receber nos próximos 7 dias e pagamentos em atraso | `/financeiro` |

- No painel, o resumo é calculado **na hora** para quem está logado, com o
  login dessa pessoa. O financeiro só aparece para quem é Admin.
- **Os valores financeiros nunca vão pelo WhatsApp**, nem para o Admin. O
  resumo gravado do Admin guarda o financeiro só para o painel.
- As datas seguem o fuso de São Paulo.
- O prazo oficial continua sendo o da intimação e o do sistema do tribunal.

### Horário

- Definido em `vercel.json`: `/api/cron/resumo`, `0 12 * * 1-5` (12h UTC =
  9h de Brasília, de segunda a sexta). Para mudar o horário, altere essa linha
  e faça um novo deploy.
- Feriados não são pulados (só fins de semana).
- A rotina não reenvia: se o resumo do dia já foi entregue para alguém,
  rodar de novo não manda outra mensagem.

### Quem recebe

- Quem está **ativo** e com **"Recebe o resumo diário"** marcado na tela
  **Equipe** (só o Admin altera). Para ir pelo WhatsApp, a pessoa precisa ter
  o **número de WhatsApp** cadastrado lá (com DDI, ex.: 55 11 98888-7777).
- Sem número, o resumo é gravado mesmo assim e fica só no painel.
- Em **Configurações → Resumo diário e WhatsApp** (só Admin) aparecem o
  horário, quem recebe (números mascarados), o modelo a aprovar e se o
  WhatsApp e o `CRON_SECRET` estão configurados.

### Modelo de mensagem na Meta (passo a passo)

Fora da conversa das últimas 24 horas, o WhatsApp só entrega **modelos
aprovados** pela Meta. O resumo das 9h usa um modelo; a resposta com os
detalhes (quando a pessoa responde a mensagem) vai como texto normal.

1. Entre no **Meta Business Manager** (business.facebook.com) com a conta
   do escritório e abra **WhatsApp Manager**.
2. Vá em **Gerenciamento de conta → Modelos de mensagem** e clique em
   **Criar modelo**.
3. Categoria: **Utilidade (Utility)**. Tipo: **Padrão / Default**.
4. Nome: `resumo_diario` (ou outro, e então preencha
   `WHATSAPP_DIGEST_TEMPLATE` com o mesmo nome).
5. Idioma: **Português (BR)** (`pt_BR`).
6. Corpo, exatamente:

   ```
   Bom dia, {{1}}! Resumo do CRM de hoje: {{2}}. Responda esta mensagem para ver os detalhes.
   ```

7. Exemplos das variáveis (a Meta pede):
   - `{{1}}`: `Jean`
   - `{{2}}`: `3 prazos nos próximos 7 dias (1 amanhã) · 2 leads urgentes · 4 andamentos novos · 1 tarefa atrasada`
8. Sem cabeçalho, rodapé ou botões. Envie para análise. A aprovação costuma
   sair em minutos, mas pode levar até 24 horas.
9. Confira na Vercel as variáveis abaixo e faça um novo deploy se mudou
   alguma.

O `{{1}}` recebe o primeiro nome (sem "Dr."), e o `{{2}}` uma linha curta,
sem quebras, com menos de 900 caracteres e sem valores financeiros.

### Variáveis de ambiente (Vercel)

| Variável | Para quê |
| --- | --- |
| `CRON_SECRET` | Já usada nos andamentos. Sem ela a rotina não roda |
| `SUPABASE_SERVICE_ROLE_KEY` | A rotina grava os resumos com a chave de serviço |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | As mesmas do canal de WhatsApp. Sem elas o resumo é gravado, com o aviso "WhatsApp ainda não configurado" |
| `WHATSAPP_DIGEST_TEMPLATE` | Nome do modelo aprovado (padrão `resumo_diario`) |
| `WHATSAPP_DIGEST_TEMPLATE_LANG` | Idioma do modelo (padrão `pt_BR`) |
| `NEXT_PUBLIC_APP_URL` | Endereço do CRM, usado nos links do resumo completo pelo WhatsApp |

### Banco de dados

Rode `supabase/assistente-fase4.sql` no SQL Editor (depois da fase 3). Ele
cria:

- Em `users`: `whatsapp_number` (só dígitos, com DDI, um por pessoa) e
  `daily_digest` (recebe o resumo).
- A tabela `daily_digests` (`digest_date`, `user_id`, `content` com o resumo
  completo, `summary_line` que foi no WhatsApp, `whatsapp_sent_at` e
  `whatsapp_error`), uma linha por pessoa por dia. Cada pessoa vê só os
  próprios resumos e o Admin vê todos; quem grava é a rotina, no servidor.

### Conferir se funcionou

- Na tabela `daily_digests`: `whatsapp_sent_at` preenchido = entregue à Meta.
  `whatsapp_error` explica o que faltou (ex.: modelo ainda não aprovado,
  token expirado, pessoa sem número).
- O cartão **Resumo do dia** mostra "Enviado hoje pelo WhatsApp às 9h0x" ou o
  aviso de erro do envio de hoje.
- Para testar fora do horário (com o `CRON_SECRET`):
  `curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/resumo`
  (em fim de semana a rotina não envia).

### Arquivos

| Peça | Arquivo |
| --- | --- |
| Montagem do resumo, linha curta e texto completo para WhatsApp | `src/lib/digest/build.ts` |
| Datas em São Paulo e próximo envio | `src/lib/digest/dates.ts` |
| Envio pelo modelo aprovado (Graph API) | `src/lib/digest/whatsapp-template.ts` |
| Rotina (gravar e enviar) | `src/lib/digest/run.ts`, `src/app/api/cron/resumo/route.ts`, `vercel.json` |
| Cartão do painel | `src/lib/digest/live.ts`, `src/components/dashboard/daily-digest-card.tsx` |
| Bloco em Configurações | `src/app/(crm)/configuracoes/digest-settings.tsx`, `src/lib/digest/recipients.ts` |
| Testes | `tests/digest.test.ts` |

## Alerta de rotina com falha (modelo `alerta_automacao`, fase 5)

Quando uma rotina automática (andamentos, resumo, intimações) falha **2 vezes
seguidas**, o CRM cria uma notificação para cada Admin ativo e, se o modelo
abaixo estiver aprovado e configurado, manda também um WhatsApp para os
Admins com número cadastrado na Equipe. Só avisa na 2ª falha seguida (não a
cada falha). Se a rotina voltar a funcionar e falhar 2 vezes de novo, avisa de
novo. Detalhes em [AUTOMACOES.md](AUTOMACOES.md).

### Modelo de mensagem na Meta (passo a passo)

1. No **WhatsApp Manager**, vá em **Gerenciamento de conta → Modelos de
   mensagem** e clique em **Criar modelo**.
2. Categoria: **Utilidade (Utility)**. Tipo: **Padrão / Default**.
3. Nome: `alerta_automacao` (ou outro nome; use o mesmo em
   `WHATSAPP_ALERT_TEMPLATE`).
4. Idioma: **Português (BR)** (`pt_BR`).
5. Corpo, exatamente:

   ```
   Atenção: a rotina {{1}} do CRM falhou {{2}} vezes seguidas. Último erro: {{3}}. Veja em Saúde das automações.
   ```

6. Exemplos das variáveis (a Meta pede):
   - `{{1}}`: `Andamentos dos tribunais`
   - `{{2}}`: `2`
   - `{{3}}`: `O DataJud demorou demais para responder.`
7. Sem cabeçalho, rodapé ou botões. Envie para análise.
8. **Depois de aprovado**, preencha na Vercel `WHATSAPP_ALERT_TEMPLATE=alerta_automacao`
   e faça um novo deploy.

- Sem `WHATSAPP_ALERT_TEMPLATE` (ou sem `WHATSAPP_ACCESS_TOKEN` e
  `WHATSAPP_PHONE_NUMBER_ID`), o alerta fica só nas **Notificações** do CRM.
- O resultado do envio (quantos foram, erros da Meta) fica gravado na
  execução que gerou o alerta, visível em **Saúde das automações**.

## Assistente pelo WhatsApp

O Dr. Jean (e quem mais o Admin autorizar) consulta o CRM pelo WhatsApp,
mandando mensagem para o número do escritório. O sistema reconhece o número
cadastrado na Equipe e responde como **assistente da equipe**, não como
triagem de cliente. O código já está pronto e passa a funcionar quando a
integração com a Meta estiver configurada (variáveis abaixo).

### Como autorizar um número

1. Entre como **Admin** e abra **Equipe**.
2. Na linha da pessoa, clique em **WhatsApp**.
3. Digite o número **com DDI e DDD** (ex.: `+55 11 98888-7777`). Pode usar
   espaços, parênteses e traços: o CRM guarda só os dígitos.
4. Marque **Recebe o resumo diário**, se for o caso, e clique em **Salvar**.

- O Admin pode cadastrar o próprio número (é assim que o Dr. Jean se
  autoriza).
- Um número só pode estar em uma pessoa. O celular com e sem o nono dígito
  conta como o mesmo número (a Meta às vezes manda `55 11 8888-7777` em vez de
  `55 11 98888-7777`).
- A lista mostra o número mascarado (`+55 11 9••••-7777`). Para tirar o
  acesso, apague o número e salve. Desativar a pessoa também corta o acesso
  pelo WhatsApp na hora.
- Só o Admin vê e altera esses campos, sempre pelo servidor. Cada mudança vai
  para o log de auditoria (só com os 4 últimos dígitos).

### O que funciona

- **Consultas**, iguais às do painel: leads, clientes, casos, processos,
  andamentos, prazos, tarefas, agenda, follow-ups, equipe. Ex.: "Prazos desta
  semana", "O que mudou nos processos do Carlos Silva?", "Minhas tarefas de
  amanhã".
- **Cadastros com confirmação**: processo, lead, tarefa, prazo, compromisso e
  andamento. Ex.: "Cadastra uma tarefa para ligar para a Ana amanhã às 9h".
- As respostas vêm curtas, em texto do WhatsApp (negrito com `*`), e os links
  vêm completos (`https://.../processos/...`), abrindo o CRM com login.
- **Resposta ao resumo diário**: depois do resumo das 9h, responder
  "detalhes" (ou "ok"/"sim" como primeira mensagem depois do resumo) traz o
  resumo completo do dia, sem valores financeiros.
- Uma conversa contínua por pessoa: mensagens com menos de 12 horas de
  intervalo continuam a mesma conversa (o assistente lembra do contexto);
  depois disso começa outra. Essas conversas não aparecem no histórico do
  painel e seguem a mesma retenção de 90 dias.

### Cadastro: o assistente manda o resumo e espera "OK"

1. A pessoa pede o cadastro. O assistente procura o que já existe, prepara o
   **rascunho** e responde com o resumo: tipo, campos preenchidos, campos
   incertos marcados **(conferir)** e aviso de **possível duplicado** com o
   link.
2. A mensagem termina com: *Responda OK para gravar ou CANCELAR para
   descartar.*
3. Respostas:
   - **OK** (também "sim", "confirmo", "pode gravar"): grava todos os
     rascunhos pendentes da conversa, na ordem, e responde com o link de cada
     registro criado. Se algum falhar na validação (ex.: falta a data), ele
     não é gravado e o motivo vem na resposta.
   - **CANCELAR** (também "não", "descartar"): descarta os rascunhos. Nada é
     gravado.
   - Qualquer outra coisa é tratada como mensagem normal. "ok, mas muda a
     data" **não** confirma: o assistente prepara um rascunho novo já
     corrigido, e os rascunhos pendentes anteriores dessa conversa são
     **descartados automaticamente** (a resposta avisa). Para corrigir, basta
     dizer o que mudar.
4. O "OK" vale por **2 horas**. Rascunho mais antigo que isso é descartado;
   peça de novo.
5. Quem é **Visualizador** só consulta: o assistente não prepara cadastros.

Assim como no painel, nada é gravado sem o "OK", os dados são validados de
novo no servidor, cada rascunho só pode ser confirmado uma vez e cada
confirmação vai para o log de auditoria com quem confirmou.

### Financeiro nunca vai pelo WhatsApp

Nenhuma ferramenta financeira (pagamentos, contratos, resumo financeiro,
situação financeira do lead) é oferecida pelo WhatsApp, **nem para o
Admin**. Se pedirem, o assistente explica que o financeiro só aparece no CRM,
com login. O aviso de limite de gasto da IA também vai sem valores.

### Arquivos ainda não

Fotos, PDFs e áudios mandados pelo WhatsApp não são lidos nesta fase: o
assistente responde pedindo para enviar pela página **Assistente** do CRM.
Mensagens de mídia de clientes continuam ignoradas pela triagem, como antes.

### Segurança: como a identidade funciona

- Só números cadastrados na Equipe, de pessoas **ativas**, chegam ao
  assistente. Qualquer outro número segue para a triagem de clientes, sem
  mudança. Se a busca do número falhar, a mensagem também vai para a triagem
  (o caminho sem acesso ao CRM).
- No WhatsApp não há login nem cookie: a pessoa é reconhecida pelo número e
  as consultas rodam no servidor com a chave de serviço do Supabase
  (`SUPABASE_SERVICE_ROLE_KEY`). **Troca**: com essa chave as regras de RLS
  do banco não filtram. O código compensa:
  - nenhuma ferramenta financeira no WhatsApp, para ninguém;
  - conversas, mensagens e rascunhos do assistente sempre filtrados e
    gravados com o id da pessoa, explicitamente;
  - o autor do andamento manual e o log de auditoria são preenchidos com o id
    da pessoa (o banco não tem o login para isso);
  - Visualizador não recebe ferramentas de cadastro;
  - o resto do CRM (leads, processos, tarefas...) já é aberto a toda a equipe
    pelas regras do banco, então o assistente não passa do acesso que a
    pessoa tem no painel.
- Quem tem o celular cadastrado em mãos fala com o assistente como aquela
  pessoa. Se um celular for perdido, apague o número na Equipe (ou desative a
  pessoa).
- Mensagens repetidas pela Meta são ignoradas (mesma trava da triagem), e há
  limite de 10 mensagens por minuto por número.
- O assistente obedece ao mesmo liga/desliga e ao mesmo limite de gasto do
  painel (Configurações → Assistente virtual). Cada resposta grava tokens e
  custo, somados ao gasto do mês.

### Configuração na Meta

As variáveis já estão no `.env.example` e são as mesmas da triagem pelo
WhatsApp ([INTEGRACAO-CANAIS.md](INTEGRACAO-CANAIS.md)):

| Variável | Para quê |
| --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | Verificação do webhook (`/api/webhooks/whatsapp`) |
| `WHATSAPP_APP_SECRET` | Confere a assinatura das mensagens da Meta. **Obrigatória para o assistente**: sem ela a assinatura não é conferida, então o sistema não leva nenhuma mensagem ao assistente (todas vão para a triagem de clientes), para ninguém forjar uma mensagem com o número do Dr. Jean |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Envio das respostas |
| `SUPABASE_SERVICE_ROLE_KEY` | Reconhecer o número e consultar o CRM. Sem ela, todas as mensagens vão para a triagem |
| `ANTHROPIC_API_KEY` | A mesma do assistente do painel |
| `NEXT_PUBLIC_APP_URL` | Endereço do CRM nos links das respostas |

No app da Meta, o webhook do WhatsApp precisa estar inscrito no campo
`messages`. A resposta do assistente roda depois de o CRM responder 200 à
Meta e pode levar alguns segundos.

### Custo

- A IA custa o mesmo que no painel (uma pergunta comum custa frações de
  centavo de dólar), e entra no mesmo limite mensal.
- Na Meta, as respostas do assistente são mensagens de texto livre dentro da
  **janela de 24 horas** aberta pela mensagem da pessoa (conversa iniciada
  pelo usuário/serviço), que hoje não tem cobrança de modelo. O assistente só
  responde: nunca puxa conversa fora da janela. Mensagem fora da janela só
  com modelo aprovado (é o caso do resumo diário, acima).

### Arquivos do assistente pelo WhatsApp

| Peça | Arquivo |
| --- | --- |
| Roteamento (equipe → assistente, outros → triagem) | `src/lib/channels/whatsapp-dispatch.ts`, `src/app/api/webhooks/whatsapp/route.ts` |
| Resposta, "OK"/"CANCELAR", ferramentas sem financeiro | `src/lib/assistant/whatsapp.ts` |
| Markdown → WhatsApp, divisão em mensagens, resumo do rascunho | `src/lib/assistant/whatsapp-format.ts` |
| Identidade sem cookie (`runAsTeamMember`) | `src/lib/supabase/request-context.ts` |
| Número: validação, nono dígito, máscara | `src/lib/whatsapp-number.ts` |
| Tela Equipe | `src/app/(crm)/equipe/*`, `src/lib/auth/team-actions.ts` (`updateMemberWhatsappAction`), `src/lib/data/team-whatsapp.ts` |
| Testes | `tests/whatsapp-assistant.test.ts` |
