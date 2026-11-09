# Relatórios de resultado (landing page)

Regras de negócio do relatório em landing page. Decisão e alternativas na
ADR-0011; plano completo e decisões D1–D10 em
`docs/architecture/plano-relatorios-html.md`; operação (chave do YouTube) em
`docs/runbooks/relatorios.md`.

Não confundir com `/dashboard/relatorios`, o painel analítico interno
(financeiro, pipeline), que continua como era.

## O que é

Uma página institucional, aberta por link (`/r/<endereço>`), com os resultados
de uma **propriedade** e, opcionalmente, de um **patrocinador** nela:

| Tipo | Como se cria | O que mostra |
|---|---|---|
| Relatório da propriedade | Sem patrocinador | Temporada: números, patrocinadores por cota, jornada, conteúdos, público, acervo, imprensa |
| Relatório do patrocinador | Com patrocinador (e, se quiser, um contrato) | Prestação de contas: o conteúdo marcado com a marca e o geral, resultados digitais da marca e as contrapartidas com status |

O relatório do patrocinador nunca mostra post, foto ou indicador marcado com
**outro** patrocinador.

## Dados vivos

A página lê o banco a cada visita. Não há "foto" do momento da publicação:
corrigir um número, trocar uma legenda ou cadastrar um post aparece na hora,
inclusive num relatório já publicado.

## De onde vem cada bloco

O bloco só aparece com o dado mínimo e pode ser desligado no editor.

| Bloco | Fonte | Mínimo |
|---|---|---|
| Capa | Título, subtítulo (ou chamada pública da propriedade), capa da propriedade ou primeira foto, logos | sempre |
| Números | Equipes, participantes, público, torcedores e premiação da propriedade; quantidade de momentos; indicadores "Números" | 2 números |
| Resumo | Resumo do relatório ou texto público da propriedade | texto |
| Patrocinadores | Cotas vendidas (`tier_sales`) e contratos ativos/encerrados na propriedade | relatório da propriedade com 1 patrocinador |
| Jornada | Momentos da propriedade (`property_events`) e fotos ligadas a eles | 2 momentos |
| Vídeo em destaque | Vídeo do YouTube destacado, senão o mais visto | 1 vídeo do YouTube |
| Digital | Soma das métricas dos posts (só os da marca, no relatório do patrocinador) e indicadores "Digital" | 1 indicador ou 1 post com visualizações |
| Transmissão | Indicadores "Transmissão" | 1 indicador |
| Conteúdos | Posts, reels e vídeos; ranking dos 10 mais vistos | 1 post |
| Público | Indicadores "Público", agrupados (faixa etária, gênero, cidade) | 1 indicador |
| Acervo | Fotos da galeria da propriedade, filtráveis por patrocinador, momento e etiqueta | 1 foto |
| Imprensa | Posts do tipo "Matéria" | 1 matéria |
| Contrapartidas | Entregas do patrocinador na propriedade (ou do contrato escolhido) | relatório do patrocinador com 1 entrega |
| Contato | Botão de contato (link https, WhatsApp ou mailto) e link do relatório completo | um dos dois |

### Números em branco

Zero conta como em branco nas contagens da propriedade (o cadastro antigo usa
`0` como padrão). Um indicador com valor zero só aparece se "exibir zero"
estiver marcado.

### Contrapartida concluída

Entregue ou aprovada, e não reprovada pelo patrocinador.

## Posts, vídeos e matérias

- Cadastrados por link `https`. A rede e o tipo são reconhecidos pelo link;
  YouTube e TikTok trazem o título pelo oEmbed público.
- Pertencem à propriedade e servem a todos os relatórios dela. Marcar o
  patrocinador faz o post entrar no relatório dele.
- **Métricas**: YouTube é buscado automaticamente (chave da YouTube Data API,
  no máximo uma busca por post a cada hora). Instagram, TikTok, Facebook, X e
  LinkedIn são informados à mão, com a data, até a conta da rede ser conectada
  (ver "Busca automática" abaixo). Número digitado à mão fica marcado como
  métrica manual.
