# Plano: relatórios HTML de projeto

- **Data**: 2026-10-18; decisões fechadas em 2026-10-23
- **Status**: **abordagem híbrida aprovada em 2026-10-23**, com as decisões da
  seção 9. Fases 2 e 3 (parcial) entregues em 2026-10-28 na branch
  `feature/relatorio-landing-page`: ADR-0011, regras em
  `docs/business/relatorios.md` (seção 12). A fase 1 desta branch foi
  substituída pelo kit de marca da `0034_marca_da_organizacao.sql`.
- **Escopo**: relatório em formato de landing page gerado a partir de uma
  propriedade (`sports_properties`, categorias Evento, Campeonato, Projeto,
  Equipe e Atleta), com as cores da organização, compartilhamento controlado e
  endereço permanente.
- **Referências analisadas** (baixadas em 2026-10-18):
  `relatorio-scp.scoutsports.com.br` e `relatorio-scp-claro.scoutsports.com.br`.

## 1. Resumo

1. **Não gerar o HTML com IA.** Gerar a página inteira custa de 5 a 10 vezes
   mais que a alternativa. Mais importante: entrega números que o modelo pode
   errar, HTML não confiável servido no nosso domínio, dados congelados (sem
   tempo real), geração mais lenta que o limite de 5 minutos das Edge
   Functions e uma página única por relatório, impossível de corrigir em lote.
2. **Também não criar dezenas de templates fechados.** Cada um teria de tratar
   todas as combinações de dado ausente e de cor, e a manutenção cresce com o
   número de templates.
3. **Recomendação: híbrido.** Um motor de blocos (≈ 18 tipos de seção, 2 ou 3
   variantes cada), 3 estilos visuais e um tema derivado das cores da
   organização. Os **números saem sempre do banco**. A IA (Claude, com saída
   estruturada) só escolhe a ordem e a variante dos blocos que têm dado e
   escreve títulos e insights. O custo fica em ~US$ 0,24 por geração com Opus
   5.5 (~US$ 0,12 com Sonnet 5.5). O modelo usado é o do nível `padrao` da
   credencial da organização, pela camada de IA (`plano-ia-por-cliente.md`).
4. **A IA é opcional no fluxo.** As fases 1 a 4 entregam relatórios completos
   com seleção por regras e textos do próprio projeto. A IA entra depois, como
   melhoria, sem bloquear o lançamento.
5. **Endereço**: `brandplay.com.br/r/<cliente>/<projeto>`, sem mudar a
   infraestrutura (decisão D6). O subdomínio `<cliente>.brandplay.com.br`
   fica adiado: exige migrar a zona DNS, hoje no Registro.br (seção 5.8).
6. **Postagens em tempo real**: o YouTube é simples (chave de API). Instagram,
   Facebook e TikTok só fornecem métricas de contas que o cliente **conecta**
   por OAuth, e dependem de App Review da Meta e do TikTok. "Tempo real"
   significa, na prática, cache de 15 a 60 minutos com "atualizado às hh:mm".

## 2. O que os exemplos mostram

| | Exemplo 1: SCP 2026 | Exemplo 2: SCP × Claro |
|---|---|---|
| Natureza | Relatório **da propriedade** (temporada), para mercado e patrocinadores | Relatório **do patrocinador**: prestação de contas de um contrato |
| Construção | HTML estático escrito à mão, 104 KB (41 KB de CSS inline, 5 KB de JS) | **Template + dados**: `index.html` (18 KB de marcação), JSON embutido `evidence-data` (134 KB), `app.js` (25 KB), `styles.css` (50 KB) |
| Mídia | 54 imagens, 12 vídeos do YouTube (`youtube-nocookie`), 8 reels do Instagram | 139 fotos com legenda, momento e tags; 14 vídeos; 6 posts com métricas |
| Seções | Capa, números, patrocinadores por nível, resumo, jornada, Netflix, público (cidade, idade, gênero), territórios, painel social, earned media, transmissão, experiências, imprensa, top 10 conteúdos, final, depoimentos, contato, PDF | Capa, números, jornada, contexto, Netflix, digital, acervo filtrável, ação especial com métricas, **matriz de entregas (37 contrapartidas)**, fontes e documentos, PDF |

O que isso indica:

- **O exemplo 2 já é o modelo híbrido.** Dados separados do código: 139
  `assets`, 37 `requirements` (contrapartidas com status e fotos), 30 `groups`
  (por momento), 20 `dossiers`, `documents`, `videos` e `posts`. URLs como
  `chatgpt.com/api/library/...` e `*.chatgpt.site` no JSON sugerem montagem
  manual assistida por IA, peça a peça, e não uma geração automática.
- **Os dois tipos de relatório cabem no domínio do BrandPlay**: o da
  propriedade usa `sports_properties`, `property_events`, cotas e mídia; o do
  patrocinador usa `contracts`, `deliveries`, `delivery_attachments` e
  aprovação, que já existem.
- **Boa parte dos números do exemplo 1 vem de fora da plataforma** (TNT,
  Google Analytics, demografia do Instagram, Netflix). Eles precisam de
  **indicadores manuais com fonte**, não só de integração.

## 3. O que já existe e o que falta

