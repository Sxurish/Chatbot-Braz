# Assistente virtual da equipe — Fases 1 a 3 (consulta, cadastro e andamentos)

Assistente com IA dentro do CRM. Responde perguntas sobre leads, clientes,
casos, processos, prazos, tarefas, agenda e follow-ups, sempre consultando o
CRM e com link para o registro (fase 1). Desde a fase 2 também **prepara
cadastros**, inclusive a partir de um PDF ou print, mas **nada é gravado sem a
pessoa conferir e clicar em Confirmar**. Desde a fase 3 responde sobre os
andamentos dos processos e prepara o lançamento de andamento manual (a busca
nos tribunais está em [ANDAMENTOS.md](ANDAMENTOS.md)). Edição de registros
existentes pelo assistente não está no escopo.

## Como usar (guia para a equipe)

- **Botão "Assistente"** no canto inferior direito de qualquer tela, ou
  **Ctrl+K** (⌘K no Mac). Esc fecha.
- **Página /assistente** (menu lateral): a mesma conversa em tela cheia, com o
  histórico das conversas anteriores.
- O assistente sabe em que tela você está. Na ficha de um lead, peça
  "Resuma este lead".
- Exemplos:
  - "Quais leads urgentes chegaram esta semana?"
  - "Qual o próximo prazo do processo 1002345-67.2026.8.26.0554?"
  - "Minhas tarefas que vencem amanhã."
  - "Como está a agenda de quinta?"
  - Só Admin: "Quanto temos a receber este mês?"
- Os prazos mostrados são os cadastrados no CRM. O prazo oficial continua
  sendo o da intimação e o do sistema do tribunal.

### Cadastro com confirmação (fase 2)

- Peça em texto: "Cadastra uma tarefa para ligar para a Ana amanhã",
  "Novo lead: Carlos, 11 98888-7777, quer revisar contrato", "Marca audiência
  dia 3/12 às 14h no processo 1002345...".
- Ou **anexe um arquivo** (clipe 📎, arrastar e soltar, ou colar um print com
  Ctrl+V): intimação, petição, decisão, print de WhatsApp. Aceita PDF (até
  15 MB) e imagens PNG, JPG, WEBP e GIF (até 5 MB; fotos grandes são reduzidas
  antes de enviar). HEIC do iPhone: exporte como JPG.
- A resposta traz um **cartão** para cada cadastro: novo processo, novo lead,
  nova tarefa, prazo (tarefa de prioridade alta que também atualiza o
  "próximo prazo" do processo), novo compromisso ou anexar documento.
  - Campos em **amarelo, "(conferir)"**: a IA não teve certeza ou o valor veio
    fora do formato. Confira com atenção.
  - **"Pode já existir no CRM"**: processo com o mesmo número CNJ, pessoa com o
    mesmo telefone, e-mail ou nome, ou compromisso no mesmo horário.
  - Corrija o que precisar e clique em **Confirmar**. **Descartar** apaga o
    rascunho sem gravar nada. Depois de confirmado, "Abrir no CRM" leva ao
    registro criado.
  - O arquivo enviado pode ser anexado ao cadastro (vai para Documentos,
    com a categoria escolhida).
- Quem tem papel **Visualizador** só consulta: não recebe cartões.
- O texto dos documentos é tratado só como dado. Instruções escritas dentro
  de um PDF ou print nunca são seguidas.

### Andamentos (fase 3)

- Consultas:
  - "O que mudou nos processos do cliente Carlos Silva?" (andamentos dos
    últimos 7 dias, agrupados por processo; dá para pedir outro período, até
    60 dias, ou filtrar pelo caso).
  - "Andamentos do processo 1002345-67.2026.8.26.0554" (aceita o número com ou
    sem pontuação; na página do processo, "os andamentos deste processo").
- Cada andamento aparece com a data, a origem (**tribunal**, vindo do
  DataJud, ou **equipe**, lançado no CRM) e se está **travado** (lançado ou
  editado pela equipe: a busca automática nunca o altera). A resposta cita
  quando foi a última busca no DataJud e o aviso de falha, se houver.
- O DataJud costuma atrasar alguns dias e não traz processos em segredo de
  justiça. O assistente não busca no DataJud: para atualizar, clique em
  **Buscar agora** na página do processo (o assistente manda o link).
- Lançar andamento: "Registra que protocolamos a réplica hoje no processo
  1002345-67.2026.8.26.0554" ou "lança um andamento...". Vem o cartão
  **Registrar andamento** (processo, data e o que aconteceu), que só grava ao
  clicar em Confirmar. O andamento entra como "equipe" e travado. Avisa se já
  houver andamento parecido no mesmo processo e no mesmo dia.
- Com uma intimação anexada a um processo já cadastrado, o assistente pode
  preparar dois cartões: o prazo e o andamento.

## Regras de acesso

- O assistente consulta o banco **com o login de quem pergunta**, então as
  regras do Supabase (RLS) valem para ele também.
- **Financeiro só para Admin**: pagamentos e contratos ficam restritos no
  banco, as telas Financeiro e Contratos mostram "Acesso restrito" para os
  demais, e as ferramentas financeiras nem aparecem para quem não é Admin.
- Cada pessoa vê apenas as próprias conversas e os próprios rascunhos.
  Conversas paradas há mais de 90 dias são apagadas.
- Confirmar grava com o login de quem confirmou e registra no log de auditoria.
  Os dados são validados de novo no servidor (o navegador não decide o que é
  gravado), e um rascunho só pode ser confirmado uma vez.
- Arquivos enviados ficam no bucket privado `documents`, em
  `assistente/<id do usuário>/`. Os que **não** viraram documento de um
  cadastro são apagados depois de **7 dias**. O tipo é conferido pelo
  conteúdo do arquivo, não pela extensão.

