# Checklist de produção — o que falta para o sistema entrar no ar

O código está completo. O que resta é **configuração** (Supabase, Vercel, IA e
Meta). Siga na ordem — cada etapa tem um teste de verificação no final.

Estado atual assumido: projeto Supabase criado (`lshbomevorblimixoduf`),
`schema.sql`/`auth.sql` executados e usuário da equipe criado.

---

## Etapa 1 — Completar o banco (Supabase) · ~5 min

O script de canais foi criado **depois** da sua configuração inicial, então
precisa ser executado agora.

- [ ] **SQL Editor** → rodar `supabase/channels.sql`
      (colunas `external_contact_id`/`triage_state` em `conversations` +
      tabela `channel_events`).
- [ ] Conferir se a tabela **`payments`** existe (Table Editor). Se não
      existir, rode só o bloco `payments` do `schema.sql` (foi adicionado na
      Fase 6).
- [ ] Rodar `supabase/storage.sql` se ainda não rodou (bucket privado
      `documents`). Confira em **Storage** se o bucket existe e está privado.
- [ ] Confirmar seu usuário como admin:

```sql
select id, email, role, active from public.users;
-- se necessário:
update public.users set role = 'admin' where email = 'SEU-EMAIL';
```

**Verificação:** `select count(*) from public.channel_events;` roda sem erro.

---

## Etapa 2 — Variáveis de ambiente locais · ~5 min

- [ ] `cp .env.example .env.local` (se ainda não existe)
- [ ] Preencher com os valores de **Project Settings → API** do Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://lshbomevorblimixoduf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...      # anon public
SUPABASE_SERVICE_ROLE_KEY=...          # service_role (NUNCA no client)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PRIVACY_POLICY_VERSION=1.0.0
AI_PROVIDER=mock                       # troca na Etapa 4
```

**Verificação:** `npm run dev` → `/login` deve exigir sua senha real (o aviso
amarelo de "modo demonstração" some). Após logar, `/dashboard` abre; em uma
aba anônima, `/dashboard` redireciona para `/login`.

---

## Etapa 3 — Deploy na Vercel · ~15 min

Os webhooks da Meta exigem uma **URL pública HTTPS**, então o deploy vem antes
da configuração da Meta.

- [ ] <https://vercel.com/new> → importar o repositório `Sxurish/Chatbot-Braz`
      (branch `claude/legal-crm-chatbot-system-PfXJq`, ou faça merge para a
      `main` antes e use a main).
- [ ] Framework: Next.js (detectado automaticamente). Build padrão.
- [ ] **Settings → Environment Variables**: colar TODAS as variáveis do
      `.env.local` (e depois as da Meta, Etapas 5–6).
- [ ] Deploy e anotar a URL (ex.: `https://chatbot-braz.vercel.app`).
- [ ] Atualizar `NEXT_PUBLIC_APP_URL` na Vercel com essa URL e redeployar.

**Verificação:** abrir `https://SUA-URL/atendimento`, passar pelo
consentimento, descrever um caso → o lead deve aparecer em
`https://SUA-URL/leads` e na tabela `leads` do Supabase.

---

## Etapa 4 — Ativar a IA (opcional, recomendado) · ~5 min

Sem isso o chatbot funciona com o classificador heurístico (palavras-chave).
Com IA, a triagem entende linguagem natural e extrai dados (nome, cidade,
prazos) automaticamente.

- [ ] Escolher provedor e criar a chave:
      - **Anthropic (Claude)** — recomendado; modelo padrão já configurado
        (`claude-haiku-4-5`, bom custo/latência): <https://console.anthropic.com>
      - OpenAI: <https://platform.openai.com>
      - OpenRouter / Google: equivalentes.
- [ ] No `.env.local` **e** na Vercel:

```env
AI_PROVIDER=anthropic          # ou openai | openrouter | google
ANTHROPIC_API_KEY=sk-ant-...   # a chave do provedor escolhido
# AI_MODEL=                    # opcional; vazio usa o padrão
```