| Necessidade | Já existe | Falta |
|---|---|---|
| Projeto do evento | `sports_properties` (datas, locais, público, participantes, times, premiação, `social_links`, `social_stats`, capa e chamada públicas, temporadas por `parent_property_id`) | — |
| Momentos (jornada) | `property_events` | Vincular foto a momento (`property_media` não tem `event_id`) |
| Fotos e vídeos | `property_media` (inclui `external_url`), `asset_photos`, `delivery_attachments`, `brandtrack_media` | Legenda e tags por foto, prioridade |
| Patrocinadores | `tier_sales`, `sponsorship_tiers.level`, `sponsors`, bucket `sponsor-logos` | — |
| Entregas e evidências | `deliveries`, `delivery_attachments`, `delivery_approval_log` | — |
| Postagens com métricas | Só seguidores por rede, coletados por scraping (`fetch-social-stats`) | Tabela de postagens, métricas por post, conexão com as redes |
| Indicadores externos | — | Indicadores manuais com fonte e período |
| Imprensa e depoimentos | — | Tabela própria |
| Cores do cliente | `organizations.logo_path` | Cores, fonte e slug da organização |
| Página pública | Media kit `/p/:slug` (leitura `anon` por policy) | Rota de relatório com acesso por modo |
| Relatórios atuais | `reportFullHtml.ts` (financeiro, abre e imprime), `sellout_reports` + `generate-sellout-report` (markdown por IA) | Relatório publicável e permanente |
| Envio de e-mail | `_shared/email.ts` (Resend) | Contatos e grupos de envio |

## 4. Abordagens de geração

### 4.1 Opções

| Opção | Como funciona | A favor | Contra |
|---|---|---|---|
| **A. IA gera o HTML inteiro** | Claude recebe os dados e escreve a página completa | Visual único por relatório; nenhum template a manter | Números podem sair errados; HTML/JS não confiável no nosso domínio (XSS, injeção de prompt vinda de legendas e descrições); dados congelados; 30 a 110 mil tokens de saída levam vários minutos, acima dos 5 min do edge runtime (`supabase/functions/main/index.ts:34`); o exemplo 2 chega perto do teto de 128 mil tokens de saída; ajustar um texto exige regerar; um bug de layout só se corrige relatório por relatório; qualidade varia entre gerações |
| **B. Dezenas de templates fechados + seleção por regra** | Cada template é uma página pronta; regras escolhem o mais adequado | Custo zero de IA; previsível | Cada template trata sozinho dado ausente, cor e responsividade; manutenção multiplicada; variedade limitada ao que foi desenhado; "o mais adequado" já é escolha por regra, que a opção C também faz |
| **C. Híbrido: blocos + tema + IA estruturada** (recomendada) | Um renderizador React com ~18 blocos e 3 estilos; regras de visibilidade por dado; IA opcional escolhe ordem e variante e escreve os textos em JSON validado por schema | Números sempre do banco; tema da marca aplicado em tudo; tempo real natural; um bug corrigido vale para todos; texto editável pelo usuário; IA barata e descartável | Exige desenhar bem o catálogo de blocos; o visual é menos "único" que o da opção A |
| D. Editor visual (Puck, GrapesJS, Craft.js) | O usuário monta a página arrastando blocos | Liberdade total | Dependência nova; a qualidade passa a depender do usuário; reordenar, ocultar e editar texto na opção C cobre a maior parte disso |
| E. Ferramenta externa (Gamma, Canva, Webflow, Looker Studio) | Exportar dados e montar fora | Rápido para um caso isolado | Não é multi-tenant, os dados saem da plataforma, sem RLS e sem tempo real; custo por assento e marca de terceiros |

Uso de IA **em desenvolvimento**, e não em produção: o Claude pode ajudar a
desenhar os blocos e os estilos da opção C, o que dá variedade visual sem o
risco de gerar a página em tempo de uso.

### 4.2 Custo estimado

Preços da API da Anthropic (consulta de 2026-10-18, US$ por milhão de tokens):
Opus 5.5 4/20, Sonnet 5.5 2/10, Haiku 5.5 0,10/0,50 (entrada/saída); leitura
de cache 0,20 em Opus 5.5 e Sonnet 5.5; Batch API com 50% de desconto.

Premissas: ~3,1 a 3,2 caracteres por token para HTML, CSS, JS e JSON (o
tokenizer dos modelos atuais pode gerar até ~35% mais, e por isso as faixas);
thinking adaptativo contado como saída (10 a 15 mil tokens). O exemplo 1 dá
≈ 30 a 45 mil tokens de saída; o exemplo 2, ≈ 65 a 95 mil. **São estimativas**:
medir com `count_tokens` e com amostras reais antes de fixar preço de plano.

Cenário mensal: 50 organizações × 4 relatórios × 3 gerações (ajustes) = 600
gerações por mês.

