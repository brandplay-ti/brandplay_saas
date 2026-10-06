# ADR-0004: Schema reconstruído por inferência de types.ts

Status: Accepted

## Contexto

Para sair do Lovable Cloud (ADR-0001) e rodar um Supabase self-hosted, o
projeto precisa de um schema versionado em `supabase/migrations/`. O caminho
padrão para isso seria `supabase db pull` contra o projeto remoto do Lovable
Cloud — mas esse acesso não estava disponível neste ambiente de trabalho, e
não havia nenhuma migration pré-existente no repositório para partir.

A única fonte confiável e completa disponível era
`src/integrations/supabase/types.ts` (~4446 linhas), gerado por introspecção
do banco remoto real. Ele descreve todas as tabelas, colunas, tipos, enums e
assinaturas de função — mas não descreve SQL de views, corpo de funções, nem
sempre o valor literal de um `default`, nem a definição completa de uma
foreign key quando ela não aparece no bloco `Relationships`.

## Decisão

Reconstruir o schema por **inferência** a partir de `types.ts`, em vez de
tentar obter um dump real do banco remoto. O resultado é
`supabase/migrations/0001_extensions.sql` … `0005_rls_policies.sql`: 71
tabelas, 16 enums (confirmados, pois `types.ts` é gerado por introspecção e os
literais de enum vêm do banco real), e as funções de apoio a RLS
(`is_org_member`, `has_org_role` e as funções bônus de acesso público/portal
do patrocinador).

O risco de divergência entre este schema reconstruído e o banco remoto real
foi aceito conscientemente para viabilizar a migração dentro do prazo
disponível. Todas as suposições, decisões de modelagem ambíguas e gaps
conhecidos (view não recriada, ~30 RPCs de negócio não reconstruídas, defaults
supostos, nullability de `organization_id`, FKs adicionadas que não existiam
no remoto, etc.) estão documentados em detalhe em
`supabase/migrations/SCHEMA_NOTES.md` — este ADR não repete esse conteúdo,
apenas registra a decisão de abordagem e aponta para lá.

## Consequências

Positivas:

- Desbloqueou a criação de um Supabase self-hosted funcional sem depender de
  acesso ao projeto remoto do Lovable Cloud.
- Todas as suposições assumidas ficaram documentadas explicitamente, em vez
  de embutidas silenciosamente no SQL.
- RLS foi adicionada desde já (o banco remoto do Lovable Cloud, por padrão da
  plataforma, não expunha esse controle da mesma forma ao desenvolvedor).

Negativas / pontos de atenção:

- Este schema **não é** garantidamente idêntico ao banco remoto real — é a
  melhor reconstrução possível a partir de um arquivo de tipos gerado, não de
  um dump. Precisa ser validado com dados reais antes de ser tratado como
  fonte da verdade definitiva.
- View `crm_unlinked_records` não foi recriada (não é possível inferir SQL de
  view a partir do formato das colunas de saída).
- ~30 funções de negócio (RPCs) do bloco `Functions` do `types.ts` não foram
  reconstruídas — ficam como trabalho futuro, fora do escopo desta ADR.
- Nenhum bucket de Storage foi criado — os 11 buckets usados pelo frontend
  foram apenas documentados (nome e visibilidade inferida) em
  `SCHEMA_NOTES.md`, precisam ser recriados manualmente no self-hosted.
- Nenhum trigger de criação automática de `profiles` a partir de
  `auth.users` foi criado — gap conhecido a resolver antes de produção.

Antes de considerar este schema definitivo, revisar `SCHEMA_NOTES.md` por
completo e confirmar com dados reais (ou com quem tinha acesso ao projeto
Lovable Cloud original) os pontos marcados como suposição de baixa confiança.

## Relacionadas

- ADR-0001 (sair do Lovable Cloud)
- ADR-0002 (modelo de tenant)
- `supabase/migrations/SCHEMA_NOTES.md`
