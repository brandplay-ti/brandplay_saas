-- Apaga TODOS os usuários e organizações de um ambiente, com tudo o que
-- depende deles, e mantém o schema, as migrations, o catálogo de planos e a
-- auditoria da plataforma. IRREVERSÍVEL.
--
-- Para quê: deixar homologação ou produção como recém-migrados antes da
-- importação do Lovable, que recusa e-mail já existente no destino com outro
-- id. Quando e como: README.md desta pasta. Rode 1-conferir.sql antes.
--
-- Cole no SQL Editor do Studio do ambiente — confira pela URL qual é — e
-- execute. É uma transação só: se uma guarda recusar ou algo falhar, nada é
-- apagado.
--
-- Fica:
--   migrations.schema_migrations   o banco continua migrado
--   billing_plans, billing_settings  catálogo e parâmetros (vêm da 0024 e
--                                  da área /admin; não são dado de cliente)
--   platform_admin_audit_log       histórico da plataforma; ganha uma linha
--                                  registrando este reset
--   storage.buckets                buckets da 0007/0025
--   storage.objects                o Storage bloqueia DELETE direto; apague
--                                  os arquivos de teste pela tela Storage
--
-- Sai: todas as linhas das demais tabelas de `public` e todos os usuários de
-- `auth.users` (o GoTrue apaga em cascata identidades, sessões e fatores).

begin;

set local lock_timeout = '5s';

-- ─── Guardas ─────────────────────────────────────────────────────────
do $guardas$
declare
  -- Acima disto não parece ambiente só com cadastro de teste. Se for, suba o
  -- limite aqui, conscientemente.
  _limite_organizacoes constant int := 20;
  _organizacoes int;
  _assinaturas  text;
begin
  select count(*) into _organizacoes from public.organizations;
  if _organizacoes > _limite_organizacoes then
    raise exception
      'reset recusado: % organizações (limite %). Isto não parece um ambiente só com cadastro de teste.',
      _organizacoes, _limite_organizacoes;
  end if;

  -- Apagar a linha não cancela nada no Stripe: a assinatura seguiria
  -- cobrando, sem organização para receber o webhook.
  select string_agg(coalesce(stripe_subscription_id, id::text) || ' (' || status || ')', ', ')
    into _assinaturas
    from public.billing_subscriptions
   where status in ('incompleta', 'trialing', 'ativa', 'inadimplente');
  if _assinaturas is not null then
    raise exception
      'reset recusado: há assinatura viva no Stripe: %. Cancele no Dashboard do Stripe, espere o webhook marcar como cancelada e rode de novo.',
      _assinaturas;
  end if;
end
$guardas$;

-- ─── Registro na auditoria da plataforma ─────────────────────────────
insert into public.platform_admin_audit_log (admin_user_id, action, target_type, before, comment)
select null,
       'reset_dados',
       'ambiente',
       jsonb_build_object(
         'usuarios',      (select count(*) from auth.users),
         'organizacoes',  (select count(*) from public.organizations),
         'emails',        (select coalesce(jsonb_agg(email order by email), '[]'::jsonb) from auth.users),
         'organizacoes_nomes', (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from public.organizations)
       ),
       'Reset dos dados (supabase/tools/resetar-dados) antes da importação do Lovable';

-- A FK da auditoria para organizations é `on delete set null`; com os
-- gatilhos desligados abaixo, ela não age sozinha.
update public.platform_admin_audit_log
   set organization_id = null
 where organization_id is not null;

-- ─── public: todas as tabelas, menos as mantidas ─────────────────────
--
-- Com os gatilhos desligados (`replica`): sem eles, apagar não gera linha de
-- auditoria de domínio, não recria conta de cobrança e não esbarra na ordem
-- das ~70 FKs entre as tabelas. Como todas as tabelas de domínio são
-- esvaziadas, nenhuma FK fica apontando para o que saiu.
set local session_replication_role = replica;

do $apagar$
declare
  _tabela regclass;
begin
  for _tabela in
    select c.oid::regclass
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind = 'r'
       and c.relname not in ('billing_plans', 'billing_settings', 'platform_admin_audit_log')
  loop
    execute format('delete from %s', _tabela);
  end loop;
end
$apagar$;

set local session_replication_role = origin;

-- ─── auth: com os gatilhos LIGADOS ───────────────────────────────────
--
-- Aqui as FKs precisam agir: é a cascata do próprio GoTrue que leva
-- identidades, sessões, refresh tokens e fatores de MFA. As FKs de `public`
-- para auth.users já não têm linha nenhuma.
delete from auth.users;

commit;

-- ─── Resultado ───────────────────────────────────────────────────────
-- Tudo zero, menos as mantidas. `arquivos_storage` acima de zero: apague pela
-- tela Storage do Studio.
select 'usuarios' as item, count(*)::text as valor from auth.users
union all select 'identidades', count(*)::text from auth.identities
union all select 'organizacoes', count(*)::text from public.organizations
union all select 'linhas_em_public_fora_as_mantidas',
  (select sum((xpath('/row/n/text()',
                query_to_xml(format('select count(*) as n from %s', c.oid::regclass), false, true, '')))[1]::text::bigint)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relname not in ('billing_plans', 'billing_settings', 'platform_admin_audit_log'))::text
union all select 'billing_plans (mantida)', count(*)::text from public.billing_plans
union all select 'migrations (mantida)', count(*)::text from migrations.schema_migrations
union all select 'arquivos_storage (apagar pela tela)', count(*)::text from storage.objects;
