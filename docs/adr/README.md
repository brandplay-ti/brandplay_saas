# ADR Index

- 0001 Sair do Lovable Cloud
- 0002 Modelo de tenant (organização + RLS, multi-org por usuário)
- 0003 IA via Anthropic API
- 0004 Schema reconstruído por inferência de types.ts
- 0005 Reconciliar o schema reconstruído com o schema real do Lovable
- 0006 Padrão de infraestrutura da VPS (Dockploy + monorepo do central-check)
- 0007 Cobrança por organização com Stripe (teste grátis, limites no banco)
- 0008 Superadmin da plataforma (papel em tabela própria, leitura mínima, auditoria)
- 0010 IA multi-fornecedor com chave por organização (substitui 0003)
- 0011 Relatório de resultados em landing page (blocos, dados vivos, `report-view`)
- 0012 Equipes de trabalho e escopo por projeto (sub-escopo dentro da organização)
- 0013 Tipo de cliente: agência e marca (módulo `vendas`, teto por tipo no banco)
- 0014 Rotinas agendadas no banco com `pg_cron` (retenção dos logs de falha)

Use `NNNN-titulo-curto.md`. Status possíveis: Proposed, Accepted, Superseded,
Deprecated. Não apague decisões históricas; supersede-as com uma ADR nova que
referencia a anterior.
