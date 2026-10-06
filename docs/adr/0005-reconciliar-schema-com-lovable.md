# ADR-0005: Reconciliar o schema reconstruído com o schema real do Lovable

Status: Accepted

## Contexto

A ADR-0004 reconstruiu o schema a partir de `src/integrations/supabase/types.ts`
porque não havia acesso ao banco do Lovable Cloud. Em 2026-10-01 o export do
código do Lovable trouxe as **95 migrations reais** do banco de origem, hoje
guardadas em `supabase/lovable-migrations/` (somente referência).

A comparação dos dois schemas (`docs/architecture/reconciliacao-schema-2026-10-02.md`,
ferramenta em `supabase/tools/reconciliacao-schema/`) mostrou que a
reconstrução acertou a forma (tabelas, colunas, enums) e errou o comportamento:
faltavam 125 triggers (inclusive os que preenchem `organization_id`), a
permissão de escrita por módulo (`can_access_module`) em 38 tabelas, UNIQUEs
usados por upserts, CHECKs de domínio, e havia 68 colunas com tipo ou default
diferente. Também apareceram problemas de segurança na reconstrução (funções
`SECURITY DEFINER` executáveis por `anon`, `profiles` legível entre
organizações) e bugs no próprio Lovable.

Havia duas opções: adotar o schema real como nova base, ou manter a
reconstrução e corrigi-la com migrations novas.

## Decisão

**Manter a reconstrução** (`0001`–`0011`) e portar o comportamento real do
Lovable em migrations novas, numeradas e revisáveis:

| Migration | Conteúdo |
|---|---|
| `0012` | helpers de autorização com `_user_id` explícito na ordem real de parâmetros (as funções reais os chamam de forma posicional) |
| `0013` | tipo e default de 68 colunas |
| `0014` | CHECKs, UNIQUEs, índices e `ON DELETE` de 4 FKs |
| `0015` | corpo, assinatura, modo de segurança e permissões das funções de negócio; view `crm_unlinked_records` |
| `0016` | 47 funções de trigger e 126 triggers |
| `0017` | RLS: escrita por módulo, portal do patrocinador, escopo por usuário, `profiles`, leitura pública de eventos |
| `0018` | correção: cadastro sem convite falhava (membro duplicado) |
| `0019` | correção: lead do media kit público falhava para anônimos e aceitava `owner_id` do formulário |

Regras aplicadas no porte:

1. O Lovable é a referência de comportamento, **exceto** quando a versão da
   reconstrução é deliberadamente mais segura ou correta. Cada desvio fica
   registrado no cabeçalho da migration correspondente.
2. Nada que quebre o isolamento por organização (CLAUDE.md, seção 6) é
   portado: policies com o papel global `has_role(..., 'admin')` (acesso a
   todas as organizações) e policies de "dono da linha" sem checar
   organização ficaram de fora.
3. Permissões de execução não são copiadas cegamente: funções
   `SECURITY DEFINER` sem checagem de organização nunca ficam executáveis por
   `anon`/`authenticated`.
4. Bugs do Lovable reproduzidos no replay das migrations reais são corrigidos
   em migrations próprias (`0018`, `0019`), não silenciosamente dentro do porte.

## Consequências

Positivas:

- O schema do self-hosted passa a aceitar os dados reais do Lovable sem perda
  de tipo e a se comportar como o produto em produção (triggers, automações,
  permissões por módulo).
- `npm run supabase:test` ganhou testes automatizados de isolamento entre
  organizações, escrita por módulo, perfis, lead público e escopo por usuário.
- A comparação é reproduzível (`supabase/tools/reconciliacao-schema/recon.sh`)
  e pode ser repetida se o Lovable mudar antes do corte.

Negativas / pontos de atenção:

- Triggers herdados preenchem `organization_id` nulo com a organização ativa
  **mais antiga** do usuário (`get_user_org`), não a selecionada na UI. Para
  usuários em várias organizações, inserts do frontend sem `organization_id`
  podem cair na organização errada (sempre uma do próprio usuário). Correção
  definitiva: o frontend enviar o `organization_id` ativo.
- `deliveries_sponsor_portal_update` libera todas as colunas da entrega ao
  patrocinador (como no Lovable).
- As 140 FKs que só existem na reconstrução exigem tratamento de órfãos na
  importação de dados.
- Os padrões de RLS documentados em `.claude/rules/supabase.md` ganharam o
  padrão 7 (escrita por módulo).

## Relacionadas

- ADR-0001, ADR-0002, ADR-0004 (complementada, não substituída: a
  reconstrução continua sendo a base)
- `docs/architecture/reconciliacao-schema-2026-10-02.md`
- `docs/architecture/plano-migracao-dados-lovable-vps.md`
- `supabase/migrations/SCHEMA_NOTES.md`
