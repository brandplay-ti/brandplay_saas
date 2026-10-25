# Migração de dados — Lovable Cloud → Supabase self-hosted

Ferramentas **one-shot** para exportar do projeto Lovable (API anon ou service
role) e importar no stack da VPS via Studio + Storage API.

Saída em `.migracao-lovable/` (gitignore, LGPD). Plano completo:
`docs/architecture/plano-migracao-dados-lovable-vps.md`. Runbook de corte e
limpeza do repositório: `docs/runbooks/desligar-lovable.md`.

## Exportar

```bash
cp .env.lovable.example .env.lovable   # preencher URL + anon key do Lovable
npm run migracao:exportar -- --env-file .env.lovable
```

Opções úteis:

| Flag | Uso |
|------|-----|
| `--service-role` | Bypass de RLS (Storage completo). Chave digitada no terminal. |
| `--complementar <pasta>` | Só arquivos ainda faltando no disco. |
| `--relatar --complementar <pasta>` | Lista pendentes por dono, sem baixar. |
| `--sessao token.json` | Login social (Local Storage `sb-*-auth-token`). |
| `--sem-arquivos` | Só tabelas JSON. |

## Importar

```bash
npm run migracao:importar -- --pasta .migracao-lovable/<data-hora> --gerar-sql
# SQL Editor do Studio → partes parte-NN-de-MM.sql

npm run migracao:importar -- --pasta .migracao-lovable/<data-hora> --so-arquivos --url https://SEU-AMBIENTE
```

## Desligar o Lovable no repositório

Depois da validação §3.6 do plano e desativação do Cloud:

```bash
npm run migracao:desligar-repositorio -- --confirmar-desligamento
```

Arquiva migrations de referência, scripts e planos de produto Lovable em
`docs/archive/lovable/` e remove caminhos ativos do monorepo.
