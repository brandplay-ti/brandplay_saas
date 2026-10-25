# Runbook — Desligar o Lovable Cloud

Checklist operacional + limpeza do repositório. ADR-0001; plano histórico em
`docs/architecture/plano-migracao-dados-lovable-vps.md`.

## Pré-requisitos (não pule)

- [ ] Homologação e produção no Dockploy com migrations aplicadas e portal no
      domínio próprio (não `.lovable.app`).
- [ ] Ensaio de importação concluído (plano §4) ou corte validado (§3.6).
- [ ] Exportação final arquivada **fora do git**, criptografada; pasta
      `.migracao-lovable/` apagada da máquina de quem exportou.
- [ ] Usuários entram pelo novo URL; redefinição de senha comunicada se cenário B/C.

## Corte (T0)

1. Lovable em **somente leitura** (ou congelado sem edições).
2. Exportação final:

   ```bash
   cp .env.lovable.example .env.lovable
   npm run migracao:exportar -- --env-file .env.lovable --service-role
   # ou complementar Storage: --complementar .migracao-lovable/<pasta>
   ```

3. Importação no ambiente alvo (`importar.mjs --gerar-sql` + `--so-arquivos`).
4. Validação §3.6 (contagens, RLS, arquivos, smoke com papéis reais).
5. DNS / `VITE_PUBLIC_*` apontando só para a VPS.
6. Monitorar T+1…T+14 (`log-db-error`, suporte).

## Desativar o Lovable Cloud (T+14)

- Cancelar ou arquivar o projeto no Lovable; revogar chaves que apontavam para
  o projeto `qwyqmzvbopcirhkoenmp`.
- Confirmar que nenhum build ou preview usa `.lovable.app`.

## Limpar o repositório (após T+14)

Na raiz do monorepo, com working tree limpo:

```bash
npm run migracao:desligar-repositorio -- --confirmar-desligamento
```

Move (ou já moveu) para `docs/archive/lovable/`:

- `lovable-migrations/` — referência histórica
- `migracao-dados/` — exportar/importar
- `reconciliacao-schema/`
- `planos-produto/`

`package.json` aponta `npm run migracao:*` para o archive. Reexecutar o
comando é idempotente se as pastas ativas já sumiram.

## O que permanece no produto

- Migrations `0012`–`0019` (reconciliação com o schema Lovable) — fazem parte
  do banco destino; **não** remover.
- ADRs 0001 e 0005 — histórico de decisão.

## Troubleshooting pós-corte

| Sintoma | Ação |
|---------|------|
| E-mail em inglês | `auth-templates` / redeploy Supabase (runbook e-mail) |
| Storage 404 | Conferir paths da importação `--so-arquivos` |
| Usuário sem senha | Fluxo “Esqueci minha senha” (cenário B/C) |
