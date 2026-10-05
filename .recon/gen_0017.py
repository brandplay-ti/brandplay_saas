import sys, re
sys.path.insert(0, '.recon')
from q import q
from collections import defaultdict

rows = q('lovable', """select tablename, policyname, cmd, coalesce(qual,''), coalesce(with_check,'')
                       from pg_policies where schemaname='public' order by tablename, cmd, policyname""")
repo_names = {(r[0], r[1]) for r in q('repo', "select tablename, policyname from pg_policies where schemaname='public'")}


def rw(e):
    e = re.sub(r'has_sponsor_access\(uid\(\), ', 'public.has_sponsor_portal_access(', e)
    e = re.sub(r'(?<![\w.])uid\(\)', 'auth.uid()', e)
    e = re.sub(r'(?<![\w.])(is_org_member|has_org_role|can_access_module)\(', r'public.\1(', e)
    return e


def policy(t, name, cmd, qual, wc, roles='authenticated'):
    s = f"create policy {name} on public.{t} for {cmd.lower()} to {roles}"
    if qual and cmd != 'INSERT':
        s += f"\n  using ({rw(qual)})"
    if wc and cmd != 'SELECT' and cmd != 'DELETE':
        s += f"\n  with check ({rw(wc)})"
    return s + ";"


module_tables = sorted({t for t, n, c, qq, w in rows if 'can_access_module' in qq + w})
out = ["""-- 0017_rls_module_write.sql
-- Leva para a RLS reconstruída as regras de acesso reais do Lovable que
-- faltavam, no padrão de nomes de 0005 (docs/architecture/
-- reconciliacao-schema-2026-10-02.md).
--
-- 1. Escrita por módulo (novo padrão 7, "<tabela>_module_<cmd>"): em 38
--    tabelas o Lovable só deixa escrever owner/admin ou o papel do módulo
--    (comercial -> crm, operacional -> operacional, financeiro -> financeiro),
--    via can_access_module(auth.uid(), organization_id, módulo, true). A
--    reconstrução usava um "<tabela>_tenant" FOR ALL com is_org_member: qualquer
--    membro escrevia em qualquer módulo. O "_tenant" vira "_tenant_read"
--    (leitura de membro), mantido só onde o Lovable dá leitura a membros.
--    Exclusões que o Lovable restringe por papel viram "<tabela>_admin_delete".
-- 2. Portal do patrocinador (padrão 6): leituras e a aprovação de entregas
--    que o portal usa e faltavam (contract_assets, contract_clauses,
--    property_media, sponsor_interactions, sponsors, sports_properties,
--    delivery_approval_log, deliveries UPDATE), escopadas por sponsor via
--    has_sponsor_portal_access.
-- 3. Escopo por usuário (padrão 3): conversas e sugestões de IA e logs de
--    erro eram legíveis por qualquer membro; passam a ser do próprio usuário
--    (logs: também owner/admin da organização).
-- 4. profiles: "profiles_select_any_authenticated" (using true) deixava
--    qualquer usuário logado ler o perfil de qualquer pessoa de qualquer
--    organização; passa a ser o próprio perfil + membros das mesmas
--    organizações.
-- 5. Leitura pública dos eventos de propriedades publicadas (media kit) e
--    "patrocinador vê o próprio acesso ao portal".
--
-- NÃO portado de propósito (violaria o isolamento por organização,
-- CLAUDE.md seção 6):
--   * policies com has_role(uid(), 'admin'): o papel GLOBAL admin lia,
--     alterava e apagava sports_properties/tier_sales/tier_assets de TODAS as
--     organizações;
--   * policies de "dono da linha" sem checar organização, inclusive
--     "Usuários criam suas propriedades" (insert com organization_id
--     arbitrário);
--   * contract_clause_templates continua com escrita só owner/admin
--     (padrão 4), mais restrito que o Lovable.
--
-- Risco conhecido herdado: deliveries_sponsor_portal_update libera todas as
-- colunas da entrega ao patrocinador (o Lovable faz o mesmo); restringir às
-- colunas de aprovação fica como melhoria futura.
"""]

