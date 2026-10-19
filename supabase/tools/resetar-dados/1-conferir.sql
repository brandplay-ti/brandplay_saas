-- Conferência antes de resetar os dados de um ambiente. SÓ LEITURA.
--
-- Cole no SQL Editor do Studio do ambiente e execute. Nada é alterado.
-- Depois, se o que aparecer for mesmo só cadastro de teste, rode
-- 2-apagar.sql. Para quê e quando: README.md desta pasta.
--
-- Cada linha do resultado é um item: `item`, `detalhe` e `valor`.

with
usuarios as (
  select 'usuario' as item,
         u.email || case when exists (
                      select 1 from public.platform_admins pa
                       where pa.user_id = u.id and pa.revoked_at is null)
                    then ' (superadmin)' else '' end as detalhe,
         to_char(u.created_at, 'YYYY-MM-DD HH24:MI') as valor
    from auth.users u
),
organizacoes as (
  select 'organizacao' as item,
         o.name || ' — ' || (select count(*) from public.organization_members m
                               where m.organization_id = o.id) || ' membro(s)' as detalhe,
         to_char(o.created_at, 'YYYY-MM-DD HH24:MI') as valor
    from public.organizations o
),
-- Assinatura viva no Stripe continua cobrando mesmo sem a linha aqui: o
-- 2-apagar.sql recusa enquanto houver uma. Cancele no Stripe antes.
assinaturas as (
  select 'assinatura_stripe' as item,
         coalesce(o.name, s.organization_id::text) || ' — ' || s.status
           || ' — ' || coalesce(s.stripe_subscription_id, 'sem id') as detalhe,
         s.plan_id as valor
    from public.billing_subscriptions s
    left join public.organizations o on o.id = s.organization_id
),
-- Arquivos não saem por SQL (o Storage bloqueia DELETE direto em
-- storage.objects): os de teste se apagam pela tela Storage do Studio.
arquivos as (
  select 'arquivos_storage' as item,
         bucket_id as detalhe,
         count(*)::text as valor
    from storage.objects
   group by bucket_id
),
-- Linhas por tabela de `public`. As três mantidas pelo 2-apagar.sql
-- aparecem marcadas.
tabelas as (
  select 'linhas' as item,
         c.relname || case when c.relname in ('billing_plans', 'billing_settings', 'platform_admin_audit_log')
                          then ' (mantida)' else '' end as detalhe,
         (xpath('/row/n/text()',
                query_to_xml(format('select count(*) as n from %s', c.oid::regclass), false, true, '')))[1]::text as valor
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind = 'r'
)
select item, detalhe, valor from (
  select 0 as ordem, 'ambiente' as item, 'banco' as detalhe, current_database() as valor
  union all select 1, 'total', 'usuarios', (select count(*) from auth.users)::text
  union all select 1, 'total', 'organizacoes', (select count(*) from public.organizations)::text
  union all select 1, 'total', 'migrations', (select count(*) from migrations.schema_migrations)::text
  union all select 2, item, detalhe, valor from usuarios
  union all select 3, item, detalhe, valor from organizacoes
  union all select 4, item, detalhe, valor from assinaturas
  union all select 5, item, detalhe, valor from arquivos
  union all select 6, item, detalhe, valor from tabelas where valor <> '0'
) r
order by ordem, item, detalhe;
