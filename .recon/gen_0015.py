import sys
sys.path.insert(0, '.recon')
from q import q


def fdefs(db, name):
    return q(db, f"""select pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
                     from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='{name}'""")


def ident_args(db, name):
    return [r[0] for r in q(db, f"select pg_get_function_identity_arguments(oid) from pg_proc where pronamespace='public'::regnamespace and proname='{name}'")]


def grants(sig, roles):
    out = [f"revoke all on function public.{sig} from public, anon, authenticated;"]
    if roles:
        out.append(f"grant execute on function public.{sig} to {', '.join(roles)};")
    return "\n".join(out)


AUTH = ['authenticated', 'service_role']
SR = ['service_role']
ANON = ['anon', 'authenticated', 'service_role']

# nome -> (roles, observação). Corpo e assinatura vêm do Lovable.
adopt = {
    'handle_new_user': (SR, 'cria profile, papel global comercial e aceita convite pendente; sem convite, cria a organização pessoal (comportamento real do produto)'),
    'create_organization_with_owner': (SR, 'só service_role (Edge Function create-organization). Antes executável por anon/authenticated com _owner_id arbitrário'),
    'accept_sponsor_invite_by_token': (ANON, 'fluxo público por token'),
    'get_organization_invite_by_token': (ANON, 'fluxo público por token'),
    'get_sponsor_invite_by_token': (ANON, 'fluxo público por token'),
    'debug_table_policies': (SR, 'diagnóstico; antes executável por authenticated/anon'),
    'get_user_org': (AUTH, ''),
    'user_sponsor_ids': (AUTH, 'retorno real: setof uuid (antes uuid[])'),
    'get_portal_sponsor_overview': (AUTH, 'checa has_sponsor_access internamente'),
    'get_delivery_report_data': (SR, 'chamada pela Edge Function generate-delivery-report com service_role'),
    'mark_overdue_installments': (AUTH, 'bloqueia _owner diferente de auth.uid() fora do service_role'),
    'archive_sponsor': (AUTH, 'exige owner/admin'),
    'unarchive_sponsor': (AUTH, 'exige owner/admin'),
    'merge_sponsors': (AUTH, 'exige owner/admin'),
    'generate_contract_deliveries': (SR, 'chamada pelos triggers de contrato'),
    'generate_contract_installments': (SR, 'chamada pelos triggers de contrato'),
    'sync_opportunity_stage': (SR, 'DESVIO DELIBERADO: no Lovable era SECURITY DEFINER executável por anon/authenticated sem checar organização (qualquer um mudava o estágio de qualquer oportunidade). Só triggers/service_role a usam'),
    'sync_opportunity_contact_to_sponsor': (SR, 'DESVIO DELIBERADO: mesmo caso de sync_opportunity_stage'),
    'create_renewal_opportunity': (AUTH, 'exige can_access_module crm escrita'),
    'log_sponsor_interaction': (SR, 'chamada pelos triggers de interação'),
}
# mantidas da reconstrução (mais seguras/corretas que o Lovable)
keep = {
    'copy_opportunity_tier_to_proposal': (AUTH, 'MANTIDA (invoker, protegida por RLS). No Lovable é SECURITY DEFINER sem checar organização e restrita a service_role, o que fazia a chamada do frontend (OpportunityDrawer) falhar em silêncio'),
    'copy_proposal_items_to_contract': (AUTH, 'MANTIDA pelo mesmo motivo (chamada por OpportunityDrawer e Proposals)'),
    'copy_opportunity_tier_to_contract': (AUTH, 'MANTIDA (0011, não existe no Lovable)'),
}

out = ["""-- 0015_lovable_business_functions.sql
-- Porta para o schema reconstruído o corpo, a assinatura e o modo de segurança
-- reais das funções de negócio do Lovable (docs/architecture/
-- reconciliacao-schema-2026-10-02.md), e corrige permissões de execução.
--
-- Regra aplicada: adota-se a versão do Lovable, exceto quando a da
-- reconstrução é deliberadamente mais segura (registrado função a função).
-- As permissões não copiam o Lovable cegamente: funções SECURITY DEFINER sem
-- checagem de organização nunca ficam executáveis por anon/authenticated.
--
-- Funções com retorno ou ordem de parâmetros diferente são recriadas (drop +
-- create). Clientes PostgREST usam parâmetros nomeados; o retorno passa a ser
-- o que o frontend (gerado contra o Lovable) espera: jsonb, setof uuid.
--
-- Depende de 0012 (helpers na ordem real de parâmetros).
"""]

for name, (roles, note) in adopt.items():
    L = fdefs('lovable', name)
    assert len(L) == 1, (name, len(L))
    largs, ldef = L[0]
    out.append(f"\n-- {name}" + (f": {note}" if note else ""))
    for rargs in ident_args('repo', name):
        if rargs != largs:
            out.append(f"drop function if exists public.{name}({rargs});")
        else:
            # mesma assinatura: drop mesmo assim se o retorno mudou (create or replace não troca retorno)
            rret = q('repo', f"select pg_get_function_result(oid) from pg_proc where pronamespace='public'::regnamespace and proname='{name}' and pg_get_function_identity_arguments(oid)='{rargs}'")[0][0]
            lret = q('lovable', f"select pg_get_function_result(oid) from pg_proc where pronamespace='public'::regnamespace and proname='{name}'")[0][0]
            if rret != lret:
                out.append(f"drop function if exists public.{name}({rargs});")
    out.append(ldef.rstrip() + ";")
    out.append(grants(f"{name}({largs})", roles))

out.append("\n-- Mantidas da reconstrução: só permissões (remove anon)")
for name, (roles, note) in keep.items():
    for rargs in ident_args('repo', name):
        out.append(f"-- {name}: {note}")
        out.append(grants(f"{name}({rargs})", roles))

# view crm_unlinked_records
vdef = q('lovable', "select pg_get_viewdef('public.crm_unlinked_records'::regclass, true)")[0][0]
out.append(f"""
-- crm_unlinked_records: definição real (a reconstrução não tinha como inferir o SQL)
drop view if exists public.crm_unlinked_records;
create view public.crm_unlinked_records with (security_invoker = on) as
{vdef.rstrip().rstrip(';')};
grant select on public.crm_unlinked_records to authenticated, service_role;""")

open('supabase/migrations/0015_lovable_business_functions.sql', 'w', encoding='utf-8').write("\n".join(out) + "\n")
print('ok')
