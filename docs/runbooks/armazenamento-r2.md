# Runbook — Armazenamento de mídia no Cloudflare R2

Feature BP-7 (análise de mídia da edição), decisões D2 e D10. Os vídeos e as
fotos do material da edição vão direto entre o navegador e o R2 por URL
pré-assinada, sem passar pela VPS. A URL é emitida pela Edge Function da
BP-7.05, que confere a permissão antes. O banco guarda a estrutura e o tamanho
real de cada objeto (`edition_media`, `edition_media_objects`, migration
0049).

Este runbook cobre só o lado da Cloudflare: conta, buckets, CORS e chaves. É
feito uma vez por ambiente, por quem administra a conta. Criar a conta e
cadastrar forma de pagamento é com o usuário, não com o Claude.

## O que criar

| Ambiente    | Bucket                     | Origem do portal (CORS)         | Onde fica a chave                        |
| ----------- | -------------------------- | ------------------------------- | ---------------------------------------- |
| local       | `brandplay-midia-dev`      | `http://localhost:8080`         | `docker/supabase/.env` (fora do Git)     |
| homologação | `brandplay-midia-hml`      | `https://teste.brandplay.com.br` | Dockploy, Compose do Supabase de hml     |
| produção    | `brandplay-midia-producao` | `https://brandplay.com.br`      | Dockploy, Compose do Supabase de produção |

Um bucket e uma chave por ambiente. A chave de um ambiente nunca abre o bucket
de outro, e o material de teste nunca se mistura com o de cliente. Dentro do
bucket, a hierarquia é o caminho do objeto, montado pelo banco:
`<organizacao>/<projeto>/<edicao>/<midia>/<variante>` (D10). Não crie um bucket
por cliente: o isolamento é feito pela Edge Function e pela RLS.

## Passo a passo

### 1. Conta e R2

1. Crie ou use a conta da Cloudflare da empresa (não uma conta pessoal).
2. **R2 Object Storage** → ative o R2. A Cloudflare pede forma de pagamento
   mesmo dentro da faixa grátis.
3. Anote o **Account ID** (aparece na página do R2). Ele entra no endereço da
   API: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

### 2. Bucket (repita por ambiente)

**R2 → Create bucket**:

- Nome: o da tabela acima.
- Location: **Automatic** com a dica **Eastern North America (ENAM)**. Não há
  região no Brasil; a ENAM é a mais próxima em latência.
- Default storage class: **Standard**. A Infrequent Access fica para quando
  houver limite por plano (D3).

Depois de criar, em **Settings** do bucket:

- **Public access**: deixe **desligado**. Sem domínio `r2.dev` e sem domínio
  próprio: o bucket é privado e só abre por URL pré-assinada.
- **Object lifecycle rules**: confira se existe a regra de **abortar uploads
  multipart incompletos** (7 dias é suficiente). Ela só limpa envio
  interrompido que nunca terminou, não apaga material (D3 continua: sem
  política de limpeza de objetos).

### 3. CORS (repita por bucket)

**Settings → CORS policy**, com a origem do ambiente da tabela:

```json
[
  {
    "AllowedOrigins": ["https://teste.brandplay.com.br"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type", "content-length", "content-md5"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- `ExposeHeaders: ["ETag"]` é obrigatório: no upload multipart, o navegador
  lê o ETag de cada parte e o devolve à Edge Function para concluir o envio.
  Sem ele, o envio sobe e não fecha.
- Uma origem por bucket, sem `*`. O bucket local só aceita
  `http://localhost:8080`, e os hospedados, só o domínio do próprio portal.
- `DELETE` fica de fora: o navegador não apaga nada no bucket.

### 4. Chave da API (repita por ambiente)

**R2 → Manage R2 API Tokens → Create API token**:

- Permission: **Object Read & Write**.
- Specify bucket(s): **Apply to specific buckets only** → só o bucket do
  ambiente.
- TTL: sem expiração, ou com a data em que a chave será trocada.

A tela mostra uma única vez o **Access Key ID** e o **Secret Access Key**.

### 5. Onde guardar

No Dockploy, no serviço **Compose do Supabase** do ambiente (o mesmo das
chaves do Stripe):

| Variável               | Valor                                 |
| ---------------------- | ------------------------------------- |
| `R2_ACCOUNT_ID`        | Account ID da conta                   |
| `R2_ACCESS_KEY_ID`     | Access Key ID da chave do ambiente    |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key da chave do ambiente |
| `R2_BUCKET`            | nome do bucket do ambiente            |

Local: as mesmas variáveis em `docker/supabase/.env`, com a chave do bucket
`brandplay-midia-dev`.

Até a BP-7.05 ligar essas variáveis ao serviço `functions` no compose,
preencher o Dockploy não muda nada no ambiente. Pode ser feito antes.

Nunca:

- commitar a chave, colar em PR, issue, Plane ou conversa;
- usar o prefixo `VITE_`: a chave é só do servidor (RNF4);
- criar chave com acesso à conta inteira ou a todos os buckets;
- reaproveitar a chave de um ambiente em outro.

## Limites e custos para conferir

Valores de referência, a confirmar na página de preços da Cloudflare antes de
contratar:

- Armazenamento Standard: ~US$ 0,015 por GB-mês. Download sem custo.
- Operações classe A (escrita, incluindo cada parte do multipart): ~US$ 4,50
  por milhão. Classe B (leitura): ~US$ 0,36 por milhão.
- Faixa grátis por mês: 10 GB armazenados, 1 milhão de classe A e 10 milhões
  de classe B.
- Multipart: parte mínima de 5 MiB (menos a última), máxima de 5 GiB, até
  10.000 partes. Com partes de 64–100 MB, uma edição de 60 GB dá de 600 a
  940 partes.
- URL pré-assinada funciona só pelo endereço da API
  (`<ACCOUNT_ID>.r2.cloudflarestorage.com`), não por domínio próprio, e não
  passa pelo cache da CDN.

## Trocar uma chave

1. Crie a chave nova (passo 4) para o mesmo bucket.
2. Troque `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY` no Dockploy e publique
   o Compose do Supabase.
3. Confira um envio pelo portal e só então apague a chave antiga na
   Cloudflare.

URLs já emitidas com a chave antiga param de valer quando ela é apagada. Por
isso a troca é feita fora do horário de envio de material.