| Abordagem | Modelo | Por geração | Por relatório (3 gerações) | 600 gerações/mês |
|---|---|---|---|---|
| A, porte do exemplo 1 | Opus 5.5 | US$ 0,95 a 1,20 | US$ 2,85 a 3,60 | US$ 570 a 720 |
| A, porte do exemplo 2 | Opus 5.5 | US$ 1,90 a 2,35 | US$ 5,70 a 7,05 | US$ 1.140 a 1.410 |
| A, porte do exemplo 1 | Sonnet 5.5 | US$ 0,47 a 0,59 | US$ 1,40 a 1,80 | US$ 280 a 355 |
| A, porte do exemplo 2 | Sonnet 5.5 | US$ 0,94 a 1,17 | US$ 2,80 a 3,50 | US$ 565 a 700 |
| **C, só curadoria e textos** | **Opus 5.5** | **~US$ 0,24** | **~US$ 0,72** | **~US$ 145** |
| C, só curadoria e textos | Sonnet 5.5 | ~US$ 0,12 | ~US$ 0,36 | ~US$ 72 |
| B ou C sem IA | — | US$ 0 | US$ 0 | US$ 0 |

Na opção C, a entrada é um resumo dos dados do projeto (10 a 25 mil tokens) e
a saída é um JSON de 4 a 8 mil tokens. Regerar uma seção custa centavos.

Legendas e tags de fotos por visão (opcional, **uma vez por foto**, no upload,
não por relatório): as 139 fotos do exemplo 2 somam ≈ 170 mil tokens de
entrada, o que dá ≈ US$ 0,03 com Haiku 5.5, ≈ US$ 0,50 com Sonnet 5.5 e
≈ US$ 1,00 com Opus 5.5, com metade disso pela Batch API.

**Conclusão**: a IA é viável nas duas abordagens, e o custo da opção C é
desprezível perto do preço de um plano. O que decide contra a opção A é
fidelidade, segurança, tempo real, latência e manutenção (seção 4.1), não o
preço.

### 4.3 Escolha de modelo (decisão D9)

Resolvida pela camada de IA aprovada em 2026-10-20
(`docs/architecture/plano-ia-por-cliente.md`, migrations `0031` e `0032`): a
feature **não** escolhe modelo nem fornecedor.

- `report-generate` chama `_shared/ai.ts` com o nível `padrao`, e as legendas
  de fotos, com o nível `visao`. O modelo de cada nível vem da credencial da
  organização (chave padrão da plataforma ou exclusiva), trocável pelo
  superadmin.
- O custo entra em `ai_usage_events` e no orçamento mensal em R$ da
  organização (`ai_org_settings`). Organização com cobrança bloqueada não usa
  IA, pela regra da própria camada.
- A tabela 4.2 serve de referência de custo para a chave padrão. Com a chave
  padrão na Anthropic, Opus 5.5 ou Sonnet 5.5 no nível `padrao` dão os
  valores da opção C.
- Requisito para a camada: saída JSON validada por schema (o parâmetro `json`
  de `ia.gerar`) nos três fornecedores, porque a validação dos números
  (seção 5.11) depende dela.

## 5. Arquitetura proposta

### 5.1 Visão geral

```
Editor (portal, membro) ──► reports (rascunho: blocos + textos)
        │                         │ publicar = snapshot dos dados
        │ "Gerar com IA"          ▼
        └──► report-generate ──► Claude (JSON validado) ──► textos e ordem dos blocos

Visitante ──► /r/<org>/<slug>  ou  <org>.brandplay.com.br/<slug>
        │   (mesma SPA do portal; nenhum HTML gerado é servido)
        ▼
   report-view (Edge Function) ── valida membro (JWT) ou sessão do relatório
        │                          devolve só os campos permitidos por bloco,
        │                          URLs assinadas de mídia privada e métricas em cache
        ▼
   Renderizador de blocos + tema da organização
```

### 5.2 Identidade visual da organização

- Novas colunas em `organizations`: `slug`, `brand_primary_color`,
  `brand_secondary_color`, `brand_accent_color` (hex validado por `check`) e
  `brand_font` (lista curada de pares de fontes). A escrita segue a policy
  `organizations_admin_update` (owner e admin). As fontes vêm do Google Fonts,
  como as do próprio portal (`index.html`); servi-las do próprio portal, para
  que a página pública não faça requisição ao Google, fica para a fase 3.
- `portal/src/lib/brandTheme.ts`, puro e testável: deriva a paleta (tons,
  texto sobre cada cor com contraste WCAG AA de 4,5:1, fundo claro e escuro) e
  cai na paleta do BrandPlay quando a organização não definiu cores.
- Coleta no onboarding (`OrganizationSetup`), com o aviso de que relatórios e
  demais páginas sairão com as cores da empresa, e edição em Configurações →
  Identidade visual, com prévia. Como todo login passa pelo onboarding
  (`Auth.tsx`), a etapa aparece para owner/admin de organização sem nenhuma
  cor e, se pulada, não volta naquele navegador para aquela organização. Extrair as cores do logo automaticamente
  (canvas, sem dependência) fica como melhoria posterior.
- Depois dos relatórios, o mesmo tema pode valer para o media kit público e
  para o portal do patrocinador.

### 5.3 Catálogo de blocos (versão inicial)

