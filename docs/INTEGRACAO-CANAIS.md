# Integração de canais — WhatsApp e Instagram

O chatbot de pré-atendimento funciona em múltiplos canais reaproveitando o
**mesmo motor de triagem** (`src/lib/chatbot/engine.ts`) e a **mesma camada de
ingestão** (`src/lib/channels/ingest.ts`). Tudo que entra por WhatsApp/Instagram
vira **lead + conversa + mensagens + consentimento** no CRM, exatamente como o
chat do site.

## Como funciona (fluxo)

```
Meta (WhatsApp/IG)
      │  webhook POST
      ▼
/api/webhooks/whatsapp  ──►  valida assinatura  ──►  parseInbound()
      │
      ▼
ingestMessage()  ─ dedup ─ estado da conversa ─ consentimento LGPD (SIM/NÃO)
      │                                   │
      │                                   ├─► runTriage()  (IA + heurística)
      │                                   ├─► cria lead + consent_logs
      │                                   ├─► notifica a equipe
      │                                   └─► resumo interno (Fase 4)
      ▼
sendText()  ──►  resposta volta ao usuário no WhatsApp
```

- **Estado por contato**: cada conversa guarda `external_contact_id`,
  `triage_state` (etapa do funil) e o histórico em `messages` — porque no
  WhatsApp/IG cada mensagem chega como um webhook isolado.
- **Consentimento LGPD**: como não há botão, o usuário responde **SIM/NÃO**; o
  consentimento é registrado em `consent_logs` com canal e data/hora.
- **Deduplicação**: a tabela `channel_events` ignora webhooks reenviados.

## Passo a passo — WhatsApp Cloud API

### 1. Banco

Execute `supabase/channels.sql` no SQL Editor (colunas de canal + dedup).

### 2. App na Meta

1. Crie um app em <https://developers.facebook.com> (tipo **Business**).
2. Adicione o produto **WhatsApp**.
3. Anote o **Phone Number ID** e gere um **Access Token** (System User
   recomendado para produção).
4. Em **App Settings → Basic**, copie o **App Secret**.

### 3. Variáveis de ambiente

```env
WHATSAPP_VERIFY_TOKEN=um-valor-secreto-que-voce-escolhe
WHATSAPP_APP_SECRET=...        # App Secret da Meta
WHATSAPP_ACCESS_TOKEN=...      # token de envio
WHATSAPP_PHONE_NUMBER_ID=...   # Phone Number ID
```

Configure as mesmas na **Vercel**.

### 4. Configurar o webhook na Meta

- **Callback URL**: `https://SEU-DOMINIO/api/webhooks/whatsapp`
- **Verify Token**: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
- Assine o campo **messages**.

A Meta fará um `GET` de verificação; o endpoint responde o `hub.challenge`
automaticamente.

### 5. Testar

Envie uma mensagem para o número do WhatsApp Business. O fluxo:

1. Bot responde com saudação + aviso jurídico + pedido de consentimento.
2. Você responde **SIM**.
3. Descreve o caso → o bot classifica, **cria o lead** e aparece em `/leads`,
   `/notificacoes` e nas métricas.

> Sem `SUPABASE_SERVICE_ROLE_KEY`, o webhook ainda responde (triagem), mas **não
> persiste**. A gravação exige a service role no servidor.

## Instagram (próxima fase)

A Instagram Messaging API usa a **mesma Graph API**. A estrutura já está pronta:
o `ingestMessage()` aceita `channel: "instagram"`. Falta apenas:

- `src/lib/channels/instagram.ts` (parse do payload de IG + `sendText` no
  endpoint de mensagens do IG);
- `src/app/api/webhooks/instagram/route.ts` (GET verify + POST).

As variáveis `INSTAGRAM_*` já estão previstas no `.env.example`.

## Segurança

- Assinatura `X-Hub-Signature-256` validada com `WHATSAPP_APP_SECRET`.
- Webhooks gravam via **service role** apenas no servidor.
- Deduplicação evita processamento duplicado.
- O webhook sempre responde `200` rapidamente para a Meta não reenviar em loop.
