# Runbook — Diagnosticar homologação a partir da máquina local

O portal de desenvolvimento continua no Supabase **local**. O Vite recusa
`npm run dev` apontado para um ambiente publicado: a sessão de um usuário
escreve, e a versão do stack deixa de ser a que vai para o ar.

O que a máquina local faz contra homologação é **ler e dizer o que executar**.
Quem aplica migration, dispara deploy ou mexe em variável continua sendo uma
pessoa, na VPS ou no Dockploy.

```bash
npm run supabase:diagnosticar
```

## O que o comando faz

1. **API pública** — a mesma checagem de `npm run supabase:checar`, só se o
   host tiver rótulo `hml`, `homolog`, `homologacao`, `staging`, `test`,
   `teste` ou `testes`. Host de produção é recusado antes de qualquer
   requisição.
2. **Banco** — SSH na VPS e o script
   `supabase/tools/diagnostico/consulta-homologacao.sh`. Ele usa só
   `/etc/brandplay/homologacao.env` e abre o `psql` com
   `default_transaction_read_only`. Compara `migrations.schema_migrations` com
   os arquivos desta árvore e lista erros recentes de `backend_error_logs`
   (sem e-mail).
3. **Dockploy** — `GET` numa lista fechada (`project.all`, logs, deploys).
   Homologação repete a configuração de produção (compose, nomes, ambiente
   `production` do painel). O que entra na leitura é o serviço cujo domínio
   tem `teste`, `hml` ou `homolog`. O domínio sem esse rótulo é ignorado.
4. **O que executar** — o comando de `migrate.sh` para rodar **na VPS**,
   depois do backup, se o stack já estiver pronto (GoTrue com migrations
   internas e `storage.buckets` existente). Este comando não aplica nada.

A senha do Postgres não entra no arquivo local. Se `DATABASE_URL`,
`SERVICE_ROLE_KEY` ou outro segredo de banco aparecer em `.env.homologacao`,
o comando ignora a chave e avisa.

## Preparar

```bash
cp .env.homologacao.example .env.homologacao
```

Preencha o que for usar. Dá para rodar só a API, só o SSH ou só o Dockploy.
`AMBIENTE` tem de ser exatamente `homologacao`.

### API

`SUPABASE_URL` é o `https://api.hml.<dominio>` (ou o host de teste, com o
rótulo `teste` no nome). `SUPABASE_ANON_KEY` é a chave pública daquele
ambiente. Os nomes do Vite também valem: `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY`. Sem a linha `AMBIENTE=homologacao`, o
comando segue se o host for de homologação. `PORTAL_URL` é opcional.

### SSH

`VPS_HOST` e `VPS_USER` são o mesmo acesso que o workflow de deploy usa.
`VPS_SSH_KEY` é opcional; sem ela, o OpenSSH usa a chave padrão da máquina.
No Windows o recurso é o OpenSSH Client.

Na VPS, `/etc/brandplay/homologacao.env` já é o arquivo do
`docs/runbooks/primeira-carga.md`. Homologação usa o mesmo compose e os
mesmos nomes de serviço que produção, de propósito: o que muda é o host
(`teste` ou `hml`). `SUPABASE_NETWORK` precisa conter `teste`, `hml`,
`homolog` ou `staging` (por exemplo `brandplay-teste_default`) e não pode
parecer produção. O script recusa o outro arquivo.

### Dockploy

`DOCKPLOY_URL` é a origem do painel, com `https`. `DOCKPLOY_API_KEY` sai de
Settings → Profile → API/CLI.

A chave do Dokploy enxerga a conta inteira. Este comando só emite `GET` e só
lê serviço de homologação, mas a chave em si não fica limitada a isso se
alguém a usar fora daqui. Não a commite e não a reaproveite noutro lugar.

`DOCKPLOY_COMPOSE_ID` e `DOCKPLOY_APPLICATION_ID` são opcionais. O id aparece
na URL do serviço no painel. Se o id for de produção, o comando para sem ler
o log.

## Como ler o relatório

- **Pendentes** são migrations desta pasta que o banco de homologação ainda
  não tem. O clone da VPS é que será aplicado, não um arquivo que só existe
  nesta máquina. Atualize o clone para o commit certo antes de migrar.
- **Checksum diferente** significa que o arquivo mudou depois de aplicado. Não
  reaplique. Escreva uma migration nova. Se a árvore local estiver com CRLF,
  o hash muda sem o SQL ter mudado (`git ls-files --eol supabase/migrations`).
- **GoTrue ausente ou `storage.buckets` ausente**: não migre. Espere o
  compose ficar saudável. O critério está em
  `docs/runbooks/primeira-carga.md`.
- **Linha de log com entrypoint**: a imagem de `functions` subiu sem as
  funções. Republicar o compose de homologação depois do commit em
  `supabase/functions/`.
- **Deploy com status error**: republicar é ação no Dockploy ou no workflow
  Deploy (VPS). Este comando não chama o webhook.

Código de saída `0` é relatório completo. `1` é uma consulta que não
completou (SSH, API ou Dockploy). `2` é configuração ausente ou host
recusado. Migration pendente não é falha do comando: ela aparece na seção
final.

## O que isto não faz

- Não aponta `npm run dev` para homologação.
- Não abre Postgres na internet. A porta continua só na rede Docker da VPS.
- Não lê produção, mesmo que a mesma VPS e o mesmo painel hospedem os dois.
- Não aplica migration, não faz backup e não dispara deploy.
