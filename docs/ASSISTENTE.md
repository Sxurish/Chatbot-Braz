# Assistente virtual da equipe — Fase 1 (consulta)

Assistente com IA (Claude Haiku) dentro do CRM. Responde perguntas sobre
leads, clientes, casos, processos, prazos, tarefas, agenda e follow-ups,
sempre consultando o CRM e com link para o registro. **Só consulta:** não
cadastra nem altera nada (o cadastro com confirmação chega na fase 2).

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

## Regras de acesso

- O assistente consulta o banco **com o login de quem pergunta**, então as
  regras do Supabase (RLS) valem para ele também.
- **Financeiro só para Admin**: pagamentos e contratos ficam restritos no
  banco, as telas Financeiro e Contratos mostram "Acesso restrito" para os
  demais, e as ferramentas financeiras nem aparecem para quem não é Admin.
- Cada pessoa vê apenas as próprias conversas. Conversas paradas há mais de
  90 dias são apagadas.

## Custos e limite

- Cada resposta grava os tokens e o custo em `assistant_messages`.
- Limite mensal padrão: **US$ 50** (Configurações → Assistente virtual).
- 80% do limite: aviso no assistente. 100%: consultas continuam, leitura de
  documentos (fase 2) pausa. 150%: o assistente para até virar o mês ou um
  Admin aumentar o limite.
- Recomendado: definir também um limite de gasto no console da Anthropic
  (ex.: US$ 60) como segunda trava.

## Implantação

1. No SQL Editor do Supabase, rode `supabase/assistente-fase1.sql` (depois de
   `supabase/atualizacao-2026-11-16.sql`). O final do script lista as
   políticas criadas para conferência.
2. Na Vercel, adicione `ANTHROPIC_API_KEY` (chave da conta do escritório) e
   faça um novo deploy. `ASSISTANT_MODEL` é opcional.
3. Abra Configurações → Assistente virtual e confira o limite.

## Arquitetura

| Peça | Arquivo |
| --- | --- |
| Rota de chat (streaming NDJSON) | `src/app/api/assistente/route.ts` |
| Histórico | `src/app/api/assistente/conversas/**` |
| Laço com ferramentas | `src/lib/assistant/agent.ts` |
| Ferramentas (só leitura) | `src/lib/assistant/tools.ts` |
| Instruções do modelo | `src/lib/assistant/prompt.ts` |
| Custo e limite | `src/lib/assistant/cost.ts`, `config.ts` |
| Persistência | `src/lib/assistant/store.ts` |
| Interface | `src/components/assistant/*`, `src/app/(crm)/assistente/*` |

As rotas `/api/*` não passam pelo proxy de login: a rota do assistente
confere sessão e perfil ativo em `public.users` antes de responder, e o
papel vem só do perfil (nunca dos metadados do usuário).

## Testes

`npm test` roda os testes automáticos (permissões do financeiro, filtros
das consultas, laço com ferramentas usando um cliente falso, custo e limite,
links seguros nas respostas).
