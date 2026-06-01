# Guia de configuração do Supabase — CRM Jurídico Dr. Jean Braz

Passo a passo para ligar o app ao Supabase. Sem isso, o sistema roda em
**modo demonstração** (mocks + login com um clique).

## 1. Criar o projeto

1. Acesse <https://supabase.com/dashboard> e crie um **projeto novo**
   (recomendado: região **South America (São Paulo) – sa-east-1**).
2. Guarde a senha do banco.

## 2. Executar os scripts SQL (nesta ordem)

No painel do projeto → **SQL Editor** → cole e rode, na ordem:

1. `supabase/schema.sql`  — ENUMs, tabelas, triggers e RLS.
2. `supabase/auth.sql`    — provisionamento automático de perfil de usuário.
3. `supabase/storage.sql` — bucket privado `documents` + políticas.

> Dica: dá para rodar os três de uma vez colando um após o outro.

## 3. Criar o primeiro usuário (equipe)

1. **Authentication → Users → Add user** (e-mail + senha).
2. No **SQL Editor**, promova-o a admin:

   ```sql
   update public.users set role = 'admin'
   where email = 'jean@escritoriobraz.adv.br';
   ```

## 4. Copiar as chaves

**Project Settings → API**:

- `Project URL`        → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public`        → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role`       → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ somente server)

## 5. Preencher o `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJ.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# IA (opcional — sem isto o chatbot usa fallback heurístico)
AI_PROVIDER=mock
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PRIVACY_POLICY_VERSION=1.0.0
```

Na **Vercel**, configure as mesmas variáveis em *Project → Settings →
Environment Variables*.

## 6. (Opcional) Ativar a IA

Defina `AI_PROVIDER` para `openai` | `anthropic` | `openrouter` | `google`,
preencha a chave correspondente e, se quiser, `AI_MODEL`.

## 7. Validar

```bash
npm run dev
```

- `/login` deve autenticar de verdade (não mais o modo demo).
- Um atendimento no `/atendimento` deve criar um lead em **Table Editor → leads**.
- O upload de documento na página do lead deve aparecer em **Storage → documents**.

---

### Checklist rápido

- [ ] `schema.sql`, `auth.sql`, `storage.sql` executados sem erro
- [ ] Usuário criado e promovido a `admin`
- [ ] 3 variáveis do Supabase no `.env.local` (e na Vercel)
- [ ] `npm run dev` → login real funcionando
