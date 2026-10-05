import sys, re
sys.path.insert(0, '.recon')
from q import q


def fdef(db, name, args=None):
    w = f"and pg_get_function_identity_arguments(p.oid)='{args}'" if args else ""
    r = q(db, f"select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='{name}' {w}")
    assert len(r) == 1, (name, args, len(r))
    return r[0][0].rstrip() + ';'


def grants(sig, roles):
    out = [f"revoke all on function public.{sig} from public, anon, authenticated;"]
    if roles:
        out.append(f"grant execute on function public.{sig} to {', '.join(roles)};")
    return "\n".join(out)


# ---------------- 0012: helpers de autorização na ordem real de parâmetros
helpers = [  # (nome, assinatura repo p/ drop, args lovable, roles)
    ('is_org_member', 'uuid, uuid', '_user_id uuid, _org_id uuid', ['authenticated', 'service_role']),
    ('has_org_role', 'uuid, public.org_role[], uuid', '_user_id uuid, _org_id uuid, _roles org_role[]', ['authenticated', 'service_role']),
    ('has_role', 'public.app_role, uuid', '_user_id uuid, _role app_role', ['authenticated', 'service_role']),
    ('has_sponsor_access', 'uuid, uuid', '_user_id uuid, _sponsor_id uuid', ['authenticated', 'service_role']),
    ('can_access_module', 'uuid, uuid, text, boolean', '_user_id uuid, _org_id uuid, _module text, _write boolean', ['authenticated', 'service_role']),
    ('can_access_contract_file', 'text, uuid', '_user_id uuid, _path text', ['authenticated', 'service_role']),
]
H = ["""-- 0012_lovable_helper_signatures.sql
-- Reconciliação com o schema real do Lovable
-- (docs/architecture/reconciliacao-schema-2026-10-02.md).
--
-- As sobrecargas com _user_id explícito foram reconstruídas (0008/0009) com os
-- parâmetros em ordem alfabética, herdada do types.ts. As funções reais do
-- Lovable portadas nas migrations seguintes chamam esses helpers de forma
-- POSICIONAL na ordem real (_user_id primeiro): sem esta migration, os
-- argumentos chegariam trocados e as checagens errariam em silêncio.
-- Chamadas via PostgREST usam parâmetros nomeados e não são afetadas.
--
-- As versões de 1 argumento (is_org_member(org), has_org_role(org, text[])),
-- usadas pelas policies de 0005, não mudam.
--
-- Permissões: só authenticated/service_role (antes herdavam o EXECUTE padrão
-- de PUBLIC, inclusive anon). can_access_contract_file era anon no Lovable;
-- aqui fica sem anon (contratos são privados).
"""]
for name, rsig, largs, roles in helpers:
    H.append(f"\n-- {name}\ndrop function if exists public.{name}({rsig});\n" + fdef('lovable', name, largs) + "\n" + grants(f"{name}({largs})", roles))
open('supabase/migrations/0012_lovable_helper_signatures.sql', 'w', encoding='utf-8').write("\n".join(H) + "\n")

# ---------------- 0013: colunas (tipo e default)
sql = """select c.relname, a.attname, format_type(a.atttypid,a.atttypmod), coalesce(pg_get_expr(d.adbin,d.adrelid),'')
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by 1,2"""
L = {(r[0], r[1]): (r[2], r[3]) for r in q('lovable', sql)}
R = {(r[0], r[1]): (r[2], r[3]) for r in q('repo', sql)}
C = ["""-- 0013_lovable_column_alignment.sql
-- Alinha tipo e default de 68 colunas ao schema real do Lovable.
--
-- Tipos: o types.ts não distingue integer/numeric/numeric(p,s) nem date/
-- timestamptz (tudo vira number/string), então a reconstrução chutou. Os
-- tipos reais evitam perda na importação dos dados do Lovable: coordenadas e
-- durações fracionárias do BrandTrack em integer, confidence/score em
-- numeric(5,2) arredondando, datas em timestamptz ganhando fuso.
--
-- Defaults: vários contrariavam os domínios reais (CHECKs portados em 0014),
-- ex.: ai_suggestions.status 'pendente' (real: 'nova'), tier_sales.status
-- 'reservado' (real: 'reservada').
--
-- Conversões com perda possível (só afetam linhas já gravadas no self-hosted,
-- hoje apenas o ambiente local): numeric -> integer arredonda; timestamptz ->
-- date usa a data em America/Sao_Paulo.
"""]
for (t, c) in sorted(k for k in L if L[k] != R.get(k)):
    lt, ld = L[(t, c)]
    rt, rd = R[(t, c)]
    stmts = []
    if lt != rt:
        if rd:
            stmts.append(f"alter column {c} drop default")
        if lt == 'integer' and rt.startswith('numeric'):
            using = f"round({c})::integer"
        elif lt == 'date' and rt.startswith('timestamp'):
            using = f"({c} at time zone 'America/Sao_Paulo')::date"
        elif lt == 'date[]' and rt == 'text[]':
            using = f"{c}::date[]"
        else:
            using = f"{c}::{lt}"
        stmts.append(f"alter column {c} type {lt} using {using}")
        if ld:
            stmts.append(f"alter column {c} set default {ld}")
    elif ld != rd:
        stmts.append(f"alter column {c} set default {ld}" if ld else f"alter column {c} drop default")
    C.append(f"alter table public.{t}\n  " + ",\n  ".join(stmts) + ";")