**Verificação:** conversar com o chatbot com uma frase ambígua (ex.: "meu
benefício foi cortado e não sei o que fazer") → resposta contextual e área
"Previdenciário" classificada no lead.

---

## Etapa 5 — WhatsApp Cloud API (Meta) · ~45 min na primeira vez

Pré-requisito: um número de telefone que possa ser dedicado ao WhatsApp
Business API (não pode estar registrado num WhatsApp comum ativo).

1. - [ ] Criar conta em <https://developers.facebook.com> e um **app** do tipo
         **Business**.
2. - [ ] No app, adicionar o produto **WhatsApp**. A Meta cria um número de
         teste gratuito — serve para validar tudo antes do número real.
3. - [ ] Anotar (aba *WhatsApp → API Setup*):
         - **Phone Number ID**
         - **Token de acesso** (o temporário serve para teste; para produção,
           crie um **System User** em Business Settings → gere token permanente
           com escopo `whatsapp_business_messaging`).
4. - [ ] Em *App Settings → Basic*: copiar o **App Secret**.
5. - [ ] Adicionar na Vercel (e `.env.local`):

```env
WHATSAPP_VERIFY_TOKEN=escolha-uma-senha-qualquer-ex-braz2026webhook
WHATSAPP_APP_SECRET=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

6. - [ ] Redeploy na Vercel (variáveis novas exigem redeploy).
7. - [ ] Em *WhatsApp → Configuration → Webhook*:
         - **Callback URL**: `https://SUA-URL/api/webhooks/whatsapp`
         - **Verify token**: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
         - Clicar **Verify and save** (deve validar na hora).
         - Em **Webhook fields**, assinar **messages**.

**Verificação:** enviar "olá" do seu celular para o número de teste →
receber a saudação + pedido de consentimento; responder **SIM** e descrever um
caso → lead aparece no CRM com origem "whatsapp" e a conversa em `/conversas`.

> Produção de verdade: registrar o número definitivo do escritório na aba
> *API Setup → Add phone number* e completar a verificação do negócio
> (Business Verification) quando a Meta solicitar.

---

## Etapa 6 — Instagram DMs (Meta) · ~30 min

Pré-requisitos: conta do Instagram **profissional** do escritório vinculada a
uma **Página do Facebook**.

1. - [ ] No **mesmo app** da Meta, adicionar o produto **Messenger** →
         seção **Instagram** (ou o produto "Instagram" conforme o layout
         atual do painel).
2. - [ ] Conectar a Página do Facebook e a conta do Instagram profissional.
3. - [ ] Gerar o **token de acesso da Página** com as permissões
         `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`.
4. - [ ] Adicionar na Vercel (e `.env.local`):

```env
INSTAGRAM_VERIFY_TOKEN=outra-senha-qualquer
INSTAGRAM_APP_SECRET=...        # o mesmo App Secret do app
INSTAGRAM_ACCESS_TOKEN=...      # token da Página
```

5. - [ ] Redeploy.
6. - [ ] Webhook do produto Instagram:
         - **Callback URL**: `https://SUA-URL/api/webhooks/instagram`
         - **Verify token**: `INSTAGRAM_VERIFY_TOKEN`
         - Assinar o campo **messages**.
7. - [ ] Nas configurações do Instagram do escritório: *Privacidade →
         Mensagens → Ferramentas conectadas* → permitir acesso às mensagens.

**Verificação:** enviar DM de outra conta para o Instagram do escritório →
fluxo de consentimento → lead com origem "instagram" no CRM.

> Enquanto o app da Meta estiver em **modo de desenvolvimento**, só contas de
> teste/administradores conseguem conversar. Para abrir ao público, envie o
> app para **App Review** com as permissões de mensagens.

---

## Etapa 7 — Teste final de ponta a ponta · ~10 min

- [ ] Chat do site → lead criado (origem chatbot)
- [ ] WhatsApp → lead criado (origem whatsapp)
- [ ] Instagram → lead criado (origem instagram)
- [ ] `/conversas` mostra os três canais
- [ ] `/notificacoes` alerta os novos leads (urgente quando for o caso)
- [ ] Upload de documento na página de um lead → arquivo em Storage
- [ ] Criar tarefa/follow-up/agendamento → aparecem nas listas
- [ ] "Tornar cliente" → cliente em `/clientes`
- [ ] Teste de urgência: mandar "meu marido foi preso ontem" → lead ALTA,
      prioritário, notificação urgente

---

## Depois do go-live (roadmap sugerido, sem pressa)

1. **Merge para a `main`** e configurar a Vercel para produção na main.
2. Domínio próprio (ex.: `atendimento.jeanbraz.adv.br`) na Vercel.
3. App Review da Meta (para abrir WhatsApp/IG ao público).
4. Módulos de expansão: base de conhecimento editável, logs de auditoria na
   tela, exportar resumo do lead em PDF, n8n para follow-up automático,
   produtos digitais (ecossistema LexIA).