| Bloco | Fonte dos dados | Aparece quando |
|---|---|---|
| Capa | `sports_properties` (nome, `public_headline`, capa, temporada, datas, locais) + logo da organização | Sempre |
| Números principais | `participants_count`, `teams_count`, `audience_estimate`, `fans_count`, `prize_pool`, nº de `property_events`, seguidores, indicadores manuais em destaque | ≥ 2 números preenchidos |
| Resumo e insights | Texto da IA ou manual; `about`/`public_about` | Há texto |
| Patrocinadores por nível | `tier_sales` ativas → `sponsors` + `sponsor-logos`, agrupados por `sponsorship_tiers.level` | ≥ 1 patrocinador |
| Jornada | `property_events` em ordem + fotos vinculadas ao momento | ≥ 2 momentos |
| Vídeo em destaque | Post ou mídia do YouTube | Há vídeo |
| Painel social | `property_posts` + conexões por rede | ≥ 1 rede com número |
| Top conteúdos | `property_posts` por visualizações | ≥ 3 posts com métrica |
| Reels e vídeos curtos | Embeds de `property_posts` (Instagram, TikTok) | ≥ 1 post |
| Ativações e experiências | `deliveries` entregues ou aprovadas + `delivery_attachments` | ≥ 1 entrega com foto |
| Marca em campo | Evidências de `brandtrack_detections` + `asset_photos` | ≥ 3 fotos |
| Público | Indicadores manuais da categoria público (cidade, idade, gênero) | Há dados |
| Na imprensa | `property_mentions` (imprensa) | ≥ 1 matéria |
| Depoimentos | `property_mentions` (depoimento) | ≥ 1 |
| Prestação de contas (patrocinador) | `deliveries` do contrato: status, aprovação, evidências, filtro por momento | Relatório do patrocinador |
| Documentos (patrocinador) | `sponsor_documents` marcados como compartilháveis | ≥ 1 marcado |
| Contato | Telefone, e-mail e site da organização (botão de WhatsApp) | Há contato |
| Rodapé | Logo, "gerado em", "dados atualizados em" | Sempre |

Estilos iniciais: **esportivo escuro** (como o exemplo 1), **editorial claro**
(como o exemplo 2) e **corporativo**. Todos leem o mesmo tema da marca.

### 5.4 Dado em branco

- `null`, texto vazio e lista vazia não aparecem; um bloco sem dado mínimo
  (tabela 5.3) some inteiro.
- **Decisão D8**: `0` em métricas de contagem (público, seguidores, views,
  participantes, times) é tratado como não preenchido, porque o cadastro atual
  usa `0` como padrão em vários campos. Cada indicador manual pode marcar
  "exibir zero".
- O editor mostra uma lista de completude: quais blocos vão aparecer e qual
  dado falta para os outros.

### 5.5 Snapshot e dados ao vivo

- **Rascunho**: prévia com os dados atuais do projeto.
- **Publicar**: grava um snapshot (números, mídias escolhidas, textos). Assim
  uma edição em andamento no projeto não aparece sem querer para o
  patrocinador. O botão "Atualizar dados" republica.
- **Ao vivo**: métricas de postagens, lidas do cache a cada visita, com
  "atualizado às hh:mm".
- Decisão D1.

### 5.6 Mídia

Prioridade: vídeo do YouTube → post ou reel de rede social → vídeo enviado →
foto com legenda → foto sem legenda.

- Mídia de bucket privado (`delivery-evidence`, `brandtrack-media`) só sai
  como URL assinada de curta duração, gerada pela `report-view` a cada visita.
  Por isso o relatório não pode ser um HTML estático: a URL assinada expira.
- Embeds com fachada: miniatura e "clique para carregar". Os scripts do
  Instagram e do TikTok são pesados e colocam cookies de terceiros. YouTube
  pelo domínio `youtube-nocookie.com`, como nos exemplos.
- Fotos redimensionadas pelo `imgproxy` que já está no stack.
- **Decisão D10, imagens de menores**: as tabelas de mídia usadas pelos blocos
  ganham a marcação "contém menores". No modo público essas mídias não
  aparecem; nos modos com senha, por e-mail e só da organização, aparecem.

### 5.7 Postagens em tempo real

| Rede | Acesso | Métricas | Esforço |
|---|---|---|---|
| YouTube | Chave da Data API v3; `videos.list` custa 1 unidade e aceita até 50 vídeos; cota padrão de 10.000 unidades/dia | Views, likes e comentários de qualquer vídeo público | Baixo |
| Instagram | Conta profissional do cliente conectada por OAuth; permissão de insights exige App Review da Meta | Views, alcance, likes, comentários, compartilhamentos e salvamentos de mídia **da própria conta**; atraso de até 48 h; post de terceiros só como embed (oEmbed com App Review; sem miniatura desde 2025) | Médio a alto |
| TikTok | Display API, login do criador, escopo `video.list`; token de 24 h com renovação | `view_count`, `like_count`, `comment_count`, `share_count` dos vídeos do usuário autorizado | Médio |
| Facebook | Página conectada (Pages API) | Métricas da página e dos posts | Médio |
| X, LinkedIn | API paga ou restrita | Só métrica manual | — |

- Toda postagem aceita **métrica manual** com fonte e data, que é a saída
  para rede sem integração e para post de terceiros.
- Atualização agendada (de 15 a 60 min, conforme a rede) gravando cache e
  histórico. A visita ao relatório **nunca** chama a rede social diretamente.
- O scraping de `fetch-social-stats` não serve de base: viola os termos das
  redes, quebra sem aviso e hoje a função busca qualquer URL sem autenticação
  (seção 10).

