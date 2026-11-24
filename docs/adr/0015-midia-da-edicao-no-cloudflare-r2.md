# ADR-0015: Mídia da edição no Cloudflare R2, por URL pré-assinada

Status: Accepted

## Contexto

A feature BP-7 (análise de mídia da edição) recebe o material bruto de cada
edição de um projeto: por volta de 60 GB, principalmente vídeo, em arquivos
de dezenas de GB. O Supabase Storage do stack (ADR-0001, ADR-0006) não serve
para isso:

- `FILE_SIZE_LIMIT` de 50 MB e `STORAGE_BACKEND: file`, no disco da VPS;
- trocar o backend para S3 ainda faria todo upload e download passar pelo
  container `storage` na VPS, que vira gargalo de banda e de disco
  temporário;
- Edge Function não processa nem faz proxy de vídeo de horas.

Fornecedores avaliados na própria BP-7 (seção 6.3): Backblaze B2, Cloudflare
R2, S3 EUA-Leste, S3 São Paulo, Wasabi e Magalu Cloud. O R2 foi escolhido
(decisão D2 da feature): download sem custo e sem regra de proporção, API S3
com multipart e URL pré-assinada.

## Decisão

1. **O vídeo e as fotos da edição vão direto entre o navegador e o R2**, por
   URL pré-assinada (SigV4, só o header `host` assinado, corpo
   `UNSIGNED-PAYLOAD`). Nada passa pela VPS. Os 11 buckets do Supabase
   Storage ficam como estão.
2. **Quem assina é a Edge Function `midia-r2`**, depois de conferir a
   permissão:
   - usuário do JWT; organização da linha da mídia, nunca do corpo;
   - a mídia é lida com o token do usuário: sem linha visível pela RLS da
     0049 (outra organização, cobrança bloqueada, portal do patrocinador),
     não há URL;
   - enviar exige escrita no módulo `crm` ou `operacional` e mídia não
     arquivada;
   - o caminho do objeto é o do banco (`storage_prefix`/`object_key`,
     montados por gatilho com identificadores, D10).
3. **O tamanho que conta é o do R2.** Ao concluir o multipart, a função faz
   HEAD no objeto e grava `size_bytes` em `edition_media_objects`, que só o
   servidor escreve. O uso por organização (`edition_storage_usage`) é a soma
   disso, nunca o tamanho informado pelo navegador (RNF2).
4. **Validade curta**: 15 minutos para cada parte do envio (o navegador pede
   as URLs em lotes de até 100 partes), 60 minutos para leitura (cobre um
   vídeo tocando do começo ao fim, com requisições de faixa), 5 minutos para
   as chamadas do próprio servidor.
5. **Um bucket privado e uma chave por ambiente**, com dica de localização
   ENAM, CORS só com a origem do portal do ambiente (e `ETag` exposto, sem o
   qual o multipart não fecha), chave Object Read & Write restrita ao bucket.
   Passo a passo: `docs/runbooks/armazenamento-r2.md`.
6. **Assinatura própria, sem dependência**: `_shared/s3.ts`, com WebCrypto,
   testada contra o exemplo de URL pré-assinada da documentação da AWS.
7. **Localmente, o MinIO faz o papel do R2** (profile `midia` do compose
   local). A função fala com ele pela rede do compose e entrega ao navegador
   URLs para a porta publicada; por isso existem `R2_ENDPOINT` e
   `R2_PUBLIC_ENDPOINT`, vazios nos ambientes hospedados.

## Consequências

- Uma superfície de segurança nova: a função que assina. Coberta pela
  checagem de RLS acima e pelo roteiro de ponta a ponta
  `supabase/tools/testar-midia-r2.mjs` (outra organização, papel sem módulo,
  mídia arquivada, sem login).
- O patrocinador ainda não recebe URL nenhuma. Leitura pelo portal só de mídia
  em relatório publicado da marca dele (D11), quando a integração com o
  relatório existir (BP-7.16).
- URL pré-assinada do R2 só funciona pelo endereço da API
  (`<conta>.r2.cloudflarestorage.com`), sem cache da CDN. Se um dia for
  preciso servir mídia pública com cache, é outra decisão.
- Envio interrompido deixa partes no R2 até a regra de lifecycle abortar o
  multipart; a linha do objeto fica `erro` ou `enviando` e o próximo
  `iniciar` da mesma variante aborta o anterior e recomeça.
- Sem política de limpeza de objetos (D3): o custo cresce com o uso até o
  limite por plano existir. O consumo já aparece em Plano e cobrança
  (BP-7.17).
- O MinIO comunitário parou de publicar imagens em 2025. Ele fica só no
  ambiente local, com tag fixa; se a tag deixar de existir, troca-se por
  outro S3 local sem mudar a função.
