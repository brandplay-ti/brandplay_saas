-- 0008_business_functions.sql
-- Reconstrução das funções de negócio "escalares"/utilitárias que faltavam
-- (ver supabase/migrations/SCHEMA_NOTES.md, seção "Funções de negócio
-- reconstruídas (0008-0010)" para o detalhe de evidência/confiança de cada
-- uma). Nenhuma delas tem o corpo SQL original disponível em lugar nenhum do
-- repositório — types.ts só revela nome/assinatura/tipo de retorno. Toda
-- suposição está documentada em `comment on function` logo abaixo de cada
-- função e, de forma mais extensa, em SCHEMA_NOTES.md.
--
-- Nunca editar 0001..0007 (já aplicadas) — isto é migration nova.

-- =========================================================================
-- SEÇÃO 1: sobrecargas explícitas de is_org_member / has_org_role
-- (assinatura "antiga" do remoto, com _user_id explícito — ver 0004_functions.sql
-- e SCHEMA_NOTES.md "Divergência deliberada"). Convivem com as versões
-- baseadas em auth.uid() já existentes (usadas pelas policies de RLS); estas
-- aqui são para uso a partir de contexto de service_role (Edge Functions
-- verificando acesso de um usuário que não é o da sessão atual) ou de código
-- legado que ainda chame a RPC com _user_id. SECURITY DEFINER é necessário
-- aqui porque, ao contrário das versões auth.uid(), estas precisam enxergar
-- organization_members de QUALQUER usuário, não só do caller — o acesso só é
-- seguro porque a função devolve exclusivamente um boolean (nunca a linha
-- crua), igual ao padrão já usado em is_asset_publicly_visible etc.
-- =========================================================================

create or replace function public.is_org_member(_org_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = _org_id
      and om.user_id = _user_id
      and om.status = 'ativo'
  );
$$;

comment on function public.is_org_member(uuid, uuid) is
  'Sobrecarga explícita (confiança alta, schema puro): equivalente a is_org_member(uuid) mas para um _user_id arbitrário, não necessariamente auth.uid(). Uso esperado: Edge Functions com service_role verificando acesso de outro usuário, ou código legado chamando a RPC remota original. SECURITY DEFINER necessário para enxergar organization_members de qualquer usuário; só expõe um boolean.';

create or replace function public.has_org_role(_org_id uuid, _roles public.org_role[], _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = _org_id
      and om.user_id = _user_id
      and om.status = 'ativo'
      and om.role = any(_roles)
  );
$$;

comment on function public.has_org_role(uuid, public.org_role[], uuid) is
  'Sobrecarga explícita (confiança alta, schema puro): equivalente a has_org_role(uuid, text[]) mas para um _user_id arbitrário e com _roles tipado como org_role[] (assinatura original do remoto). Mesmo uso/justificativa de is_org_member(uuid, uuid).';

-- =========================================================================
-- SEÇÃO 2: Grupo A - mecânicas, baixo risco, inferidas diretamente do schema
-- =========================================================================