### 5.8 Endereços

- **Decisão D6: só o caminho por enquanto.**
  `https://brandplay.com.br/r/<org>/<relatorio>` (e
  `https://teste.brandplay.com.br/r/...` em homologação). A mesma SPA, sem
  mudança de infraestrutura (o `serve -s` já devolve o `index.html`). O prefixo
  `/r/` evita colisão com `/dashboard`, `/portal`, `/admin`, `/p` e outras
  rotas. Esse endereço continua valendo para sempre, mesmo se o subdomínio for
  adotado depois.
- **Subdomínio, adiado (fase 7)**: `https://<org>.brandplay.com.br/<relatorio>`,
  apontando para o mesmo container do portal. A zona de `brandplay.com.br`
  está no Registro.br (nameservers `d.sec.dns.br` e `f.sec.dns.br`, consulta
  de 2026-10-23), que não tem API para o desafio DNS-01. Requisitos para
  retomar:
  1. registro DNS curinga `*.brandplay.com.br` para o IP da VPS;
  2. certificado curinga do Let's Encrypt, **só emitido por desafio DNS-01**,
     o que exige migrar a zona para um provedor com API (Cloudflare, Route 53
     etc.), copiando antes todos os registros atuais, inclusive MX;
  3. router do Traefik por `HostRegexp` para o portal, configurado no
     Dockploy, fora do repositório (registrar em `docs/runbooks/deployment.md`);
  4. lista de slugs reservados (`www`, `db`, `teste`, `api`, `app`, `admin`,
     `portal`, `mail`, `studio` e afins); `db` e `teste` já estão em uso;
  5. em homologação, só o formato por caminho: `*.teste.brandplay.com.br`
     exigiria um segundo certificado curinga, porque um curinga cobre um nível só.
- **Sessão**: a sessão do Supabase vive no `localStorage` de
  `brandplay.com.br`, então no subdomínio o membro não está logado. Relatório
  "só organização" aberto pelo subdomínio leva a `brandplay.com.br/r/...`. Os
  modos com senha e por e-mail usam sessão própria do relatório e funcionam em
  qualquer host.
- O slug da organização fica fixo depois do primeiro relatório publicado:
  trocar quebraria links já enviados.
- Domínio próprio do cliente (`relatorios.cliente.com.br`) fica fora do escopo.

### 5.9 Acesso e compartilhamento

| Modo | Quem acessa | Como |
|---|---|---|
| Só a organização | Membros ativos | Login no BrandPlay (JWT) |
| Pessoas específicas | E-mails da lista (contatos e grupos de envio) e membros | Código de 6 dígitos por e-mail (Resend) → sessão do relatório |
| Com senha | Quem tem link e senha; membro logado entra direto | Senha definida pelo autor → sessão do relatório |
| Público | Qualquer pessoa com o link | Sem barreira; `noindex` por padrão, indexação opcional |

- **Membro entra direto (decisão D5)**: membro ativo da organização, logado,
  vê o relatório em qualquer modo, sem senha nem código. Decorre do requisito:
  a senha é pedida a quem acessa "sem estar logado".
- **Papéis (decisão D4)**:

  | Ação | Quem |
  |---|---|
  | Ver relatórios da organização | Qualquer membro ativo |
  | Criar e editar rascunho; publicar ou atualizar no modo "só a organização" | owner, admin, comercial, operacional (os papéis que já editam a propriedade) |
  | Publicar, atualizar ou passar para os modos público, senha ou pessoas; definir ou trocar a senha; enviar o link | owner, admin |
  | Excluir | owner, admin |

  "Atualizar dados" num relatório já publicado num modo externo é publicar:
  fica com owner e admin. **Suposição**: contatos e grupos de envio são
  editados pelos mesmos papéis que editam rascunhos; só o envio é de owner e
  admin.
- **Organização bloqueada por cobrança (decisão D2)**: os relatórios
  publicados nos modos público, senha e pessoas **continuam no ar**, a mesma
  regra do Media Kit público e do portal do patrocinador
  (`docs/business/cobranca.md`). Criar, editar e publicar ficam bloqueados,
  pela `billing_access_restrictive`. No modo "só a organização", que é parte
  do painel, o membro vê o mesmo "Acesso suspenso" do painel.
- **Visitante não vira usuário do Supabase.** Criar `auth.users` para
  convidados acionaria `handle_new_user`, perfis e fluxos de onboarding
  pensados para membros. O acesso por código é um mecanismo próprio e mínimo.
- Sessão do relatório: token aleatório guardado só como hash, válido por 30
  dias. Trocar a senha ou remover o e-mail da lista revoga. A senha nunca vai
  na URL.
- Senha com bcrypt (`pgcrypto`, já instalado); código com hash, validade de 10
  min e 5 tentativas; limite de tentativas por IP e relatório; resposta igual
  para e-mail fora da lista (sem enumeração).
- **Contatos e grupos de envio** por organização (nome, e-mail, empresa,
  patrocinador opcional), com importação de `sponsor_contacts`. "Enviar link"
  manda o e-mail pelo `_shared/email.ts`.
- Relatório de patrocinador também aparece em `PortalReports` para quem tem
  `sponsor_portal_access` daquele patrocinador.
