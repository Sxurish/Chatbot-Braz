# Chatbot-Braz — Dashboard/CRM Jurídico com Chatbot Inteligente

Sistema web para o escritório do **Dr. Jean Braz** (OAB/SP) composto por um
**chatbot de pré-atendimento jurídico** (triagem, classificação e coleta de
informações em conformidade com a LGPD) e um **CRM/Dashboard interno** para a
gestão de leads, clientes, casos, documentos, agenda e tarefas.

> ⚠️ O chatbot atua **apenas como pré-atendimento**. Não substitui consulta
> jurídica formal, não emite parecer e não promete resultado.

---

## ✨ O que já está implementado (Fases 1 e 2 + base das Fases 3 e 4)

### 🔐 Fase 2 — Autenticação e dados reais (Supabase)

- **Login** (`/login`) com Supabase Auth (e-mail/senha) via Server Action.
- **Proteção de rotas** do CRM por **middleware** (renova a sessão e redireciona
  usuários não autenticados para `/login`).
- **Logout** no menu do usuário (topbar), exibindo nome e papel reais.
- **Camada de dados** (`src/lib/data`) que lê do Supabase quando configurado e
  **cai automaticamente para os mocks** em modo demonstração — dashboard, leads,
  detalhe do lead e equipe já consomem essa camada.
- **Persistência do chatbot**: ao consentir e iniciar a triagem, o atendimento é
  gravado como **lead + conversa + registro de consentimento (LGPD)** usando a
  _service role_ no servidor (`src/lib/data/leads-write.ts`).
- **Trigger de provisionamento de perfil** (`supabase/auth.sql`): cria
  `public.users` automaticamente a cada novo usuário do Auth.

> Sem credenciais do Supabase, o app continua 100% navegável em **modo
> demonstração** (login com um clique, dados mockados, chatbot com fallback).

### Fase 1 + base das Fases 3 e 4

- **Landing institucional** (`/`) com áreas de atuação e CTA para o atendimento.
- **Chatbot de pré-atendimento** (`/atendimento`):
  - saudação + aviso de limitação jurídica + **consentimento LGPD** obrigatório;
  - classificação de **área jurídica** e **urgência**;
  - bloqueio de pedidos ilícitos (camada de segurança comportamental);
  - sugestão de documentos por área e sinalização de _handoff_ prioritário;
  - **rota de IA** (`/api/chat`) pronta para OpenAI, Anthropic (Claude),
    Google Gemini e OpenRouter, com **retorno estruturado em JSON** validado por Zod.
- **CRM / Dashboard**: visão geral com métricas e gráficos (Recharts), listagem
  de leads com filtros, detalhe do lead, e módulos de **tarefas, agenda,
  follow-up e equipe**; placeholders consistentes para o roadmap.
- **Schema SQL completo do Supabase** com ENUMs, tabelas, triggers e **RLS**.

---

## 🧱 Stack

| Camada        | Tecnologia                                   |
| ------------- | -------------------------------------------- |
| Front-end     | Next.js 14 (App Router) + React 18           |
| Linguagem     | TypeScript                                   |
| Estilo        | Tailwind CSS (componentes estilo shadcn/ui)  |
| Ícones        | lucide-react                                 |
| Gráficos      | Recharts                                     |
| Validação     | Zod                                          |
| Banco / Auth  | Supabase (PostgreSQL, Auth, Storage)         |
| IA            | OpenAI / Anthropic / Gemini / OpenRouter     |
| Deploy        | Vercel                                       |

---

## 📁 Estrutura de pastas

```
middleware.ts                                    # proteção de rotas + sessão
src/
├── app/
│   ├── layout.tsx, globals.css, page.tsx        # raiz + landing
│   ├── login/                                    # autenticação (Server Action)
│   ├── atendimento/page.tsx                      # chatbot público
│   ├── api/chat/route.ts                         # rota de IA + persistência
│   └── (crm)/                                    # grupo protegido do CRM
│       ├── layout.tsx                            # sidebar + topbar (usuário real)
│       ├── dashboard/  leads/  leads/[id]/
│       ├── tarefas/  agenda/  follow-up/  equipe/
│       └── clientes/ casos/ processos/ ...       # módulos do roadmap
├── components/  (ui, layout, dashboard, crm, chat)
└── lib/
    ├── types.ts, constants.ts, utils.ts, metrics.ts, mock-data.ts
    ├── auth/          # actions (login/logout), current-user
    ├── data/          # leads (read), leads-write (persistência do chatbot)
    ├── chatbot/       # system-prompt, schema (Zod), flow (heurística)
    └── supabase/      # client, server, middleware, config
supabase/
├── schema.sql                                   # schema completo + RLS
└── auth.sql                                     # trigger de provisionamento
```

---

## 🚀 Setup local

```bash
npm install
cp .env.example .env.local   # preencha os valores (ou deixe vazio p/ modo demo)
npm run dev                  # http://localhost:3000
```

Rotas: `/` (landing) · `/atendimento` (chatbot) · `/login` · `/dashboard` (CRM).

> Funciona **sem Supabase e sem chave de IA**: o login entra direto no painel
> (modo demo), os dados são mockados e o chatbot usa fallback heurístico.

---

## 🔐 Variáveis de ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # somente server (persistência do chatbot)

# IA (escolha o provedor)
AI_PROVIDER=mock                    # mock | openai | anthropic | openrouter | google
AI_MODEL=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PRIVACY_POLICY_VERSION=1.0.0
```

---

## 🗄️ Banco de dados e autenticação (Supabase)

1. Crie um projeto no Supabase.
2. No **SQL Editor**, execute `supabase/schema.sql` e depois `supabase/auth.sql`.
3. Copie URL e chaves (anon + service role) para o `.env.local`.
4. Em **Authentication → Users**, crie o usuário da equipe (e-mail/senha).
5. Promova-o a admin:
   `update public.users set role = 'admin' where email = '...';`
6. (Opcional) Crie um bucket **privado** no Storage para documentos.

Com isso, `/login` passa a autenticar de verdade, as rotas do CRM ficam
protegidas e o chatbot grava leads/consentimentos reais.

---

## ☁️ Deploy na Vercel

1. Importe o repositório (framework detectado: **Next.js**).
2. Configure as variáveis de ambiente no painel.
3. Deploy. Sem variáveis, sobe em modo demonstração.

---

## 🗺️ Roadmap (arquitetura modular — ecossistema LexIA)

- **Fase 2 — Supabase:** ✅ autenticação, RLS, middleware, queries reais e
  persistência do chatbot.
- **Fase 4 — IA:** resumo final da conversa e enriquecimento da classificação.
- **Fase 5 — Documentos/Agenda/Tarefas:** upload com Storage e notificações.
- **Fase 6 — Expansões:** contratos, gestão processual, financeiro, follow-up
  avançado, produtos digitais, automação documental, n8n e WhatsApp API.

---

## ⚖️ Princípios éticos e LGPD

- Consentimento explícito antes de coletar dados pessoais (registro em `consent_logs`).
- O chatbot **não** promete resultado, **não** confirma direito com certeza,
  **não** inventa leis/jurisprudência e **não** orienta condutas ilegais.
- Tom formal, técnico, acolhedor e prudente; _handoff_ humano em casos urgentes.
- Storage privado, validação de inputs, RLS e segregação de chaves secretas.
