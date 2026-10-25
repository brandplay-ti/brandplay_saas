# Runbook — IA por organização

Decisão: [ADR-0010](../adr/0010-ia-multi-fornecedor-por-organizacao.md). Plano:
`docs/architecture/plano-ia-por-cliente.md`.

Este runbook cobre **configuração e operação** da IA (chaves, preços, alertas).
O deploy na VPS (Dockploy, migrations, health check) continua em
`docs/runbooks/deployment.md` — use a checklist de IA abaixo **quando** for
publicar homologação/produção; não é pré-requisito para desenvolver localmente.

## Papéis

| Quem | Onde | O quê |
| ---- | ---- | ----- |
| Superadmin da plataforma | `/admin/ia` | Chave padrão, chaves por cliente, orçamento, preços de modelo |
| Owner/admin da organização | Configurações → IA | Consumo do mês (sem ver chave ou fornecedor) |
| Desenvolvimento | Local + CI | `deno test`, `npm run supabase:test`, `npm run supabase:avaliar-ia` |

Concessão de superadmin: `docs/runbooks/superadmin.md`.

## Variáveis no serviço `functions`

Referência completa: `docker/supabase/.env.example` (mesmos nomes no Dockploy).

Obrigatórias quando há credenciais **no banco**:

- `AI_KEYS_MASTER_KEY` — 32 bytes em base64 (local: `npm run supabase:chaves`)
- `AI_KEYS_MASTER_KEY_VERSION` — inteiro; padrão `1`
- `AI_KEYS_PREVIOUS_MASTER_KEYS` — vazio até rotacionar

Semente (opcional, só enquanto **não** houver chave padrão cadastrada em
`/admin/ia`):

- `AI_DEFAULT_PROVIDER` — `openai`, `gemini` ou `anthropic`
- `AI_DEFAULT_API_KEY` e modelos `AI_DEFAULT_MODEL_*` (vazios = defaults em
  `_shared/ai/modelos.ts`)

`ANTHROPIC_API_KEY` isolada **não** alimenta mais as funções de produto
(ADR-0010).

## Chave mestra (`AI_KEYS_MASTER_KEY`)

1. **Gerar** (local): `npm run supabase:chaves` — copie o valor gerado para
   `docker/supabase/.env` e reinicie o serviço `functions` se já estiver no ar.
2. **Homologação/produção**: gere uma chave **por ambiente** (nunca reutilize a
   local). Guarde uma cópia em cofre de senhas **fora** do servidor (1Password,
   Bitwarden, etc.). Sem a mestra, as linhas de `ai_credentials` não decifram.
3. **Nunca** commitar, colocar em `VITE_*`, log ou PR.

## Rotação da chave mestra

Objetivo: trocar a mestra sem invalidar credenciais já gravadas.

1. Gere a nova mestra (32 bytes base64) e escolha a próxima versão (ex.: `2`).
2. No ambiente, **antes** de trocar a atual:
   - Coloque a mestra **antiga** em `AI_KEYS_PREVIOUS_MASTER_KEYS`, no formato
     `1:<base64_da_antiga>` (várias: `1:...;2:...`).
   - Defina `AI_KEYS_MASTER_KEY` = nova mestra e
     `AI_KEYS_MASTER_KEY_VERSION` = `2`.
3. Reinicie/recreate o container `functions`.
4. Novas gravações em `/admin/ia` usam a versão 2; leituras de linhas antigas
   decifram com a versão gravada em `ai_credentials.key_version`.
5. Quando todas as credenciais ativas estiverem regravadas na versão nova,
   remova entradas antigas de `AI_KEYS_PREVIOUS_MASTER_KEYS`.

Não há job automático de re-cifra: revogar e cadastrar de novo a chave no
admin também regrava com a mestra atual.

## Chave padrão da plataforma

1. Entre como superadmin → **Plataforma → IA**.
2. **Cadastrar chave padrão** (ou trocar): escolha fornecedor, cole a API key,
   **Testar conexão**, comentário de auditoria (≥ 3 caracteres), **Salvar**.
3. Depois disso, a semente `AI_DEFAULT_*` deixa de ser necessária para novos
   ambientes (pode ficar vazia no Dockploy).