- Log de acesso (quando, modo, e-mail no modo por pessoa) dá à organização o
  número de visualizações e quem abriu, com retenção limitada (LGPD).

### 5.10 Exclusão

- Exclusão lógica (`status = 'excluido'`, `deleted_at`, `deleted_by`). O
  endereço passa a mostrar: **"Este relatório não está mais disponível. Entre
  em contato com o responsável pela conta."**
- O slug excluído continua reservado e nunca é reaproveitado, para que um link
  antigo não mostre outro conteúdo.
- As sessões do relatório são revogadas. Não há exclusão física pela tela.

### 5.11 IA no fluxo (fase 5)

- `report-generate` recebe só o `report_id`. A organização é lida do banco e o
  papel é conferido para o `user.id` do JWT.
- Entrada: resumo do projeto com números já calculados, mídias com legenda,
  posts com métricas e entregas, **sem valores financeiros e sem notas
  internas**.
- Saída em JSON validado por schema: blocos permitidos (só os que têm dado),
  variante, ordem, títulos e de 3 a 6 insights. **Os insights citam chaves de
  métrica (`{{views_total}}`) em vez de escrever números**; o renderizador
  insere o valor do banco. Um texto com número que não existe nos dados é
  recusado.
- Legenda, descrição e título do projeto são entrada não confiável (injeção de
  prompt). O modelo não tem ferramentas, a saída é texto renderizado com
  escape, e um humano revisa antes de publicar.
- Chamada pela camada de IA (`_shared/ai.ts`, nível `padrao`; legendas no
  nível `visao`): uso registrado em `ai_usage_events` e limitado pelo
  orçamento mensal da organização. Sem cota própria de relatórios (decisão D3).

## 6. Modelo de dados (migrations previstas)

A numeração sai da próxima livre na hora de implementar; as letras abaixo só
ordenam. A A virou a `0034_identidade_visual_organizacao.sql`.

| Migration | Conteúdo | RLS |
|---|---|---|
| A. `_identidade_visual_organizacao` | `organizations`: `slug` (único, gerado do nome com `unaccent`, formato validado, lista reservada, fixo depois do primeiro relatório publicado), cores e fonte | Já coberta por `organizations_admin_write` |
| B. `_conteudo_do_projeto` | `property_posts` (rede, URL, id externo, momento, patrocinador, destaque, métricas, origem `api`/`manual`, `metrics_fetched_at`), `property_indicators` (rótulo, valor, unidade, formato, fonte, período, categoria, patrocinador, `show_zero`), `property_mentions` (imprensa ou depoimento); `property_media.event_id`; `contains_minors` nas mídias lidas pelos blocos (`property_media`, `delivery_attachments`, `asset_photos`) | Padrão 7, com os mesmos módulos que já escrevem nas tabelas da propriedade (`crm` ou `operacional`) + `billing_access_restrictive` |
| C. `_relatorios` | `reports` (propriedade, patrocinador e contrato opcionais, período, tipo, estilo, slug, modo de acesso, status, rascunho, snapshot publicado, dados de IA); `report_recipients`; `share_contacts`, `share_groups`, `share_group_members`. **Sem limite por plano** (decisão D3) | Leitura por membro; escrita por owner, admin, comercial e operacional; gatilho que exige owner/admin para mudar para modo externo, publicar ou atualizar um relatório externo, trocar senha e excluir (decisão D4); sem `DELETE` físico; `billing_access_restrictive`; **nenhuma policy para `anon`** |
| D. `_acesso_aos_relatorios` | `report_secrets` (hash da senha e versão), `report_viewer_codes`, `report_viewer_sessions`, `report_access_log` | RLS ligada e sem policy; só `service_role`, como a cobrança (padrão 8) |
| E. `_conexoes_sociais` (fase 6) | `social_connections` (metadados legíveis por owner/admin; token cifrado com AES-GCM na Edge Function, como `ai_credentials`); histórico de métricas por post | Padrão 4 para metadados; segredo só no servidor |

Edge Functions previstas:

| Função | Autenticação | Responsabilidade |
|---|---|---|
| `report-view` | Pública | Valida JWT de membro **ou** sessão do relatório; devolve só os campos permitidos por bloco; assina URLs de mídia privada; lê métricas do cache; trata `excluido` |
| `report-access` | Pública | Senha → sessão; pedido e validação de código → sessão; limites de tentativa |
| `report-generate` | JWT | Seção 5.11 |
| `report-share` | JWT | Envia o link aos destinatários |
| `social-metrics-refresh` | Interna, agendada | Atualiza métricas por rede |

## 7. Segurança

- A única porta para quem não é membro é a `report-view`, com lista explícita
  de campos por bloco. Não usar policies `_public_read` como no media kit:
  policy não consegue conferir senha nem código.
- A `report-view` usa `service_role`, então deriva tudo do `report_id` e nunca
  aceita `organization_id` vindo do cliente.
- Nenhum HTML gerado por IA ou pelo usuário é servido. Textos com escape do
  React; se houver formatação, markdown restrito e sanitizado.
- **Nada financeiro, nunca (decisão D7)**: nenhum bloco lê valor de
  contrato, parcelas ou valor de cota. A lista de campos da `report-view` não
  inclui nenhum deles, e um teste garante isso.
