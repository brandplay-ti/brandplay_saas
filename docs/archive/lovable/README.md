# Arquivo — Lovable Cloud (BrandPlay)

Material histórico após desligamento do Lovable Cloud. **Não** faz parte do
caminho crítico de build, CI ou deploy.

| Pasta | Conteúdo |
|-------|----------|
| `lovable-migrations/` | 95 migrations reais do banco Lovable (referência ADR-0005) |
| `migracao-dados/` | `exportar.mjs`, `importar.mjs` (export/import cenário C) |
| `reconciliacao-schema/` | Scripts de diff schema Lovable × reconstruído (2026-10) |
| `planos-produto/` | Planos gerados no Lovable (produto, 2026-08) |

Scripts de migração (se ainda houver exportação local):

```bash
node docs/archive/lovable/migracao-dados/exportar.mjs --env-file .env.lovable
node docs/archive/lovable/migracao-dados/importar.mjs --pasta .migracao-lovable/<data>
```
