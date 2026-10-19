# Runbook — E-mail

Dois caminhos de e-mail, com configuração separada:

| O quê | Quem envia | Configuração |
|---|---|---|
| Autenticação: confirmação de cadastro, recuperação de senha, troca de e-mail | GoTrue (serviço `auth`) | `SMTP_*` do serviço Compose do Supabase; texto em PT-BR versionado (ver "Texto dos e-mails de autenticação") |
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
SMTP_SENDER_NAME=Brandplay
ENABLE_EMAIL_AUTOCONFIRM=false
```

- `465` é TLS implícito; `587` (STARTTLS) também funciona. O GoTrue não envia
  credencial por conexão sem TLS — por isso, no local, `SMTP_USER`/`SMTP_PASS`
  ficam vazios (ver `docker/supabase/.env.example`).
- `SITE_URL` precisa ser o domínio do portal do ambiente: é ele que vai nos
  links de confirmação e recuperação.
- Redeploy do serviço e teste: cadastro novo pelo portal deve receber o
  e-mail de confirmação; "Esqueci a senha" deve receber o link.

## Texto dos e-mails de autenticação (PT-BR)

Assunto e corpo dos e-mails do GoTrue são do repositório, iguais em todos os
ambientes — nada a configurar no Dockploy:

| E-mail | Assunto (`GOTRUE_MAILER_SUBJECTS_*`) | Corpo |
|---|---|---|
| Recuperação de senha | Redefina sua senha do Brandplay | `recuperacao.html` |
| Confirmação de cadastro | Confirme seu e-mail no Brandplay | `confirmacao.html` |
| Convite (`auth.admin.inviteUserByEmail`) | Você foi convidado para o Brandplay | `convite.html` |
| Troca de e-mail (vai ao endereço antigo e ao novo) | Confirme a troca de e-mail no Brandplay | `troca-de-email.html` |
| Link de acesso (magic link) | Seu link de acesso ao Brandplay | `link-de-acesso.html` |
| Reautenticação (código) | Seu código de confirmação do Brandplay | `reautenticacao.html` |

Os assuntos estão no serviço `auth` do `docker/supabase/docker-compose.yml`;
os HTML, em `docker/files/volumes/auth/templates/`. O portal hoje só dispara
recuperação e confirmação; os outros estão traduzidos para nenhum e-mail do
GoTrue sair em inglês se um fluxo novo passar a usá-los.

**De onde o HTML vem.** O GoTrue só aceita template por URL HTTP (sem
`file://`, sem conteúdo inline em variável). O serviço `auth-templates` do
próprio compose — um nginx que serve aquela pasta por bind mount — responde em
`http://auth-templates/<arquivo>.html`, só na rede interna do stack: sem porta
publicada, sem domínio no Dockploy. Por ser o mesmo compose, funciona igual no
local, em homologação e em produção, e o texto muda por PR como qualquer
código. Alternativas descartadas: servir pelo Kong (um erro de configuração
derrubaria a API inteira, não só o e-mail); pelo portal no `SITE_URL` (o
container não alcança o `localhost:8080` do local, e o e-mail passaria a
depender do deploy do portal); por um host externo (configuração que só
existiria nos ambientes hospedados).

Ao editar um template:

- mantenha `{{ .ConfirmationURL }}` (no `reautenticacao.html`, `{{ .Token }}`):
  é o link de verificação. O E2E `portal/e2e/recuperacao-senha.spec.ts` extrai
  do `href` o link com `/auth/v1/verify`. Também disponíveis: `{{ .Email }}`,
  `{{ .NewEmail }}` (troca de e-mail), `{{ .Token }}`, `{{ .SiteURL }}`;
- o layout é repetido nos seis arquivos (o GoTrue não tem include): mudou um,
  confira os outros;
- o GoTrue guarda o template por até 10 min. Para ver na hora,
  `docker compose ... restart auth`. Nos ambientes hospedados, o Dockploy
  redeploya ao receber mudança em `docker/` — o texto novo vale depois disso.

Se o `auth-templates` estiver fora do ar, o e-mail **sai mesmo assim**, com o
template padrão do GoTrue, em inglês (log do `auth` com o erro do download).
O `auth` não depende dele de propósito: e-mail em inglês é melhor que e-mail
nenhum. Com `GOTRUE_MAILER_TEMPLATE_RELOADING_ENABLED` (ligado no compose), o
GoTrue volta ao PT-BR uns 20 s depois de o `auth-templates` voltar (medido no
stack local); sem ele, ficaria com o padrão em inglês até o cache de 10 min
vencer.

## Diagnóstico

| Sintoma | Onde olhar |
|---|---|
| Convite não chega, tela diz "enviado" | Log do `functions`: `[email] Resend respondeu ...`; no Resend → Logs, o envio e o motivo |
| Convite não chega, nenhum log `[email]` | A função não chegou a enviar: confira se a ação foi concluída (a resposta da função) |
| `[email] RESEND_API_KEY ausente` | Variável não chegou ao container: redeploy do serviço do Supabase |
| Confirmação de cadastro não chega | Log do `auth`: `Error sending confirmation email`; confira `SMTP_*` e a verificação do domínio |
| Link do e-mail aponta para `localhost` | `SITE_URL` (autenticação) ou `APP_URL` (produto) esquecidos no padrão |
| E-mail de autenticação em inglês ("Reset Password") | `auth-templates` fora do ar ou template com erro de sintaxe: log do `auth` (erro ao baixar ou interpretar o template) e `docker compose ps auth-templates` |
| Template editado, e-mail ainda com o texto antigo | Cache de até 10 min do GoTrue: espere ou reinicie o `auth` |