- CSP na rota de relatório, liberando só os iframes de YouTube, Instagram e
  TikTok.
- **Imagens de menores (decisão D10)**: o exemplo 2 tem fotos de crianças com
  uniforme do patrocinador. Mídia marcada "contém menores" nunca sai no modo
  público. A filtragem é feita na `report-view`, não na tela, e o modo padrão
  de um relatório novo é "só a organização".
- Testes SQL em `supabase/tests/`: isolamento de `reports` entre
  organizações, ausência de leitura `anon`, `billing_access_restrictive` nas
  tabelas novas (teste `(m)`), tabelas de acesso sem leitura por
  `authenticated`.

## 8. Plano de implantação

Tamanhos em ordem de grandeza para uma pessoa, sem contar App Review de
terceiros.

| Fase | Entrega | Depende de | Tamanho |
|---|---|---|---|
| 0. Decisões e protótipo | ~~Fechar a seção 9~~ (feito em 2026-10-23); protótipo de um estilo com dados de seed; pedir os App Reviews da Meta e do TikTok (demoram semanas) | — | 2 a 4 dias |
| 1. Identidade visual (**feita**, seção 12) | Migration A; `brandTheme.ts` com testes; Configurações → Identidade visual; etapa no onboarding | 0 | 1 semana |
| 2. Conteúdo do projeto | Migration B; abas de Postagens (com métrica manual), Indicadores e Imprensa e depoimentos, como componentes novos (o `PropertyDetail.tsx` já tem 3.194 linhas); foto ligada a momento; marcação "contém menores" | 0 | 1,5 a 2 semanas |
| 3. Motor e publicação | Migrations C e D (modos organização, senha e público); renderizador com 12 a 15 blocos e 2 estilos; editor (ocultar, reordenar, editar texto, prévia); seleção por regras; snapshot; `report-view` e `report-access`; rota `/r/:org/:slug`; exclusão com mensagem; PDF pela impressão do navegador; `docs/business/relatorios.md`; E2E de publicar, abrir com senha e excluir | 1, 2 | 2,5 a 3 semanas |
| 4. Pessoas específicas | Contatos e grupos; código por e-mail; `report-share`; log de acesso; integração com o portal do patrocinador; relatório do patrocinador (prestação de contas) | 3 | 1,5 a 2 semanas |
| 5. IA | `report-generate` pela camada `_shared/ai.ts` com saída estruturada; regerar seção; validação de números; legendas de fotos em lote (nível `visao`) | 3, camada de IA | 1 a 1,5 semana |
| 6. Métricas em tempo real | YouTube primeiro; depois Instagram, Facebook e TikTok via OAuth, conforme os App Reviews forem aprovados; agendamento e histórico | 2, App Reviews | 2 a 3 semanas |
| 7. Subdomínio por cliente (**adiada**, decisão D6) | Migrar a zona DNS, DNS curinga, certificado DNS-01, roteamento no Traefik, slugs reservados, runbook; opcional: renderização no servidor para pré-visualização de link (OG tags) | 3, migração da zona DNS | 3 a 5 dias + operação |

A ordem 5 → 6 pode inverter se o tempo real for mais importante que a IA para
o lançamento. A fase 5 depende de `_shared/ai.ts`, do backlog da IA por
cliente (`docs/architecture/backlog-ia-por-cliente.md`). Registrar a decisão
de desenho como ADR na próxima numeração livre (as ADRs 0009 e 0010 já
existem).

## 9. Decisões (fechadas em 2026-10-23)

| # | Decisão | Consequência no desenho |
|---|---|---|
| D1 | **Snapshot ao publicar**; só as métricas de postagens são ao vivo | "Atualizar dados" republica (seção 5.5) |
| D2 | **Organização bloqueada: relatórios externos continuam no ar**, como o Media Kit público e o portal do patrocinador | Criar, editar e publicar bloqueados; no modo "só a organização", o membro vê "Acesso suspenso" (seção 5.9) |
| D3 | **Sem limite de relatórios em nenhum plano** | Sem `max_reports` nem gatilho de limite; o custo de IA fica no orçamento da camada de IA |
| D4 | **owner, admin, comercial e operacional criam e editam; só owner e admin publicam fora da organização e excluem** | Gatilho na tabela `reports` (seção 6); tabela de papéis na seção 5.9 |
| D5 | **Membro ativo logado entra direto** em qualquer modo | Decorre do requisito: a senha é para quem acessa sem estar logado |
| D6 | **Só o caminho `/r/<org>/<relatorio>` por enquanto**; subdomínio adiado | Zona DNS no Registro.br, sem API para DNS-01 (seção 5.8); fase 7 adiada |
| D7 | **Nunca mostrar valores financeiros** | Fora da lista de campos da `report-view`, com teste (seção 7) |
| D8 | **Zero conta como em branco** nas contagens, com "exibir zero" por indicador manual | Seção 5.4 |
| D9 | **Modelo definido pela camada de IA** (nível `padrao`; legendas no nível `visao`) | Seção 4.3; a feature não fixa modelo nem fornecedor |
| D10 | **Mídia com menores marcada e bloqueada no modo público**; aparece nos demais modos | Coluna `contains_minors`; filtragem na `report-view`; modo padrão "só a organização" |

