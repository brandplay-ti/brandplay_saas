# Plano de ação: migração de dados do Lovable Cloud para o Supabase da VPS

- **Data**: 2026-10-01
- **Origem**: projeto Supabase gerenciado pelo Lovable Cloud
  (ref. `qwyqmzvbopcirhkoenmp`, app publicado em `brandplayapp.lovable.app`)
- **Destino**: Supabase self-hosted em `docker/supabase/` na VPS (ADR-0001)
- **Relacionados**: ADR-0001, ADR-0002, ADR-0004,
  `supabase/migrations/SCHEMA_NOTES.md`, `docker/supabase/README.md`,
  `.claude/rules/cicd.md`

O que precisa ser migrado:

| Camada | Conteúdo | Observação |
|---|---|---|
| Código | Frontend + Edge Functions | O Lovable está **à frente** do GitHub (ver 1.1) |
| Schema | 71 tabelas, 16 enums, funções, policies | Hoje reconstruído por inferência (ADR-0004), não por dump |
| Auth | `auth.users` + `auth.identities` | Os UUIDs precisam ser preservados: todas as FKs de `user_id` dependem deles |
| Dados | Linhas de domínio por organização | Triggers do destino podem duplicar dados na importação (ver 5.3) |
| Storage | 11 buckets (`0007_storage_buckets.sql`) | O banco guarda caminhos (`logo_path`, `storage_path`, `evidence_path`…), então os caminhos precisam ser idênticos |
| Segredos | `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, etc. | Novos no destino, nunca copiados para o repositório |

---

## 1. Pré-requisitos e decisões (antes de qualquer cópia)

### 1.1 Sincronizar o código do Lovable (bloqueante)

O bundle publicado contém telas que não existem no repositório (ver
`docs/design/plano-de-acao-ux-ui.md`, onda 0). O `types.ts` do Lovable atual é
a melhor pista do schema real de hoje: se o repositório está atrás no código,
**provavelmente também está atrás no schema**.

- [ ] Congelar edições no Lovable. **Se houver nova edição no Lovable após
      2026-10-01, repetir o export e a sincronização.**
- [x] Trazer o código atual para uma branch do GitHub (`sync/lovable-2026-10`,
      integrada em `201298a`).
- [x] Comparar o `types.ts` sincronizado com as migrations `0001`–`0011`:
      sem diferenças de schema (só formatação).

### 1.2 Nível de acesso ao banco de origem (define a estratégia)

| Cenário | O que exige | Fidelidade | Senhas dos usuários |
|---|---|---|---|
| **A: acesso Postgres direto** (connection string do Lovable Cloud ou dump fornecido pelo suporte do Lovable) | `pg_dump` do schema `public`, `auth` e `storage` | Total (schema real, dados, hashes de senha, metadados de storage) | **Preservadas** (mesmo algoritmo bcrypt do GoTrue) |
| **B: só API** (service role key do projeto de origem) | Exportação via PostgREST/Storage API com service role | Alta para dados e arquivos. Schema continua inferido | **Perdidas**: usuários recriados com o mesmo UUID e redefinição de senha obrigatória |
| **C: sem service role** (só login de usuário) | Exportação limitada ao que a RLS de cada usuário enxerga | Parcial. Arriscado para dados de várias organizações | Perdidas |

- [ ] **Decisão M1**: verificar com o Lovable (configurações do Cloud ou
      suporte) se é possível obter connection string ou dump. **Cenário A é o
      recomendado**. Planejar B como alternativa. C só para volume pequeno e
      uma única organização.

### 1.3 Escopo dos dados

- [ ] **Decisão M2**: os dados atuais do Lovable são de produção (clientes
      reais) ou de teste? Se forem só de teste, a migração pode se limitar a
      schema + usuários internos, e todo o processo abaixo fica muito mais
      simples.
- [ ] **Decisão M3**: quais organizações migram (todas ou um subconjunto)?
- [ ] Levantar volume por tabela e tamanho total do Storage (define a janela
      de corte).

### 1.4 Infraestrutura de destino

- [ ] VPS provisionada, domínio e TLS definidos. Ferramenta de deploy
      **decidida: Dockploy**, no padrão do central-check (ADR-0006,
      `docs/runbooks/provisionar-ambiente.md`). Primeiro acesso à VPS
      exige autorização explícita.
- [ ] `.env` de produção com segredos **novos** (`JWT_SECRET`, chaves
      `anon`/`service_role`, senha do Postgres). As chaves geradas por
      `npm run supabase:chaves` são só de desenvolvimento.
- [ ] Backup automatizado do Postgres e do volume de Storage **antes** de
      receber dados reais.
- [ ] Ambiente de homologação idêntico para o ensaio (seção 4).

---

## 2. Reconciliação de schema

> **Atualização 2026-10-01**: o export do Lovable trouxe as **95 migrations
> reais** do banco de origem (`supabase/lovable-migrations/`, de
> `20260419203057` a `20260810025139`). O `types.ts` do export difere só na
> formatação, então tabelas, colunas, enums e assinaturas já batem com a
> reconstrução. A reconciliação deixa de depender do cenário A para o
> schema: dá para aplicar as 95 migrations num Postgres limpo e comparar com
> `0001`–`0011`. O acesso privilegiado continua necessário para **dados**,
> **senhas** e **Storage**.

> **Resultado (2026-10-02)**: `docs/architecture/reconciliacao-schema-2026-10-02.md`.
> O schema reconstruído **não serve como destino** dos dados: faltam 125
> triggers (inclusive os que preenchem `organization_id`), a permissão por
> módulo nas policies, UNIQUEs usados por upserts, e há 22 colunas com tipo
> incompatível.
>
> **Atualização (2026-10-02)**: reconciliado mantendo a reconstrução
> (ADR-0005, migrations `0012`–`0019`). O schema do destino passa a aceitar os
> tipos reais. Na importação continuam valendo os passos 3 e 4 (órfãos nas
> 140 FKs que só existem aqui; triggers desligados durante a carga, agora são
> 126, ver seção 3.3).

1. Aplicar `supabase/lovable-migrations/*.sql` num banco descartável (schema
   "real") e `0001`–`0011` em outro (schema reconstruído). Comparar os dois
   (ex.: `migra` ou `pg_dump --schema-only` + diff), com foco no que o
   `types.ts` não mostra: corpo das funções, triggers, policies, defaults e a
   view `crm_unlinked_records`. Cenário A: confirmar também contra um
   `pg_dump --schema-only` da origem, caso tenha havido alteração manual
   fora das migrations.
2. Cada diferença vira uma migration nova (`0012_…`). **Nunca** editar as já
   aplicadas.
3. Confirmar os pontos de baixa confiança de `SCHEMA_NOTES.md` (defaults,
   nulabilidade de `organization_id`, FKs adicionadas que não existiam na
   origem, view `crm_unlinked_records`).
4. **Qualidade dos dados vs. RLS mais estrita**: no destino, linha com
   `organization_id = null` fica inacessível (CLAUDE.md, seção 6). FKs
   adicionadas na reconstrução podem rejeitar linhas órfãs. Rodar na origem:
   - contagem de linhas com `organization_id` nulo por tabela;
   - linhas filhas sem pai, para cada FK nova do destino.

   Decidir caso a caso: corrigir na origem, atribuir organização ou descartar
   (com registro).

Saída: schema do destino aceita 100% das linhas da origem, ou há uma lista
aprovada de exceções.

---

## 3. Procedimento de exportação e importação

### 3.1 Ordem

```
auth.users → auth.identities → public (respeitando FKs, ou com triggers
desligados) → storage.objects (metadados) → arquivos do Storage
→ sequências → validação
```

### 3.2 Auth (preservando UUIDs)

- **Cenário A**: copiar `auth.users` e `auth.identities` por dump (`--data-only`,
  só essas tabelas). Hashes bcrypt são compatíveis entre instâncias do GoTrue,
  então os usuários continuam com a mesma senha.
- **Cenário B**: recriar cada usuário pela Admin API do destino **com o mesmo
  `id`** (confirmar no ensaio que a versão do GoTrue aceita `id` na criação;
  se não aceitar, inserir direto em `auth.users` via SQL com `encrypted_password`
  vazio). Depois disparar redefinição de senha (e-mail via Resend).
- Em qualquer cenário: o `JWT_SECRET` muda, então **todas as sessões caem** e
  todo usuário precisa logar de novo após o corte.

### 3.3 Triggers do destino que interferem na importação

| Trigger | Efeito se ligado durante a importação | Ação |
|---|---|---|
| `on_auth_user_created` (`0006`) | Cria `profiles` ao inserir em `auth.users`, colidindo com os `profiles` importados | Importar com `session_replication_role = replica` (desliga triggers comuns) ou importar `profiles` com `on conflict do update` |
| `trg_contracts_generate_installments` / `_deliveries` (`0016`) | Geram parcelas/entregas ao ver contrato `ativo`, **duplicando** as já existentes | Importar com triggers desligados |
| Demais triggers portados em `0016` (126 no total: `organization_id`, `updated_at`, interações, auditoria, numeração de proposta, sincronismo de estágio) | Sobrescrevem `updated_at`, criam interações/auditoria e mudam estágios durante a carga | Importar com triggers desligados |

Regra: toda carga de dados roda com `set session_replication_role = replica;`
e volta para `origin` ao final. No fim, conferir que não há linhas geradas por
trigger durante a carga (contagens da seção 3.6).

### 3.4 Dados de domínio

- **Cenário A**: `pg_dump --data-only --schema=public` (formato custom) →
  `pg_restore --data-only --disable-triggers` no destino.
- **Cenário B**: script de exportação com service role, uma tabela por vez,
  paginado (ex.: 1.000 linhas), gravando JSON/CSV; importação com `COPY`.
  Manter a ordem de FKs ou carregar com triggers e FKs adiadas.
- Ajustar sequências ao final (`setval` para o `max(id)` de cada uma).

### 3.5 Storage

- Para cada um dos 11 buckets: listar objetos na origem → baixar → subir no
  destino **com o mesmo bucket e o mesmo caminho**.
- Buckets privados exigem service role (cenário A/B). No cenário C, só via
  URLs assinadas do que o usuário enxerga.
- Validar por contagem e soma de tamanhos por bucket, mais amostragem de
  arquivos abrindo pelo app.

### 3.6 Validação (critério de aceite da migração)

- [ ] Contagem de linhas por tabela: origem = destino (diferenças só nas
      exceções aprovadas na seção 2).
- [ ] Somas financeiras por organização batem (valor de contratos, parcelas
      pagas/pendentes).
- [ ] Nenhuma linha órfã nem com `organization_id` nulo inesperado.
- [ ] `npm run supabase:test` (`seguranca.sql`) passa no destino.
- [ ] Teste com usuários reais de papéis diferentes (owner, comercial,
      financeiro, patrocinador do portal): cada um vê exatamente o que via
      antes, nada de outra organização.
- [ ] Arquivos abrem (logos, contratos assinados, evidências do BrandTrack).
- [ ] Edge Functions principais respondem (IA via Anthropic, e-mail via Resend).

---

## 4. Ensaio em homologação (obrigatório)

Rodar o procedimento completo da seção 3 pelo menos uma vez em homologação,
com cópia dos dados reais:

- medir o tempo total (define a janela de corte);
- registrar cada passo manual como script (nada de "lembrar de fazer");
- validar pela seção 3.6;
- só avançar com um ensaio limpo de ponta a ponta.

Dados pessoais em trânsito (LGPD): dumps e exportações ficam criptografados,
fora do repositório, com acesso restrito, e são apagados após a migração.

---

## 5. Corte (cutover)

| Passo | Ação |
|---|---|
| T-7 dias | Comunicar usuários: data, janela, novo endereço, novo login (e redefinição de senha, se cenário B) |
| T-1 dia | Ensaio final validado. Backup completo do destino vazio pronto |
| T0 | Colocar o Lovable em **somente leitura** (aviso no app ou bloqueio de escrita) |
| T0 | Exportação final → importação → validação 3.6 |
| T0 | Frontend publicado com `VITE_PUBLIC_SUPABASE_URL`/`VITE_PUBLIC_SUPABASE_ANON_KEY` do destino (build arguments no Dockploy). DNS do domínio próprio apontando para a VPS |
| T0 | Testes rápidos com os usuários-chave |
| T+1 a T+14 | Monitorar erros (`log-db-error`, `report-error`). Lovable mantido intacto e só leitura como plano de volta |
| T+14 | Desativar o Lovable Cloud depois de confirmação explícita. Exportação final arquivada criptografada |

### Rollback

Até o fim da janela, voltar = apontar o frontend/DNS de novo para o Lovable,
que ficou intacto em só leitura. Toda escrita feita no destino depois do
corte se perderia num rollback, por isso a janela deve ser curta e o
"vai/não vai" decidido logo após a validação 3.6.

---

## 6. Decisões pendentes

| # | Pergunta | Impacto |
|---|---|---|
| M1 | Dá para obter connection string, dump ou service role do Lovable Cloud? | Define o cenário A/B/C e se as senhas são preservadas. **Situação em 2026-10-01**: só há as variáveis `VITE_*` (URL + chave `anon`), que são públicas e equivalem ao cenário C. Próximo passo: pedir ao Lovable a connection string ou a service role |
| M2 | Os dados atuais são reais ou de teste? | **Respondido em 2026-10-01: há dados reais.** Migração completa, com ensaio e validação |
| M3 | Todas as organizações migram? | Escopo e validação |
| M4 | VPS, domínio e ferramenta de deploy estão definidos? | Data mínima de corte. **Ferramenta decidida em 2026-10-05: Dockploy** (ADR-0006); domínios ainda a definir |
| M5 | Qual janela de indisponibilidade é aceitável? | Estratégia de corte (única ou com delta) |
| M6 | Adotar o schema real do Lovable como nova base ou corrigir o reconstruído com migrations? | **Decidido em 2026-10-02: manter a reconstrução e corrigir** (ADR-0005, migrations `0012`–`0019`, já aplicadas localmente) |
| M7 | Existe homologação na VPS com as migrations `0001`–`0011` aplicadas e dados que precisam ser preservados? | **Respondido em 2026-10-02: não existe ambiente na VPS**; será criado após a migração |
