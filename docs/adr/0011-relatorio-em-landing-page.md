# ADR-0011: Relatório de resultados em landing page

Status: Accepted

## Contexto

O "relatório" que a organização entrega ao mercado e aos patrocinadores não é
o painel analítico de `/dashboard/relatorios` (financeiro, pipeline, uso
interno), nem o PDF de entrega. É uma página institucional, como as duas
referências analisadas em 2026-10-18 e de novo em 2026-10-28:

- `relatorio-scp.scoutsports.com.br`: a temporada da propriedade (números,
  patrocinadores por cota, jornada, público, painel social, vídeos, reels,
  imprensa, final, contato);
- `relatorio-scp-claro.scoutsports.com.br`: a prestação de contas de um
  patrocinador (números, jornada, resultados digitais da marca, acervo de 139
  fotos filtrável, contrapartidas com status, fontes).

As duas são HTML feito à mão, com dados congelados. O pedido é uma página
**viva**, montada com os dados da plataforma e com fotos e links de posts e
vídeos cadastrados pela organização.

O plano de 2026-10-18 (`docs/architecture/plano-relatorios-html.md`) já havia
fechado as decisões D1–D10 e a abordagem híbrida: blocos fixos, tema da
marca, números sempre do banco e IA opcional.

## Decisão

1. **Renderizador de blocos no portal, não HTML gerado.** A rota `/r/:slug`
   é a mesma SPA. Treze blocos (números, resumo, patrocinadores, jornada,
   vídeo, digital, transmissão, conteúdos, público, acervo, imprensa,
   contrapartidas, contato) mais capa e rodapé, em dois estilos (esportivo
   escuro e editorial claro), com as cores e logos da marca da organização
   (`organization_brand_kits`, 0034). Cada bloco aparece sozinho quando tem o
   dado mínimo e pode ser ocultado no editor.
2. **Relatório vivo, sem snapshot.** Muda a decisão D1 do plano, a pedido do
   usuário em 2026-10-28 ("manter o relatório vivo"): a página lê o banco a
   cada visita. A curadoria fica nos próprios dados (destaque, patrocinador,
   momento, "contém menores", blocos ocultos). Consequência aceita: editar um
   post ou uma foto aparece na hora num relatório já publicado.
3. **Conteúdo é da propriedade, não do relatório.** `property_posts`
   (postagens, vídeos e matérias por link), `property_indicators` (números de
   fora da plataforma, com fonte) e as fotos de `property_media` servem a
   todos os relatórios da propriedade. O relatório de patrocinador recebe o
   conteúdo marcado com ele e o geral, nunca o de outro patrocinador.
4. **Uma porta só para quem não é membro.** A Edge Function `report-view`
   (pública) decide o acesso e monta a página por duas funções `SECURITY
   DEFINER` executáveis só por `service_role` (`report_landing_acesso`,
   `report_landing_data`). Nenhuma tabela nova tem policy para `anon`. Entram:
   membro ativo (qualquer status, inclusive rascunho), usuário do portal do
   patrocinador do relatório (publicado) e qualquer pessoa (publicado e
   público).
5. **Endereço `/r/<slug>`**, com o slug gerado no banco (título + 6
   caracteres aleatórios) e fixo. Muda o formato `/r/<org>/<relatorio>` da
   decisão D6: a organização ainda não tem slug (a fase 1 do plano não foi
   integrada; a marca entrou pela 0034). Um formato com a organização pode ser
   acrescentado depois sem quebrar os links atuais.
6. **Métricas ao vivo só onde há API aberta.** YouTube pela Data API v3 com
   chave (`YOUTUBE_API_KEY`), cache de 1 hora por post, atualizado em segundo
   plano pela `report-view` ou pelo botão do editor. Instagram, TikTok e
   Facebook só dão métrica da conta **conectada por OAuth**, com App Review da
   Meta e do TikTok: até lá, métrica manual com data. Embeds por id, nunca pela
   URL crua, com fachada (nada de terceiro carrega antes do clique).
7. **Modos de acesso desta etapa: "só a organização" e "público com link".**
   Senha e código por e-mail ficam para a fase seguinte do plano.

## Consequências

- Relatório público, organização bloqueada por cobrança: continua no ar (D2).
  No modo "só a organização" o membro bloqueado vê "Acesso suspenso".
- Fotos de `property-media` já eram de bucket público; o modo público só não
  as lista quando marcadas com menores. A evidência de entrega
  (`delivery-evidence`, privado) só sai assinada, por 1 hora, fora do modo
  público.
- Nada financeiro na página (D7): a lista de campos de `report_landing_data`
  não inclui valor de contrato, parcela nem cota, e o teste
  `supabase/tests/relatorios.sql` procura valores sentinela.
- A chave do YouTube é segredo de ambiente (Dockploy), nunca `VITE_*`.

## Alternativas descartadas

- **IA gerando o HTML inteiro**: números que podem sair errados, HTML não
  confiável no domínio, dados congelados e custo 5 a 10 vezes maior (plano,
  seção 4).
- **Scraping das redes** (como `fetch-social-stats`): viola os termos,
  quebra sem aviso e foi vetor de SSRF.
- **Snapshot ao publicar** (D1 original): contradiz o pedido de relatório
  vivo.
