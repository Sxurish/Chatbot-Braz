# Primeiro acesso por convite

Como a equipe entra no CRM pela primeira vez, sem cadastro público.

## Como funciona

1. **Admin convida.** Em **Equipe → Convidar pessoa**, informa nome, e-mail e papel
   (Administrador, Advogado(a), Atendente, Financeiro ou Visualizador). O convite vale
   **7 dias** e pode ser renovado ou cancelado na mesma tela. O botão "Copiar instruções"
   gera um texto pronto para mandar à pessoa.
2. **A pessoa abre o CRM** e, na tela de login, clica em **Primeiro acesso**.
3. Digita o e-mail e recebe um **código de 6 dígitos** por e-mail.
4. Digita o código e vai para a tela **Criar senha** (mínimo 8 caracteres, com letra e número).
5. Entra no CRM com o papel definido no convite.

**Esqueci minha senha** usa o mesmo caminho: e-mail, código e nova senha.

## Regras de segurança

- O cadastro público continua desligado. Só recebe código quem tem convite pendente e
  dentro do prazo, ou quem já é membro ativo.
- A tela sempre mostra a mesma mensagem ("Se este e-mail tiver um convite ou cadastro
  ativo..."), para não revelar quem tem cadastro.
- O papel vem só do convite. Ninguém escolhe o próprio papel.
- Limites de tentativa: 3 pedidos de código por e-mail e 10 por IP a cada 15 minutos;
  5 tentativas de código a cada 15 minutos. O Supabase aplica os limites dele também.
- Até criar a senha, o perfil fica **inativo**: quem confirmou o código mas fechou a tela
  volta sempre para "Criar senha" e não vê nada do CRM.
- Admin pode **desativar** um membro em Equipe. Isso corta o acesso na hora (o login
  fica bloqueado no Supabase) e pode ser desfeito com **Reativar**. Admin não consegue
  desativar nem rebaixar a si mesmo.
- Convites, aceites, mudanças de papel e desativações ficam no registro de auditoria.

## O que configurar (uma vez)

### 1. Banco

No SQL Editor do projeto **CRM/ChatBot-Jurídico**, rode `supabase/convites.sql`
(é seguro rodar de novo). Quem for instalar do zero pode usar
`supabase/instalacao-completa.sql`, que já inclui os convites.

### 2. Variáveis na Vercel

- `SUPABASE_SERVICE_ROLE_KEY`: obrigatória para o primeiro acesso (cria o login da
  pessoa convidada no servidor). Nunca use prefixo `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_APP_URL`: endereço do CRM, usado no texto de instruções do convite
  (ex.: `https://chatbot-braz.vercel.app`).

### 3. Envio de e-mail (SMTP próprio)

O e-mail padrão do Supabase serve só para testes: manda poucos e-mails por hora e
apenas para os membros da conta do Supabase. Para a equipe receber o código, configure
um SMTP próprio. Sugestão: **Resend** (plano gratuito atende o escritório com folga).

1. Crie a conta no Resend e verifique o domínio do escritório (o Resend mostra os
   registros DNS para adicionar no provedor do domínio).
2. Gere uma API key no Resend.
3. No Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email: algo como `nao-responda@<domínio do escritório>`
   - Sender name: `Escritório Dr. Jean Braz`
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: a API key
4. Em **Authentication → Rate Limits**, ajuste "emails sent" para algo como 30 por hora.

### 4. Modelo do e-mail

Em **Authentication → Emails → Templates → Magic Link**:

- Assunto: `Seu código de acesso ao CRM do escritório: {{ .Token }}`
- Corpo: cole o conteúdo de `supabase/email-templates/codigo-de-acesso.html`.

O código precisa aparecer como `{{ .Token }}`. Não use o link mágico: a pessoa digita o
código na tela do CRM.

### 5. Validade e tamanho do código

Em **Authentication → Sign In / Providers → Email**:

- **Email OTP Length**: `6`
- **Email OTP Expiration**: `600` segundos (10 minutos) é um bom equilíbrio.

## Testar

1. Em Equipe, convide um e-mail seu que ainda não esteja no CRM.
2. Abra o CRM numa janela anônima, clique em **Primeiro acesso** e siga os passos.
3. Confira em Equipe que a pessoa aparece como ativa e o convite saiu da lista.

Sem Supabase configurado (modo demonstração), o código é sempre `123456`.
