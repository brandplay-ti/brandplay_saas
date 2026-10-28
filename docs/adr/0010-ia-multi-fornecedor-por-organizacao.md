# ADR-0010: IA multi-fornecedor com chave por organização

Status: Accepted

Substitui: [ADR-0003](0003-ia-via-anthropic.md) (IA via Anthropic API única)

## Contexto

O BrandPlay concentra dezenas de capacidades de IA em Edge Functions (assistente
CRM, propostas, BrandTrack, scoring, etc.). A ADR-0003 fixou a saída do gateway
Lovable com uma única `ANTHROPIC_API_KEY` compartilhada por todos os clientes.

Isso não escala para um SaaS B2B:

- **Custo** — não há orçamento nem medição por organização; um cliente pesado
  impacta todos.
- **Fornecedor** — clientes enterprise podem exigir chave própria (OpenAI
  Project, conta Gemini/Anthropic dedicada).
- **Operação** — o time da plataforma precisa cadastrar chave padrão, chaves
  exclusivas, preços de modelo e limites sem redeploy.

O plano aprovado está em
`docs/architecture/plano-ia-por-cliente.md` (2026-10-20), implementado nas
migrations `0031`–`0032`, na camada `_shared/ai/` e na área `/admin/ia`.

## Decisão

1. **Camada única de IA** — Toda função de produto chama `gerar()` em
   `_shared/ai/camada.ts`: valida pedido, consulta `ia_situacao`, resolve
   credencial, chama adaptador (OpenAI-compat ou Anthropic), grava
   `ai_usage_events`. Nenhuma função lê `ANTHROPIC_API_KEY` nem chama
   fornecedor diretamente.

2. **Fornecedores fechados** — `openai`, `gemini`, `anthropic`, com adaptadores
   em `_shared/ai/openai.ts` e `_shared/ai/anthropic.ts`.

3. **Credenciais no banco, cifradas** — Tabela `ai_credentials` (RLS: só
   `service_role`). Cifra AES-256-GCM com `AI_KEYS_MASTER_KEY`
   (`_shared/ai-crypto.ts`). Uma chave **padrão** ativa (`organization_id`
   nulo) e no máximo uma **exclusiva** ativa por organização.

4. **Resolução (Q3/Q4/Q5)** — Ordem: exclusiva → padrão → semente de ambiente
   (`AI_DEFAULT_*`). Falha na exclusiva **não** cai na padrão (erro ao
   usuário; superadmin alertado). Sem modelo de visão na exclusiva, só aquela
   chamada usa a padrão (`via_padrao`). Orçamento mensal em R$ estimado: corte
   na chave padrão em 100%; com exclusiva, só alerta.

5. **Gestão administrativa** — Edge Function `admin-ai` (JWT + superadmin):
   testar conexão, definir/revogar credenciais, `ai_org_settings`,
   `ai_model_prices`, auditoria em `platform_admin_audit_log` (sem chave, só
   `key_hint`).

6. **Leitura** — Owner/admin: `ia_consumo_organizacao`. Superadmin:
   `admin_ia_*`. Nunca expor cifra ou chave completa.

7. **Alertas** — Após uso registrado, `_shared/ai/alertas.ts` notifica
   owner/admin e superadmins nos limiares de orçamento; falha
   `chave_invalida`/`sem_saldo` em credencial exclusiva alerta superadmins.

## Variáveis de ambiente (serviço `functions`)

| Variável | Uso |
| -------- | --- |
| `AI_KEYS_MASTER_KEY` | Cifra/decifra credenciais do banco (obrigatória com chaves cadastradas) |
| `AI_KEYS_MASTER_KEY_VERSION` | Versão gravada nas linhas (padrão `1`) |
| `AI_KEYS_PREVIOUS_MASTER_KEYS` | Rotação: `versão:base64;...` para decifrar legado |
| `AI_DEFAULT_PROVIDER` / `AI_DEFAULT_API_KEY` / `AI_DEFAULT_MODEL_*` | Semente até existir chave padrão no banco |
| `ANTHROPIC_API_KEY` | **Obsoleta** para funções de produto (histórico ADR-0003) |

Detalhe operacional: `docs/runbooks/ia.md`. Modelo de dados:
`supabase/migrations/SCHEMA_NOTES.md` (seção IA).

## Consequências

Positivas:

- Isolamento de custo e credencial por organização, com visibilidade para o
  cliente (Configurações → IA) e para a plataforma (`/admin/ia`, visão geral).
- Um único ponto para guardas, medição, erros neutros e testes Deno.
- Superadmin opera chaves e preços sem migration.

Negativas / pontos de atenção:

- **Chave mestra** — Perda invalida todas as credenciais cifradas; exige
  procedimento de backup e rotação (runbook).
- **Preços** — `ai_model_prices` em reais é estimativa; câmbio e tabela oficial
  são responsabilidade de quem opera.
- **Dados em terceiros** — Prompts e anexos saem para o fornecedor da
  credencial em uso; termos de uso/privacidade (IA-37) precisam listar OpenAI,
  Google e Anthropic.
- **Complexidade** — Nova Edge Function ou fluxo de IA deve usar a camada, não
  API direta.

## Relacionadas

- ADR-0001 (sair do Lovable), ADR-0002 (tenant), ADR-0008 (superadmin)
- `docs/architecture/plano-ia-por-cliente.md`, `docs/architecture/backlog-ia-por-cliente.md`
- `docs/runbooks/ia.md`, `SECURITY.md`, `supabase/functions/MIGRATION_NOTES.md`