## Custos e limite

- Cada resposta grava os tokens e o custo em `assistant_messages`.
- Limite mensal padrão: **US$ 50** (Configurações → Assistente virtual).
- Perguntas usam o **Claude Haiku**. Quando há arquivo anexado, a resposta
  usa o **Claude Sonnet**, que lê melhor PDFs e imagens (custa mais: em média
  alguns centavos de dólar por documento).
- 80% do limite: aviso no assistente. 100%: consultas e cadastros em texto
  continuam, leitura de documentos pausa. 150%: o assistente para até virar o mês ou um
  Admin aumentar o limite.
- Recomendado: definir também um limite de gasto no console da Anthropic
  (ex.: US$ 60) como segunda trava.

## Implantação

1. No SQL Editor do Supabase, rode `supabase/assistente-fase1.sql` (depois de
   `supabase/atualizacao-2026-11-16.sql`). O final do script lista as
   políticas criadas para conferência.
2. Para a fase 2, rode também `supabase/assistente-fase2.sql` (cria as
   tabelas de anexos e rascunhos com RLS). Quem instala do zero pode usar
   `supabase/instalacao-completa.sql`, que já inclui tudo.
   Para a fase 3, rode `supabase/assistente-fase3.sql` (andamentos; ver
   [ANDAMENTOS.md](ANDAMENTOS.md) para `CRON_SECRET` e a rotina diária).
3. Na Vercel, adicione `ANTHROPIC_API_KEY` (chave da conta do escritório) e
   faça um novo deploy. `ASSISTANT_MODEL` e `ASSISTANT_DOC_MODEL` são
   opcionais.
4. Abra Configurações → Assistente virtual e confira o limite.

## Arquitetura

| Peça | Arquivo |
| --- | --- |
| Rota de chat (streaming NDJSON) | `src/app/api/assistente/route.ts` |
| Histórico | `src/app/api/assistente/conversas/**` |
| Laço com ferramentas | `src/lib/assistant/agent.ts` |
| Ferramentas de consulta (inclui `andamentos_do_processo` e `andamentos_recentes`) | `src/lib/assistant/tools.ts` |
| Andamentos recentes de vários processos (consulta do assistente) | `src/lib/data/movements-recent.ts` |
| Ferramentas de rascunho (`preparar_*`, inclui `preparar_andamento`) | `src/lib/assistant/draft-tools.ts` |
| Campos, validação e linhas do banco | `src/lib/assistant/draft-schema.ts` |
| Duplicados (inclui andamento igual no mesmo dia) | `src/lib/assistant/duplicates.ts` |
| Confirmar / descartar | `src/lib/assistant/confirm-draft.ts`, `src/app/api/assistente/rascunhos/[id]/route.ts` |
| Anexos (envio, leitura, retenção) | `src/lib/assistant/attachments.ts`, `attachment-rules.ts`, `src/app/api/assistente/anexos/route.ts` |
| Instruções do modelo | `src/lib/assistant/prompt.ts` |
| Custo e limite | `src/lib/assistant/cost.ts`, `config.ts` |
| Persistência | `src/lib/assistant/store.ts` |
| Interface (cartão em `draft-card.tsx`) | `src/components/assistant/*`, `src/app/(crm)/assistente/*` |
| Partes comuns ao painel e ao WhatsApp (notas do histórico, erros da IA) | `src/lib/assistant/turn.ts`, `src/lib/assistant/links.ts` |
| Assistente pelo WhatsApp (fase 4): roteamento do número da equipe | `src/lib/channels/whatsapp-dispatch.ts`, `src/app/api/webhooks/whatsapp/route.ts` |
| Assistente pelo WhatsApp: resposta, "OK"/"CANCELAR", sem financeiro | `src/lib/assistant/whatsapp.ts`, `whatsapp-format.ts` |
| Identidade sem cookie no WhatsApp (service role + filtros no código) | `src/lib/supabase/request-context.ts` |
| WhatsApp e resumo diário na tela Equipe | `src/app/(crm)/equipe/*`, `src/lib/auth/team-actions.ts`, `src/lib/whatsapp-number.ts` |

Pelo WhatsApp (fase 4) o assistente funciona sem login: a pessoa é
reconhecida pelo número cadastrado na Equipe e as consultas usam a chave de
serviço, com filtros no código (sem financeiro para ninguém, conversas e
rascunhos sempre pelo id da pessoa). Detalhes em
[RESUMO-E-WHATSAPP.md](RESUMO-E-WHATSAPP.md#assistente-pelo-whatsapp).

As rotas `/api/*` não passam pelo proxy de login: a rota do assistente
confere sessão e perfil ativo em `public.users` antes de responder, e o
papel vem só do perfil (nunca dos metadados do usuário).

## Testes

`npm test` roda os testes automáticos (permissões do financeiro, filtros
das consultas, laço com ferramentas usando um cliente falso, custo e limite,
links seguros nas respostas, validação dos rascunhos, número CNJ e datas,
duplicados, tipos de arquivo, quem pode preparar cadastros, consultas e
lançamento de andamentos, leitura da resposta do DataJud e sincronização;
na fase 4, o assistente pelo WhatsApp: roteamento do número da equipe,
nenhum financeiro, "OK"/"CANCELAR", formatação e divisão das mensagens).

### Envio do arquivo

No modo normal o navegador pede ao servidor uma URL assinada e envia o arquivo
direto ao Storage do Supabase (não passa pelo limite de 4,5 MB das funções da
Vercel). O servidor baixa o arquivo, confere o tipo pelos primeiros bytes e
manda ao modelo como PDF ou imagem.