open('supabase/migrations/0013_lovable_column_alignment.sql', 'w', encoding='utf-8').write("\n".join(C) + "\n")

# ---------------- 0014: constraints e índices do Lovable que faltam
cons = """select conrelid::regclass::text, conname, contype, pg_get_constraintdef(oid) from pg_constraint
where connamespace='public'::regnamespace and contype in ('c','u','f')"""
Lc = q('lovable', cons)
Rc = q('repo', cons)
rdefs = {(r[0], r[3]) for r in Rc}
rnames = {(r[0], r[1]) for r in Rc}
fk_ondelete_fix = {('deliveries', 'sponsor_id'), ('installments', 'sponsor_id'),
                   ('sellout_reports', 'property_id'), ('sponsors', 'merged_into_sponsor_id')}
X = ["""-- 0014_lovable_constraints_indexes.sql
-- CHECKs de domínio, UNIQUEs e índices que existem no Lovable e faltavam na
-- reconstrução (o types.ts não os expõe).
--
-- UNIQUEs: são alvo de upserts do app e falhavam com "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification", ex.:
-- pipeline_stage_slas (Pipeline.tsx: salvar SLAs) e market_benchmarks
-- (Edge Function ticket-benchmark-ai).
--
-- FKs: 4 FKs existiam nos dois lados com ON DELETE diferente; adota-se o do
-- Lovable. Exceção deliberada: sports_properties.owner_id continua SEM
-- cascade (no Lovable, excluir o usuário apagaria as propriedades dele).
-- As 140 FKs que só existem aqui ficam (integridade); órfãos serão tratados
-- na importação de dados.
"""]
for t, n, ty, d in sorted(Lc, key=lambda r: (r[0], r[2], r[1])):
    if (t, d) in rdefs:
        continue
    if ty == 'f':
        col = re.match(r'FOREIGN KEY \(([^)]*)\)', d).group(1)
        if (t, col) not in fk_ondelete_fix:
            continue
        old = [r[1] for r in Rc if r[0] == t and r[2] == 'f' and r[3].startswith(f'FOREIGN KEY ({col})')]
        X.append(f"alter table public.{t} drop constraint {old[0]};")
    name = n if (t, n) not in rnames else n + '_lovable'
    X.append(f"alter table public.{t} add constraint {name} {d};")
idx = """select tablename, indexname, indexdef from pg_indexes i where schemaname='public'
and not exists (select 1 from pg_constraint c where c.conname=i.indexname)"""
Li = q('lovable', idx)
Ri = q('repo', idx)


def norm(s):
    return re.sub(r'INDEX \S+ ON', 'INDEX ON', s)


rset = {norm(r[2]) for r in Ri}
rnames_i = {r[1] for r in Ri}
X.append("\n-- índices")
for t, n, d in sorted(Li):
    if norm(d) in rset:
        continue
    if n in rnames_i:
        d = d.replace(f'INDEX {n} ON', f'INDEX {n}_lovable ON')
    X.append(d.replace('CREATE INDEX', 'create index if not exists').replace('CREATE UNIQUE INDEX', 'create unique index if not exists') + ";")
open('supabase/migrations/0014_lovable_constraints_indexes.sql', 'w', encoding='utf-8').write("\n".join(X) + "\n")
print("ok")