Suposição registrada, a confirmar quando a fase 4 começar: contatos e grupos
de envio são editados pelos mesmos papéis que editam rascunhos; só o envio do
link é de owner e admin.

## 10. Riscos

- **App Review** da Meta e do TikTok pode demorar ou ser negado. Mitigação:
  começar por YouTube e métrica manual, e pedir cedo (fase 0).
- **Relatório pobre** em projeto com pouco dado. Mitigação: lista de
  completude no editor.
- **Migração da zona DNS**, se o subdomínio for retomado: copiar errado um
  registro (MX, SPF, DKIM do Resend, os domínios do Supabase) derruba e-mail
  ou o próprio portal. Exige inventário da zona antes de trocar os
  nameservers. O formato por caminho continua funcionando sem isso.
- **Relatórios no ar com a organização bloqueada** (D2) seguem expondo o que
  foi publicado, sem que a organização consiga editar ou excluir enquanto não
  regulariza. Se for preciso retirar um relatório nesse estado, é ação do
  superadmin, a prever na área `/admin`.
- **Custo de IA** sobe de 5 a 10 vezes se, mais tarde, alguém decidir gerar a
  página inteira.
- **Fora deste escopo, encontrado na análise**: `fetch-social-stats` busca
  qualquer URL `http(s)` recebida no corpo, de dentro da rede Docker, sem
  autenticação. A função não confere JWT, o `main` só referencia `VERIFY_JWT`
  (`supabase/functions/main/index.ts:79`), o runtime sobe sem `--verify-jwt`
  (`command` do serviço `functions` no compose), o `.env.example` define
  `FUNCTIONS_VERIFY_JWT=false` e a rota `/functions/v1/` do Kong só tem `cors`.
  É um vetor de SSRF contra serviços internos e precisa de correção própria.

## 11. Validação prevista na implementação

- `npm run lint`, `type-check`, `test` e `build` em cada fase.
- Unitários: `brandTheme.ts` (contraste, paleta de reserva), regras de
  visibilidade dos blocos, slug e lista reservada, validação de números nos
  textos da IA.
- `npm run supabase:test` com os testes da seção 7, num projeto Compose
  isolado.
- E2E: publicar com senha e abrir anônimo, abrir por código de e-mail, excluir
  e ver a mensagem.
- Custo de IA medido em `ai_usage_events` com chamadas reais, para calibrar o
  orçamento padrão por organização.
- Testes SQL das decisões: editor não muda para modo externo nem exclui (D4);
  nenhuma coluna financeira na resposta da `report-view` (D7); mídia com
  menores ausente no modo público (D10); relatório externo de organização
  bloqueada continua visível e o rascunho não é editável (D2).

## 12. Como ficou

| Fase | Entregue |
|---|---|
| 1 (2026-10-24, worktree não integrado) | `0034_identidade_visual_organizacao.sql`: `slug` único e não nulo (gerado do nome, sem acento, com lista de reservados), três cores `#rrggbb` e `brand_font`, normalizados por gatilho; `SCHEMA_NOTES.md`. `portal/src/lib/brandTheme.ts` (paleta clara e escura derivada das três cores, contraste WCAG garantido, avisos), `brandFonts.ts` (5 pares: geométrico, esportivo como o relatório da SCP, editorial como o da Claro, clássico e moderno), `orgSlug.ts`, `brandIdentity.ts`; hook react-query `useOrganizationBrand`. Configurações → Identidade visual e etapa no onboarding, com prévia nos estilos claro e escuro. Testes: `supabase/tests/identidade_visual.sql` (a–g) e 39 unitários |
| 1 (substituída) | A identidade visual entrou pela `0034_marca_da_organizacao.sql` (kit de cores e seis peças de logo, `useMarca`), não pela migration desta fase, que ficou num worktree sem integrar. Slug de organização e fonte da marca não foram feitos |
| 2 e 3, parcial (2026-10-28) | `0040_relatorio_landing_page.sql`: `property_posts`, `property_indicators`, marcações em `property_media` (momento, patrocinador, etiquetas, menores), `reports` com regras D4 por gatilho e funções `report_landing_*` só para `service_role`. Edge Functions `report-view` (pública) e `social-posts` (prévia por oEmbed e métricas do YouTube). Landing page `/r/:slug` com 13 blocos e 2 estilos; editor em `/dashboard/relatorios/paginas`; relatórios publicados no portal do patrocinador. Testes: `supabase/tests/relatorios.sql`, `_shared/relatorio_test.ts`, unitários do portal. **Mudanças de decisão**: D1 virou "relatório vivo" (sem snapshot, pedido do usuário em 2026-10-28) e D6 ficou `/r/<slug>` (sem slug de organização). Métricas ao vivo do YouTube adiantadas da fase 6 |

Ficou para depois: extrair as cores do logo; servir as fontes do próprio
portal (fase 3); travar o slug depois do primeiro relatório publicado (fase 3).

Ficou para as próximas fases: modos com senha e por e-mail (fase 3/4),
contatos e envio do link (4), IA para ordem e textos (5), conexão OAuth com
Instagram, Facebook e TikTok (6), reordenar blocos no editor, PDF pela
impressão do navegador e CSP na rota `/r/`.
