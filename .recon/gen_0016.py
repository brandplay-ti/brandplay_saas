import sys
sys.path.insert(0, '.recon')
from q import q

fsql = """select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid), pg_get_functiondef(p.oid)
from pg_proc p where p.pronamespace='public'::regnamespace
and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') order by 1"""
L = q('lovable', fsql)
Rn = {r[0] for r in q('repo', fsql)}

tsql = """select n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users') or (n.nspname='storage' and c.relname='objects'))
order by 1,2,3"""
LT = q('lovable', tsql)
RT = {(r[0], r[1], r[2]) for r in q('repo', tsql)}

out = ["""-- 0016_lovable_triggers.sql
-- Porta as 47 funções de trigger e os triggers reais do Lovable que faltavam
-- na reconstrução (o types.ts não expõe triggers). Categorias:
--
--   * preenchimento de organization_id a partir do pai ou do usuário (o
--     frontend NÃO envia organization_id em ~37 inserts; sem estes triggers a
--     RLS rejeita o insert, ou a linha fica com organization_id nulo e
--     invisível, ex.: lead do media kit público);
--   * updated_at;
--   * automações de negócio (contrato ativo gera parcelas e entregas,
--     sincronismo de estágio da oportunidade, ciclo de vida do patrocinador,
--     efeitos de tarefas de CRM, lead -> oportunidade, oportunidade ganha);
--   * validação de organização do registro pai (isolamento entre tenants);
--   * log de interações do patrocinador, auditoria, numeração de proposta,
--     funil padrão, menções, validações de perda e de lead.
--
-- ATENÇÃO (comportamento herdado do Lovable): quando organization_id vem nulo,
-- vários triggers usam get_user_org(), que devolve a organização ATIVA MAIS
-- ANTIGA do usuário, não a selecionada na UI. Para usuários em mais de uma
-- organização o registro pode cair na organização errada (sempre uma da qual
-- o usuário é membro). Correção definitiva: o frontend enviar o
-- organization_id ativo nesses inserts (os triggers só preenchem se nulo).
--
-- Substitui o trigger da reconstrução contracts_activated_generate (0010),
-- coberto pelos triggers reais trg_contracts_generate_installments/deliveries;
-- manter os dois geraria parcelas e entregas em dobro.
--
-- Funções de trigger não ficam executáveis por anon/authenticated (o disparo
-- de trigger não exige EXECUTE).
"""]

out.append("drop trigger if exists contracts_activated_generate on public.contracts;")
out.append("drop function if exists public.trigger_contract_activated();")

for name, args, ret, d in L:
    if name in Rn:
        continue
    out.append(f"\n-- {name}")
    out.append(d.rstrip() + ";")
    roles = 'service_role' if ret == 'trigger' else 'authenticated, service_role'
    out.append(f"revoke all on function public.{name}({args}) from public, anon, authenticated;")
    out.append(f"grant execute on function public.{name}({args}) to {roles};")

out.append("\n-- triggers")
n = 0
for nsp, rel, tg, d in LT:
    if (nsp, rel, tg) in RT:
        continue
    out.append(f"drop trigger if exists {tg} on {nsp}.{rel};")
    out.append(d + ";")
    n += 1
open('supabase/migrations/0016_lovable_triggers.sql', 'w', encoding='utf-8').write("\n".join(out) + "\n")
print('triggers:', n)