out.append("\n-- 1. escrita por módulo")
for t in module_tables:
    tr = [r for r in rows if r[0] == t]
    out.append(f"\n-- {t}")
    out.append(f"drop policy if exists {t}_tenant on public.{t};")
    if any(c == 'SELECT' and 'is_org_member' in qq for _, _, c, qq, _ in tr):
        out.append(f"create policy {t}_tenant_read on public.{t} for select to authenticated\n  using (public.is_org_member(organization_id));")
    used = defaultdict(int)
    for _, n, c, qq, w in tr:
        e = qq + ' ' + w
        if 'has_role' in e:
            continue
        if 'can_access_module' in e:
            base = f"{t}_module_{c.lower()}"
        elif 'has_org_role' in e and c == 'DELETE':
            base = f"{t}_admin_delete"
        elif t == 'tier_sales' and c == 'INSERT' and 'is_org_member' in e:
            base = "tier_sales_member_insert"
        else:
            continue
        used[base] += 1
        name = base if used[base] == 1 else f"{base}_{used[base]}"
        assert (t, name) not in repo_names, (t, name)
        out.append(f"-- Lovable: \"{n}\"")
        out.append(policy(t, name, c, qq, w))

out.append("\n-- 2. portal do patrocinador")
portal = [('contract_assets', 'SELECT'), ('contract_clauses', 'SELECT'), ('property_media', 'SELECT'),
          ('sponsor_interactions', 'SELECT'), ('sponsors', 'SELECT'), ('sports_properties', 'SELECT'),
          ('delivery_approval_log', 'SELECT'), ('delivery_approval_log', 'INSERT'), ('deliveries', 'UPDATE')]
suffix = {'SELECT': 'read', 'INSERT': 'insert', 'UPDATE': 'update'}
for t, c in portal:
    cand = [r for r in rows if r[0] == t and r[2] == c and 'has_sponsor_access' in r[3] + r[4]]
    assert len(cand) == 1, (t, c, len(cand))
    _, n, _, qq, w = cand[0]
    name = f"{t}_sponsor_portal_{suffix[c]}"
    out.append(f"-- Lovable: \"{n}\"")
    out.append(f"drop policy if exists {name} on public.{t};")
    out.append(policy(t, name, c, qq, w))

out.append("""
-- delivery_approval_log: a leitura e o insert de membros já não vêm do
-- _tenant FOR ALL (que permitia também update/delete do log de aprovação)
drop policy if exists delivery_approval_log_tenant on public.delivery_approval_log;
create policy delivery_approval_log_tenant_read on public.delivery_approval_log for select to authenticated
  using (public.is_org_member(organization_id));
create policy delivery_approval_log_member_insert on public.delivery_approval_log for insert to authenticated
  with check (decided_by = auth.uid() and public.is_org_member(organization_id));

-- 3. escopo por usuário
drop policy if exists ai_conversations_tenant on public.ai_conversations;
create policy ai_conversations_own on public.ai_conversations for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

drop policy if exists ai_messages_via_conversation on public.ai_messages;
create policy ai_messages_own_via_conversation on public.ai_messages for all to authenticated
  using (exists (select 1 from public.ai_conversations c
                 where c.id = ai_messages.conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.ai_conversations c
                      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()));

drop policy if exists ai_suggestions_tenant on public.ai_suggestions;
create policy ai_suggestions_own on public.ai_suggestions for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- logs: gravados pelas Edge Functions com service_role; usuários só leem
drop policy if exists backend_error_logs_tenant on public.backend_error_logs;
create policy backend_error_logs_own_read on public.backend_error_logs for select to authenticated
  using (user_id = auth.uid());
create policy backend_error_logs_admin_read on public.backend_error_logs for select to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists error_reports_tenant on public.error_reports;
create policy error_reports_own_read on public.error_reports for select to authenticated
  using (user_id = auth.uid());
create policy error_reports_admin_read on public.error_reports for select to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner','admin']));

-- 4. profiles
drop policy if exists profiles_select_any_authenticated on public.profiles;
create policy profiles_select_same_org on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.organization_members me
      join public.organization_members other on other.organization_id = me.organization_id
      where me.user_id = auth.uid() and other.user_id = profiles.id
    )
  );

-- 5. leitura pública e acesso próprio ao portal
drop policy if exists property_events_public_read on public.property_events;
create policy property_events_public_read on public.property_events for select to anon, authenticated
  using (public.is_property_published(property_id));

drop policy if exists sponsor_portal_access_own on public.sponsor_portal_access;
create policy sponsor_portal_access_own on public.sponsor_portal_access for select to authenticated
  using (user_id = auth.uid());
""")
open('supabase/migrations/0017_rls_module_write.sql', 'w', encoding='utf-8').write("\n".join(out) + "\n")
print('tabelas de módulo:', len(module_tables))
