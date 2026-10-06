# `files/volumes` — arquivos montados no stack do Supabase

O que os containers do Supabase leem em tempo de boot: configuração do gateway,
scripts de inicialização do Postgres e do pooler. O `docker-compose.yml` de
`docker/supabase/` monta tudo daqui.

O caminho é `../files/volumes` relativo ao compose — a convenção do Dockploy, e
a mesma que o serviço de homologação já usa. Mudar esse caminho quebra o deploy.

## Procedência

A maioria vem do upstream, do repositório `supabase/supabase`, pasta
`docker/volumes`, **fixada no commit**:

```
272a288c9b8c4517e6d5ae2f5e5c98ec61fe33ef
```

Esse commit foi escolhido porque as imagens dele batem com as do nosso
`docker-compose.yml` — 10 das 11. A exceção é o gateway: o upstream já migrou
para Envoy, e nós continuamos no Kong, que é o que roda em homologação. Os
arquivos do Kong seguem versionados lá.

**Ao atualizar as imagens do compose, reveja estes arquivos no mesmo passo.** Um
`kong.yml` de uma geração e um Kong de outra falham de formas difíceis de ler.

## Arquivo que NÃO é do upstream

Um. Não sobrescreva com a versão upstream sem ler o motivo:

### `db/roles.sql`

O upstream faz `ALTER USER` numa lista fixa que inclui
`supabase_functions_admin`. Quando esse papel não existe na imagem, o psql
aborta o script inteiro — e `storage` e `rest` ficam sem senha válida, com
sintoma que aparece longe da causa.

A nossa versão monta o comando a partir de `pg_roles` com `\gexec`: papel
ausente simplesmente não entra na lista. Isso importa mais depois da migração de
Postgres 15 para 17, que mexe no conjunto de papéis.

## O que existia aqui e não existe mais: `db/auth-owner.sql`

Fica registrado porque o sintoma é feio e pode voltar numa atualização.

No stack antigo — Postgres 15.14 com GoTrue v2.196 — a imagem criava o schema
`auth` com as funções pertencentes a `postgres`. O GoTrue conecta como
`supabase_auth_admin` e, na primeira migration, executa
`create or replace function auth.uid()`, que falhava com
`must be owner of function uid` e deixava o serviço em **restart loop**.

Um serviço `db-init` corrigia a propriedade a cada subida.

Com as imagens atuais isso não acontece: verificado subindo de volume vazio sem
o script, o GoTrue fica saudável em ~15s com **zero restarts**. Curiosamente o
schema `auth` continua pertencendo a `supabase_admin` — o que mudou é que esta
versão do GoTrue não se importa.

Pior, o remédio virou o problema: o `db-init` conectava como `supabase_admin`
com a `POSTGRES_PASSWORD`, e num ambiente onde esse papel não existe ou tem
outra senha ele saía com `exit 2`. Como o `auth` dependia dele com
`service_completed_successfully`, uma falha de conexão derrubava o stack inteiro
— foi o que quebrou um deploy de homologação.

**Se o GoTrue voltar a reiniciar com `must be owner of function uid`**, o
conserto é transferir a propriedade do schema e das funções de `auth` para
`supabase_auth_admin`. Está no histórico do git, no commit que removeu este
arquivo.

## Aqui não mora dado

Só configuração e código: `kong.yml`, os SQL de inicialização, o `pooler.exs`.
Tudo isso **deve** ser atualizado a cada deploy, e por isso vem do repositório
por bind mount.

Dado — o banco, os arquivos do Storage, os snippets do Studio — vive em
**volume nomeado**, declarado no fim do `docker-compose.yml`.

A distinção não é estética. O upstream monta `./volumes/db/data`, o que só
funciona quando o compose vive num diretório estável. No Dockploy ele vive num
clone do repositório, refeito a cada deploy — e o banco ia junto. Aconteceu de
verdade: um redeploy apagou schema e seed de homologação.

**Ao acrescentar um mount aqui, pergunte se o conteúdo deve sobreviver a um
redeploy.** Se deve, não é lugar dele.

E note que o Dockploy está com **watch na pasta `docker/`**: qualquer alteração
que chegue aqui redeploya homologação sozinha. Mexer nestes arquivos é uma ação,
não só um diff.

Os SQL de inicialização rodam **apenas na criação do volume do Postgres**. Como
o volume agora sobrevive aos deploys, editá-los não muda um ambiente que já
existe — vale para o próximo criado do zero.
