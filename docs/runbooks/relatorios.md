# Runbook — Relatórios de resultado (landing page)

Decisão: [ADR-0011](../adr/0011-relatorio-em-landing-page.md). Regras:
`docs/business/relatorios.md`.

## Antes de publicar um ambiente

1. Backup e migration `0040_relatorio_landing_page.sql`, homologação primeiro
   (`docs/runbooks/primeira-carga.md`). O portal depende dela: publique o
   portal **depois** da migration.
2. Edge Functions novas, assadas na imagem: `report-view` (pública) e
   `social-posts` (exige login). Nenhuma configuração própria além da chave
   abaixo.
3. Opcional: `YOUTUBE_API_KEY` no serviço `functions` do Dockploy.

## Chave do YouTube (`YOUTUBE_API_KEY`)

Sem ela, tudo funciona; as métricas dos vídeos ficam só as digitadas.

1. No Google Cloud Console, crie (ou escolha) um projeto **por ambiente**.
2. Ative a **YouTube Data API v3**.
3. Credenciais → Criar chave de API. Em "Restrições da API", limite a chave à
   YouTube Data API v3. Não há restrição por IP útil aqui: a chamada sai do
   container `functions`.
4. Cole a chave em `YOUTUBE_API_KEY` no serviço Compose do Supabase
   (Dockploy → Environment) e reimplante o serviço `functions`. Local: no
   `docker/supabase/.env`, depois `npm run supabase:up`.
5. Confira: num relatório com vídeo do YouTube, Editor → Posts e links →
   **Atualizar métricas**. A mensagem informa quantos vídeos foram
   atualizados; a coluna "Métrica" passa a "Automática".

Cota: a cota padrão é de 10.000 unidades por dia. Cada chamada
`videos.list` custa 1 unidade e cobre até 50 vídeos; cada post é buscado no
máximo uma vez por hora (`metrics_checked_at`). Uma propriedade com 200 vídeos
visitada o dia todo gasta menos de 100 unidades por dia.

A chave nunca vai para o portal nem para log: a função registra só o status
HTTP da resposta do Google.

## Instagram, Facebook e TikTok (ainda não ligados)

Exigem, por organização, a conta da rede conectada por OAuth e, da
plataforma, apps aprovados pelas redes. Lista do que falta em
`docs/business/relatorios.md` ("Busca automática"). Comece os App Reviews
cedo: a Meta e o TikTok levam semanas e podem pedir vídeo de demonstração do
fluxo de conexão.

## Retirar um relatório do ar

- Pela tela: owner ou admin → Relatórios de resultado → o relatório →
  **Excluir** (ou "Voltar para rascunho", que tira do ar sem excluir).
- Organização bloqueada por cobrança não consegue editar. Se for preciso
  tirar do ar mesmo assim, pelo SQL Editor, com registro do motivo:

  ```sql
  update public.reports set status = 'rascunho' where slug = '<endereco>';
  ```

  Sem `auth.uid()` (SQL Editor), as regras de papel não se aplicam; as de
  integridade, sim (endereço fixo, excluído não volta).

## Diagnóstico

- "Relatório não encontrado" para quem deveria ver: confira `status`
  (rascunho só a equipe vê) e `access_mode` em `reports`; para o
  patrocinador, `sponsor_portal_access.status = 'ativo'` do mesmo
  `sponsor_id`.
- Foto que não aparece no público: `property_media.contains_minors`.
- Log da `report-view`: linhas `request.contexto` com `code`
  `report_view_organizacao`, `report_view_patrocinador` ou
  `report_view_publico` (`docs/infrastructure/monitoring.md`).