- Na página, o conteúdo de terceiros só carrega depois do clique da pessoa
  (fachada). YouTube pelo domínio sem cookies.

## Fotos

As fotos são as da galeria da propriedade. No editor, cada foto recebe
legenda, momento, patrocinador, etiquetas e a marcação **"contém menores de
idade"**. Foto com menores nunca aparece num relatório **público**; nos
demais acessos, aparece.

Evidências das entregas (fotos do App de Campo) aparecem nas contrapartidas
só para a equipe e para o patrocinador. No relatório público, nunca: para
mostrar uma delas, coloque-a na galeria da propriedade, onde passa pela
marcação de menores.

## Quem acessa

| Quem | O que vê |
|---|---|
| Membro ativo da organização | Qualquer relatório da organização, inclusive rascunho (com aviso de prévia) |
| Usuário do portal do patrocinador | Relatório **publicado** do próprio patrocinador; também listado em Portal → Relatórios |
| Qualquer pessoa com o link | Relatório **publicado** no modo **público** |

O relatório não entra em buscadores (`noindex`). Endereço que não existe e
relatório sem acesso respondem igual ("não encontrado").

## Quem faz o quê

| Ação | Quem |
|---|---|
| Ver | Qualquer membro ativo |
| Criar, editar e publicar no modo "só a organização"; cadastrar posts, indicadores e fotos | Quem edita o módulo CRM ou Operacional (padrão: owner, admin, comercial, operacional) |
| Passar para público, editar ou despublicar um relatório público, excluir | owner e admin |

## Endereço e exclusão

- O endereço é gerado do título com um sufixo aleatório e **não muda**.
- Excluir é definitivo e lógico: o link passa a mostrar "Este relatório não
  está mais disponível. Entre em contato com o responsável pela conta." O
  endereço nunca é reaproveitado. Posts, indicadores e fotos continuam na
  propriedade.

## Cobrança

Sem limite de relatórios por plano. Organização sem acesso não cria nem edita
(bloqueio no banco); o que já foi publicado no modo público continua no ar.

## Nada financeiro

A página nunca mostra valor de contrato, parcela, cota ou oportunidade, nem
notas internas, descrição de entrega ou comentário de aprovação. A premiação
da propriedade e indicadores digitados pela organização com prefixo "R$" são
dados que a própria organização escolheu publicar.

## Cores da organização

As cores do kit de marca colorem só o que a organização entrega para fora: o
relatório em landing page e os PDFs (relatório, proposta, contrato, entrega e
BrandTrack). A interface do portal mantém a identidade da BrandPlay em qualquer
organização: o kit não altera `--primary` nem outro token do tema. Os gráficos
de `/dashboard/relatorios` são interface; só o PDF exportado de lá leva as
cores da organização.

## Busca automática: o que cada rede exige

| Rede | O que dá para buscar | O que precisa |
|---|---|---|
| YouTube | Views, curtidas e comentários de qualquer vídeo público | Chave da YouTube Data API v3 no ambiente (`YOUTUBE_API_KEY`). Feito |
| Instagram | Views, alcance, curtidas, comentários, salvamentos e compartilhamentos **da conta conectada** | Conta profissional do cliente ligada a uma Página do Facebook; app na Meta com `instagram_basic` e `instagram_manage_insights`; **App Review** da Meta; tela de conexão (OAuth) por organização; token cifrado no banco |
| Facebook | Métricas de posts e vídeos **da Página conectada** | App na Meta com `pages_read_engagement` e `read_insights`; App Review; OAuth da Página |
| TikTok | Views, curtidas, comentários e compartilhamentos dos vídeos **do criador conectado** | App no TikTok for Developers com Display API (`video.list`); revisão do app; OAuth do criador; renovação do token (24 h) |
| X, LinkedIn | — | APIs pagas ou restritas: métrica manual |

Post de **terceiros** (influenciador, imprensa) não tem métrica por API em
nenhuma rede: fica manual.
