# Runbook — E-mail

Dois caminhos de e-mail, com configuração separada:

| O quê | Quem envia | Configuração |
|---|---|---|
| Autenticação: confirmação de cadastro, recuperação de senha, troca de e-mail | GoTrue (serviço `auth`) | `SMTP_*` do serviço Compose do Supabase |
| Produto: convite de equipe, convite e ativação do portal do patrocinador, resumo de notificações | Edge Functions, por `supabase/functions/_shared/email.ts` | `RESEND_API_KEY`, `EMAIL_FROM` (ou `RESEND_FROM_DOMAIN`), `APP_URL`, `PORTAL_URL` |

Os dois saem pelo **Resend** nos ambientes hospedados; no local, o GoTrue
entrega no Mailpit (`http://localhost:8026`) e as funções só enviam se houver
`RESEND_API_KEY` no `docker/supabase/.env`.

## Domínio no Resend

Uma vez por domínio (produção e homologação podem usar subdomínios
diferentes, ex.: `mail.brandplay.com.br` e `hml-mail.brandplay.com.br`):

1. Resend → Domains → Add domain.
2. Crie no DNS os registros que ele mostra (SPF, DKIM e, recomendado, DMARC).
3. Aguarde o status **Verified**. Sem isso, o Resend recusa o remetente e as
   funções registram `Resend respondeu 403` no log do container `functions`.
4. API Keys → crie uma chave **por ambiente**, com permissão de envio só para
   aquele domínio.

## E-mails do produto (Edge Functions)

No Dockploy, serviço **Compose do Supabase** do ambiente:

```
RESEND_API_KEY=re_...
EMAIL_FROM=BrandPlay <nao-responda@mail.brandplay.com.br>
APP_URL=https://app.brandplay.com.br        # base dos links de convite e notificação
PORTAL_URL=                                  # vazio = SITE_URL
```

Redeploy do serviço para o container `functions` ler as variáveis.

Regras do `_shared/email.ts` (ADR-0008, fase F):

- a regra de negócio chama `sendEmail(...)`; o provedor é um adaptador
  (`resendProvider`). Trocar de provedor é escrever outro adaptador ali;
- remetente e base dos links vêm do ambiente, nunca do código nem da
  requisição;
- falha de envio **não** desfaz a operação (o convite já foi gravado): fica no
  log do container `functions` como `[email] ...` — sem a chave e sem o corpo
  do e-mail — e a resposta da função diz `email.sent = false` quando a tela
  precisa avisar.

Sem `RESEND_API_KEY`, nada é enviado e o log mostra
`[email] RESEND_API_KEY ausente`. O convite continua válido: o link pode ser
copiado da tela (portal do patrocinador) ou reenviado depois.

## E-mails de autenticação (GoTrue via SMTP do Resend)

No mesmo serviço do Dockploy:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_...                 # uma chave do Resend (pode ser a mesma do ambiente)
SMTP_ADMIN_EMAIL=nao-responda@mail.brandplay.com.br
SMTP_SENDER_NAME=BrandPlay
ENABLE_EMAIL_AUTOCONFIRM=false
```

- `465` é TLS implícito; `587` (STARTTLS) também funciona. O GoTrue não envia
  credencial por conexão sem TLS — por isso, no local, `SMTP_USER`/`SMTP_PASS`
  ficam vazios (ver `docker/supabase/.env.example`).
- `SITE_URL` precisa ser o domínio do portal do ambiente: é ele que vai nos
  links de confirmação e recuperação.
- Redeploy do serviço e teste: cadastro novo pelo portal deve receber o
  e-mail de confirmação; "Esqueci a senha" deve receber o link.

## Diagnóstico

| Sintoma | Onde olhar |
|---|---|
| Convite não chega, tela diz "enviado" | Log do `functions`: `[email] Resend respondeu ...`; no Resend → Logs, o envio e o motivo |
| Convite não chega, nenhum log `[email]` | A função não chegou a enviar: confira se a ação foi concluída (a resposta da função) |
| `[email] RESEND_API_KEY ausente` | Variável não chegou ao container: redeploy do serviço do Supabase |
| Confirmação de cadastro não chega | Log do `auth`: `Error sending confirmation email`; confira `SMTP_*` e a verificação do domínio |
| Link do e-mail aponta para `localhost` | `SITE_URL` (autenticação) ou `APP_URL` (produto) esquecidos no padrão |
