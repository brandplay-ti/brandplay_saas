-- 0026_cobranca_bloqueio_no_banco.sql
--
-- Organização sem acesso (teste vencido, sem assinatura e sem liberação
-- provisória) fica bloqueada NO BANCO para os próprios membros — não só na
-- tela (ADR-0007, que registrava isso como pendência).
--
-- Como: uma policy RESTRICTIVE por tabela de organização. O Postgres combina
-- policies restritivas com AND às permissivas, então nenhuma das ~80 policies
-- existentes muda: a linha continua precisando passar por elas, e agora também
-- por esta.
--
--   linha visível/gravável  ⇔  (policies de antes)  E  organização da linha
--                                                      não está bloqueada
--                                                      para quem consulta
--
-- "Bloqueada para quem consulta" = o usuário é membro ativo dela e ela está
-- sem acesso. Por isso:
--   - o portal do patrocinador continua funcionando: o patrocinador não é
--     membro da organização dona do patrocínio;
--   - o Media Kit público continua: a policy vale para `authenticated`, não
--     para `anon`;
--   - service role e funções SECURITY DEFINER (webhook, gatilhos) não passam
--     por RLS e seguem iguais.
--
-- Ficam FORA, de propósito:
--   - billing_*: a tela de plano precisa ler plano, assinatura e faturas
--     justamente quando está bloqueada;
--   - organization_members e organization_invites: o painel carrega a
--     organização por elas, e reduzir a equipe para caber num plano menor
--     precisa funcionar bloqueado;
--   - backend_error_logs e error_reports: telemetria de erro, não dado de
--     produto.
--
-- Custo: `billing_blocked_orgs()` não depende da linha; entre parênteses vira
-- InitPlan e roda UMA vez por consulta, não por linha.
--
-- Tabela nova com `organization_id` precisa desta policy — o teste de
-- cobertura em supabase/tests/cobranca.sql falha se faltar.

create or replace function public.billing_blocked_orgs()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(array_agg(om.organization_id), '{}'::uuid[])
    from public.organization_members om
   where om.user_id = auth.uid()
     and om.status = 'ativo'
     and (public.billing_access_plan(om.organization_id)).id is null;
$$;

comment on function public.billing_blocked_orgs() is
  'Organizações em que o usuário autenticado é membro ativo e que estão sem acesso (sem assinatura, teste ou liberação).';

revoke all on function public.billing_blocked_orgs() from public, anon;
grant execute on function public.billing_blocked_orgs() to authenticated, service_role;

-- ─── Policies restritivas ────────────────────────────────────────────
do $$
declare
  _tabela text;
  _fora   text[] := array[
    'billing_accounts', 'billing_subscriptions', 'billing_invoices', 'billing_access_grants',
    'organization_members', 'organization_invites',
    'backend_error_logs', 'error_reports'
  ];
begin
  for _tabela in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
       and exists (
         select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
       )
       and c.relname <> all (_fora)
     order by c.relname
  loop
    execute format('drop policy if exists billing_access_restrictive on public.%I', _tabela);
    execute format(
      $p$create policy billing_access_restrictive on public.%I
           as restrictive for all to authenticated
           using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
           with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))$p$,
      _tabela
    );
  end loop;
end $$;

-- ai_messages não tem organization_id: herda da conversa.
drop policy if exists billing_access_restrictive on public.ai_messages;
create policy billing_access_restrictive on public.ai_messages
  as restrictive for all to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
       where c.id = ai_messages.conversation_id
         and (c.organization_id is null or c.organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
    )
  )
  with check (
    exists (
      select 1 from public.ai_conversations c
       where c.id = ai_messages.conversation_id
         and (c.organization_id is null or c.organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
    )
  );