create or replace function public.get_user_org(_user_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where user_id = _user_id
    and status = 'ativo'
  order by created_at asc
  limit 1;
$$;

comment on function public.get_user_org(uuid) is
  'Confiança média: no modelo multi-org do BrandPlay (CLAUDE.md seção 6) um usuário pode pertencer a várias organizações, então "a organização" de um usuário é inerentemente ambíguo - escolhemos devolver a mais antiga membership ativa (order by created_at asc limit 1) como heurística razoável para um relance legado/single-tenant. Deliberadamente NÃO é SECURITY DEFINER: roda com os privilégios do caller, então a policy organization_members_select (is_org_member) já restringe o resultado a organizações que o próprio caller também integra - não vaza a organização de um usuário que não compartilha nenhuma org com quem chama.';

create or replace function public.has_role(_role public.app_role, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

comment on function public.has_role(public.app_role, uuid) is
  'Confiança alta: leitura direta de user_roles. SECURITY DEFINER porque o único call site confirmado (supabase/functions/manage-portal-access/index.ts) chama via client service_role com o próprio id do usuário autenticado (user.id) - mantemos SECURITY DEFINER por paridade com o padrão já usado nas funções bônus de 0004, e porque expõe só um boolean (não a lista de papéis).';

create or replace function public.has_sponsor_access(_sponsor_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sponsor_portal_access spa
    where spa.sponsor_id = _sponsor_id
      and spa.user_id = _user_id
      and spa.status = 'ativo'
  );
$$;

comment on function public.has_sponsor_access(uuid, uuid) is
  'Confiança alta (schema puro, espelha has_sponsor_portal_access(uuid) de 0004_functions.sql, mas com _user_id explícito). Nenhum call site encontrado em src/ ou supabase/functions/ - reconstruída por inferência de nome/assinatura e do padrão já usado pela variante auth.uid(). SECURITY DEFINER pelo mesmo motivo das demais variantes explícitas.';

create or replace function public.user_sponsor_ids(_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(sponsor_id), '{}'::uuid[])
  from public.sponsor_portal_access
  where user_id = _user_id
    and status = 'ativo';
$$;

comment on function public.user_sponsor_ids(uuid) is
  'Confiança alta (schema puro). types.ts lista retorno "string[]"; são uuid[] (ids de sponsors). Nenhum call site encontrado - provável uso em Edge Function/portal para resolver todos os patrocinadores que um usuário do portal pode ver. SECURITY DEFINER necessário para resolver o array de QUALQUER _user_id (não só auth.uid()).';

create or replace function public.log_sponsor_interaction(
  _contract_id uuid,
  _delivery_id uuid,
  _description text,
  _installment_id uuid,
  _metadata json,
  _opportunity_id uuid,
  _owner_id uuid,
  _proposal_id uuid,
  _sponsor_id uuid,
  _title text,
  _type public.sponsor_interaction_type
)
returns void
language plpgsql
set search_path = public
as $$
declare
  _org_id uuid;
begin
  select organization_id into _org_id
  from public.sponsors
  where id = _sponsor_id;

  if _org_id is null then
    raise exception 'log_sponsor_interaction: patrocinador % não encontrado ou sem organização', _sponsor_id;
  end if;

  insert into public.sponsor_interactions (
    organization_id, owner_id, created_by, sponsor_id, title, type, source,
    description, related_contract_id, related_delivery_id, related_installment_id,
    related_opportunity_id, related_proposal_id, metadata
  ) values (
    _org_id, coalesce(_owner_id, auth.uid()), auth.uid(), _sponsor_id, _title, _type, 'manual',
    _description, _contract_id, _delivery_id, _installment_id,
    _opportunity_id, _proposal_id, coalesce(_metadata::jsonb, '{}'::jsonb)
  );
end;
$$;

comment on function public.log_sponsor_interaction(uuid, uuid, text, uuid, json, uuid, uuid, uuid, uuid, text, public.sponsor_interaction_type) is
  'Confiança alta: é essencialmente um INSERT tipado em sponsor_interactions (colunas confirmadas em 0003_tables.sql). organization_id é sempre derivado do sponsor (nunca aceito como parâmetro, ver CLAUDE.md seção 7). source fixado em "manual" pois não há parâmetro _source na assinatura original (deduzido de types.ts - chamadas automáticas/IA provavelmente usam um caminho de insert direto, não esta RPC). NÃO é SECURITY DEFINER: roda como o caller, e o INSERT já é barrado pela policy sponsor_interactions_tenant (is_org_member) via WITH CHECK, o que automaticamente impede logar interação em organização da qual o caller não é membro.';

-- =========================================================================
-- SEÇÃO 3: Grupo A - introspecção de debug
-- =========================================================================

create or replace function public.debug_table_policies(_table_name text)
returns json
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(json_agg(row_to_json(p)), '[]'::json)
  from (
    select policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename = _table_name
  ) p;
$$;

comment on function public.debug_table_policies(text) is
  'Confiança alta (função de introspecção, baixo risco por natureza): agrega pg_policies filtrando por tablename em JSON. SECURITY DEFINER para garantir leitura consistente de pg_policies independente de grants específicos; por ser uma ferramenta de debug/administração, o EXECUTE é revogado de PUBLIC/anon logo abaixo e concedido só a authenticated (desvio deliberado do padrão "GRANT implícito" do restante do schema, documentado aqui).';

revoke all on function public.debug_table_policies(text) from public;
grant execute on function public.debug_table_policies(text) to authenticated;

-- =========================================================================
-- SEÇÃO 4: Grupo C - convites (evidência: src/pages/portal/PortalLogin.tsx)
-- =========================================================================

-- get_sponsor_invite_by_token / accept_sponsor_invite_by_token: contrato
-- confirmado por leitura de src/pages/portal/PortalLogin.tsx (único call
-- site real no repositório). A página carrega o convite ANTES do login
-- (usuário ainda anônimo) via `.rpc("get_sponsor_invite_by_token", {
-- p_token }).maybeSingle()`, espera `data.email` e `data.sponsor_name`, e
-- aceita via `.rpc("accept_sponsor_invite_by_token", { p_token })` logo
-- após signUp/signIn bem-sucedido (usuário já autenticado nesse ponto).
create or replace function public.get_sponsor_invite_by_token(p_token text)
returns table(email text, expires_at timestamptz, sponsor_name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select si.email, si.expires_at, s.name as sponsor_name, si.status
  from public.sponsor_invites si
  join public.sponsors s on s.id = si.sponsor_id
  where si.token = p_token;
$$;

comment on function public.get_sponsor_invite_by_token(text) is
  'Confiança alta: contrato de colunas confirmado em src/pages/portal/PortalLogin.tsx (usa data.email e data.sponsor_name via .maybeSingle()). SECURITY DEFINER obrigatório: chamada por um visitante ainda SEM sessão (anon), antes de login/signup, só para mostrar "você foi convidado por X" - não expõe nada além de email/validade/nome do patrocinador/status de um token que o próprio visitante já possui (veio do link do e-mail).';

create or replace function public.accept_sponsor_invite_by_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _invite public.sponsor_invites%rowtype;
  _uid uuid := auth.uid();
  _email text;
  _org_id uuid;
begin
  if _uid is null then
    raise exception 'accept_sponsor_invite_by_token: usuário não autenticado';
  end if;

  select email into _email from auth.users where id = _uid;

  select * into _invite
  from public.sponsor_invites
  where token = p_token
    and status = 'pendente'
    and expires_at > now();

  if not found then
    return false;
  end if;

  if _email is null or lower(_invite.email) <> lower(_email) then
    raise exception 'accept_sponsor_invite_by_token: e-mail da conta autenticada não corresponde ao convite';
  end if;

  _org_id := coalesce(_invite.organization_id, (select organization_id from public.sponsors where id = _invite.sponsor_id));

  insert into public.sponsor_portal_access (organization_id, sponsor_id, user_id, granted_by, status)
  values (_org_id, _invite.sponsor_id, _uid, _invite.invited_by, 'ativo')
  on conflict (sponsor_id, user_id) do update set status = 'ativo', updated_at = now();

  insert into public.user_roles (user_id, role)
  values (_uid, 'patrocinador')
  on conflict (user_id, role) do nothing;

  update public.sponsor_invites
  set status = 'aceito', accepted_at = now(), accepted_user_id = _uid
  where id = _invite.id;

  return true;
end;
$$;

comment on function public.accept_sponsor_invite_by_token(text) is
  'Confiança alta/média: fluxo geral (buscar convite pendente+não expirado, conceder sponsor_portal_access, marcar aceito) é direto a partir do schema e do call site em PortalLogin.tsx. Pontos assumidos (médio): (1) valor de status pós-aceite = ''aceito'' - confirmado em src/components/sponsors/SponsorPortalAccess.tsx e src/pages/dashboard/PortalAccess.tsx, que já filtram/exibem i.status === "aceito"; (2) concede automaticamente o app_role ''patrocinador'' em user_roles (não há evidência direta disso no código, mas sem isso nada no app atribuiria esse papel a um usuário de portal recém-criado - sem o papel, outras RPCs e o gate de portal ficariam quebrados; ON CONFLICT DO NOTHING torna a suposição inofensiva se estiver errada). SECURITY DEFINER necessário: precisa inserir em sponsor_portal_access (fora do escopo de organization_members do usuário) e ler auth.users.email para validar server-side que quem está aceitando é o convidado, nunca confiando em e-mail vindo do client.';

-- =========================================================================
-- get_organization_invite_by_token: GAP PARCIAL - nenhum call site
-- encontrado. manage-team-access/index.ts só CRIA/reenvia/revoga convites
-- (supabase/functions/manage-team-access/index.ts) e gera o link
-- `${origin}/auth?invite=${invite.token}&email=...`, mas src/pages/Auth.tsx
-- NÃO lê o parâmetro `invite` da URL em lugar nenhum (grep confirmado) - ou
-- seja, o link de convite de equipe gerado hoje é funcionalmente morto no
-- frontend atual. Reconstruímos a função em si (leitura pura, espelhando
-- get_sponsor_invite_by_token) porque faz parte da lista pedida, mas NÃO
-- existe (e não inventamos) uma `accept_organization_invite_by_token` - ela
-- não está na lista das 29 funções, então o mecanismo real de aceite de
-- convite de equipe permanece um gap de produto documentado, não uma
-- suposição silenciosa.
-- =========================================================================

create or replace function public.get_organization_invite_by_token(p_token text)
returns table(email text, expires_at timestamptz, organization_name text, role text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select oi.email, oi.expires_at, o.name as organization_name, oi.role::text, oi.status
  from public.organization_invites oi
  join public.organizations o on o.id = oi.organization_id
  where oi.token = p_token;
$$;

comment on function public.get_organization_invite_by_token(text) is
  'Confiança média: nenhum call site encontrado em src/ (src/pages/Auth.tsx ignora o parâmetro `invite` da URL - gap de frontend confirmado, ver SCHEMA_NOTES.md). Implementada por analogia direta a get_sponsor_invite_by_token (mesmo padrão de uso esperado: mostrar nome da organização/papel antes do aceite), SECURITY DEFINER pelo mesmo motivo (leitura por visitante anônimo, token já é o segredo). Não existe accept_organization_invite_by_token na lista das 29 funções - o mecanismo de aceite de convite de equipe não foi reconstruído aqui; ver nota de gap em SCHEMA_NOTES.md.';

-- =========================================================================
-- SEÇÃO 5: Grupo C - arquivo de contrato (reaproveita a regra de
-- contracts_bucket_org de 0007_storage_buckets.sql)
-- =========================================================================

create or replace function public.can_access_contract_file(_path text, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contracts c
    where c.id = public.safe_uuid(left((string_to_array(_path, '/'))[2], 36))
      and (
        public.is_org_member(c.organization_id, _user_id)
        or (c.sponsor_id is not null and public.has_sponsor_access(c.sponsor_id, _user_id))
      )
  );
$$;

comment on function public.can_access_contract_file(text, uuid) is
  'Confiança alta: reaproveita literalmente a mesma regra de resolução de path da policy contracts_bucket_org em 0007_storage_buckets.sql (segs[2] do path começa com o uuid do contrato, left(...,36)), estendida para também liberar acesso via portal do patrocinador (c.sponsor_id + has_sponsor_access), já que contratos também são visíveis pelo portal (ver policy contracts_sponsor_portal_read em 0005_rls_policies.sql). SECURITY DEFINER necessário para resolver acesso de um _user_id explícito (uso esperado: Edge Function de download assinado verificando quem pediu o arquivo).';

-- =========================================================================
-- SEÇÃO 6: Grupo C - financeiro (evidência: src/pages/dashboard/Finance.tsx)
-- =========================================================================

create or replace function public.mark_overdue_installments(_owner uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if _owner is distinct from auth.uid() then
    raise exception 'mark_overdue_installments: _owner deve corresponder ao usuário autenticado (auth.uid())';
  end if;

  update public.installments
  set status = 'atrasado', updated_at = now()
  where status = 'pendente'
    and due_date < current_date;
end;
$$;

comment on function public.mark_overdue_installments(uuid) is
  'Confiança média: único call site é src/pages/dashboard/Finance.tsx (`supabase.rpc("mark_overdue_installments", { _owner: user.id })`), chamado logo ANTES de um select geral em installments SEM filtro por owner - ou seja, o efeito esperado é marcar vencidas em todas as organizações visíveis ao usuário, não só installments.owner_id = _owner. Decisão tomada: NÃO usar _owner para filtrar linhas (rejeitado: deixaria parcelas de outros membros da mesma org nunca marcadas como atrasadas dependendo de quem abriu a tela Financeiro); em vez disso a função roda SECURITY INVOKER (não definer) e deixa a policy installments_tenant (is_org_member) escopar naturalmente o UPDATE às organizações do caller. _owner é validado como auth.uid() só por sanidade (evita um caller alegar rodar "como" outro usuário), não para filtrar.';

create or replace function public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid default null)
returns json
language plpgsql
stable
set search_path = public
as $$
declare
  _opp record;
  _contract record;
  _result json;
begin
  select id, brand, value, sponsor_id, property_id, organization_id
  into _opp
  from public.opportunities
  where id = _opportunity_id;

  if not found then
    raise exception 'get_delivery_report_data: oportunidade % não encontrada', _opportunity_id;
  end if;

  if _contract_id is not null then
    select id, title, total_value, start_date, end_date
    into _contract
    from public.contracts
    where id = _contract_id
      and opportunity_id = _opp.id;
  else
    select id, title, total_value, start_date, end_date
    into _contract
    from public.contracts
    where opportunity_id = _opp.id
    order by created_at desc
    limit 1;
  end if;

  select json_build_object(
    'opportunity', json_build_object('id', _opp.id, 'brand', _opp.brand, 'value', _opp.value),
    'contract', case when _contract.id is null then null else
      json_build_object(
        'id', _contract.id, 'title', _contract.title, 'total_value', _contract.total_value,
        'start_date', _contract.start_date, 'end_date', _contract.end_date
      )
    end,
    'deliveries', coalesce((
      select json_agg(json_build_object(
        'id', d.id, 'title', d.title, 'description', d.description, 'quantity', d.quantity,
        'due_date', d.due_date, 'status', d.status, 'approval', d.approval
      ) order by d.position, d.due_date)
      from public.deliveries d
      where d.opportunity_id = _opp.id
        and d.status in ('aprovada', 'entregue')
    ), '[]'::json),
    'evidence', coalesce((
      select json_agg(json_build_object(
        'id', bd.id,
        'media_url', coalesce(bm.external_url, bm.storage_path),
        'media_type', bm.media_type,
        'brand', coalesce(bd.corrected_brand_name, bd.brand_name),
        'detection_confidence', round(bd.confidence / 100.0, 4),
        'detected_at', bd.created_at,
        'event_name', be.name
      ) order by bd.created_at desc)
      from public.brandtrack_detections bd
      join public.brandtrack_media bm on bm.id = bd.media_id
      left join public.brandtrack_events be on be.id = bm.event_id
      left join public.brandtrack_brands bb on bb.id = bd.brand_id
      where bd.organization_id = _opp.organization_id
        and (
          (_opp.sponsor_id is not null and bb.sponsor_id = _opp.sponsor_id)
          or lower(coalesce(bd.corrected_brand_name, bd.brand_name)) = lower(_opp.brand)
        )
      limit 50
    ), '[]'::json)
  ) into _result;

  return _result;
end;
$$;

comment on function public.get_delivery_report_data(uuid, uuid) is
  'Confiança alta para o formato do JSON: o único consumidor, supabase/functions/generate-delivery-report/index.ts, já faz `const report = reportData as { opportunity:{id,brand,value}, contract:{...}|null, deliveries:[...], evidence:[...] }` - o shape implementado aqui é EXATAMENTE esse contrato, não uma suposição. Pontos de confiança média, documentados por não serem 100% derivados do consumidor: (1) deliveries filtradas por status in (''aprovada'',''entregue''), com base no texto fixo do PDF "Nenhuma entrega aprovada/entregue encontrada" no mesmo arquivo; (2) evidence.detection_confidence dividido por 100 (schema guarda confidence 0-100, mas o consumidor faz `Math.round(detection_confidence*100)` esperando escala 0-1); (3) evidence casada por brandtrack_brands.sponsor_id = opportunity.sponsor_id OU nome da marca (case-insensitive) - não há vínculo direto entre brandtrack_detections e opportunities no schema; (4) evidence.detected_at usa brandtrack_detections.created_at (não existe coluna "detected_at" própria). Roda SECURITY INVOKER: o único caller real é a Edge Function via client service_role (bypassa RLS de qualquer forma), então não precisa de SECURITY DEFINER - se um dia for exposta a `authenticated` direto, as policies de tenant das tabelas envolvidas continuam valendo como camada extra de proteção.';