4. Cadastre em **Preços** (`/admin/ia/precos`) os modelos que a chave usa,
   com valores **oficiais do fornecedor convertidos para reais** (ver abaixo).

## Chave exclusiva por cliente

1. Em `/admin/ia`, abra o cliente → credencial exclusiva (mesmo fluxo: testar,
   salvar, auditar).
2. **OpenAI (recomendado para limite duro no fornecedor):** crie um
   [Project](https://platform.openai.com/) por cliente, com budget/limit no
   painel OpenAI; use a API key **desse** project na organização.
3. **Gemini:** use conta/plano pago do Google AI Studio ou Vertex conforme
   contrato; cadastre a chave do cliente no admin.
4. **Anthropic:** chave de workspace/conta acordada com o cliente.
5. Configure orçamento mensal e % de alerta na mesma tela (grava
   `ai_org_settings`). Com exclusiva, 100% do orçamento **alerta** mas não
   bloqueia automaticamente (Q5); sem exclusiva, o corte depende de
   `corta_ao_esgotar` / plano.

## Tabela de preços (`ai_model_prices`)

- Fonte: página oficial de preços do fornecedor (não agregador).
- Converta USD → BRL com a taxa que a operação adota; registre a data mentalmente
  (campo `valid_from`).
- Sem preço para um modelo, a chamada funciona mas `estimated_cost_brl` fica nulo
  — orçamento e alertas ficam imprecisos.
- Revise **mensalmente** ou quando o fornecedor anunciar mudança.

## Alertas

Gerados em `notifications` (e e-mail se o usuário mantiver
`notification_preferences.email_enabled`).

| Alerta | Quem recebe | O que fazer |
| ------ | ----------- | ----------- |
| Orçamento atingiu o % configurado (ex. 80%) | Owner/admin da org + superadmins | Cliente: revisar uso em Configurações → IA. Plataforma: contato comercial ou aumento de orçamento/chave exclusiva. |
| Orçamento 100% | Idem | Com chave padrão e corte ativo, novas chamadas podem retornar `orcamento_esgotado`. Ajustar orçamento, desabilitar IA só se combinado com o cliente, ou migrar para chave exclusiva. |
| Falha `chave_invalida` / `sem_saldo` na credencial **exclusiva** | Superadmins (máx. 1/h por credencial) | Abrir `/admin/ia/clientes/<id>`, testar/revogar/corrigir chave; checar saldo no painel do fornecedor. |

Dedupe impede spam: um alerta por limiar por mês; falha de chave por hora.

## Desenvolvimento e validação local

```bash
npm run supabase:up
npm run supabase:migrate
npm run supabase:seed
# .env local: AI_KEYS_MASTER_KEY + AI_DEFAULT_* ou cadastro via /admin/ia
npm run supabase:avaliar-ia          # teste admin-ai por fornecedor
npm run supabase:avaliar-ia -- --funcoes   # smoke opcional de funções
npm run supabase:test                # inclui supabase/tests/ia.sql
```

Relatório de avaliação: `supabase/tools/avaliar-ia/saida/` (gitignored).

Testes Deno: `supabase/functions/_shared/` e `supabase/functions/admin-ai/`.

## Checklist antes do deploy (IA) — homologação, depois produção

Use quando for configurar a VPS (IA-34); ordem sugerida:

1. Migration `0031`+ já aplicadas no ambiente (ver
   `docs/runbooks/primeira-carga.md`).
2. `AI_KEYS_MASTER_KEY` (+ versão) definida no Dockploy; cópia no cofre.
3. Semente `AI_DEFAULT_*` **ou** chave padrão cadastrada via `/admin/ia` após
   o portal publicado.
4. Preços dos modelos em uso cadastrados em `/admin/ia/precos`.
5. `npm run supabase:checar -- https://api.<dominio> <ANON_KEY> --portal ...`
6. Superadmin de operação concedido; testar `/admin/ia` e uma função de IA
   (ex. assistente ou score de leads).
7. Registrar data e responsável em **Notas de deploy** em
   `docs/runbooks/deployment.md`.

## Referências

- Modelo de dados e RLS: `supabase/migrations/SCHEMA_NOTES.md` (IA)
- Edge Functions: `supabase/functions/MIGRATION_NOTES.md` (`admin-ai`, camada)
- Backlog: `docs/architecture/backlog-ia-por-cliente.md`
