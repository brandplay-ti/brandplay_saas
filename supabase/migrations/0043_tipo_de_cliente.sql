-- 0043_tipo_de_cliente.sql
--
-- Tipo de cliente da organização: agência ou marca (plano-visao-de-marca.md,
-- ADR-0013, docs/business/tipo-de-cliente.md). Na marca não existem o funil
-- de vendas e a captação; o resto é igual.
--
-- O que entra:
--   1. organizations.client_type ('agencia' | 'marca'), padrão 'agencia'. Só
--      muda pelas duas funções abaixo; um gatilho recusa o UPDATE direto que
--      a policy organizations_admin_update (0005) deixaria passar.
--   2. Módulo `vendas` ("Funil e captação") na matriz de 0036. Cada papel
--      recebe em `vendas` o acesso (e o escopo, se a 0042 já rodou) que tem
--      hoje no `crm`: nada muda para as agências.
--   3. modulo_disponivel(org, módulo): teto por tipo. `vendas` não existe para
--      a marca, para nenhum papel, nem na sessão de suporte. Entra em
--      can_access_module (alcança policies e Edge Functions via
--      exigirModulo) e numa policy restritiva em cada tabela do funil (alcança
--      as policies que não passam por can_access_module, como as de exclusão
--      por has_org_role).
--   4. As policies do funil passam de 'crm' para 'vendas', assim como as duas
--      funções que conferiam o crm para mexer no funil
--      (tg_validate_opportunity_org_access e create_renewal_opportunity).
--   5. Gatilho que recusa criar oportunidade, proposta ou lead score em
--      organização marca, inclusive pelas funções SECURITY DEFINER
--      (create_renewal_opportunity, handle_lead_to_opportunity), que ignoram
--      a RLS.
--   6. is_property_published exige organização com o funil: media kit e
--      formulário de lead saem do ar para a marca, sem mexer em is_published
--      nem public_slug (voltam se o tipo voltar).
--   7. Cadastro: handle_new_user e create_organization_with_owner gravam o
--      tipo escolhido.
--   8. Troca: o owner corrige o tipo enquanto a organização nunca teve
--      assinatura; depois, só o superadmin, com motivo e auditoria.
--
-- Nada é apagado na troca: o funil de quem vira marca fica invisível e volta
-- inteiro se a organização voltar a ser agência (decisão D11).

-- ─── 1. Coluna ───────────────────────────────────────────────────────
alter table public.organizations
  add column client_type text not null default 'agencia',
  add constraint organizations_client_type_check check (client_type in ('agencia', 'marca'));

comment on column public.organizations.client_type is
  'Tipo de cliente: agencia (vende patrocínio, tem funil) ou marca (compra patrocínio, sem funil e captação). Muda só por corrigir_tipo_de_cliente ou admin_alterar_tipo_de_cliente.';

-- O sinal de transação é o mesmo idioma de brandplay.lead_insert (0019): só as
-- funções desta migration o ligam, e set_config não é exposto pela API.
create or replace function public.tg_proteger_tipo_de_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_type is distinct from old.client_type
     and coalesce(current_setting('brandplay.tipo_de_cliente', true), '') <> 'on' then
    raise exception 'O tipo de cliente só muda pela tela de plano (durante o teste) ou pelo superadmin.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_proteger_tipo_de_cliente
  before update of client_type on public.organizations
  for each row execute function public.tg_proteger_tipo_de_cliente();

revoke all on function public.tg_proteger_tipo_de_cliente() from public, anon, authenticated;

-- ─── 2. Teto por tipo ────────────────────────────────────────────────
-- SECURITY DEFINER para valer também a quem não é membro (portal do
-- patrocinador), que não lê organizations. Devolve só um booleano sobre a
-- organização informada.
create or replace function public.modulo_disponivel(_org_id uuid, _module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not (
    _module = 'vendas'
    and exists (
      select 1 from public.organizations o
       where o.id = _org_id and o.client_type = 'marca'
    )
  );
$$;

comment on function public.modulo_disponivel(uuid, text) is
  'Teto por tipo de cliente: false quando o módulo não existe para a organização (vendas na marca). Acima da matriz organization_role_grants.';

revoke all on function public.modulo_disponivel(uuid, text) from public, anon, authenticated;
grant execute on function public.modulo_disponivel(uuid, text) to authenticated, service_role;

-- ─── 3. Módulo vendas na matriz ──────────────────────────────────────
alter table public.organization_role_grants drop constraint organization_role_grants_module_check;
alter table public.organization_role_grants add constraint organization_role_grants_module_check check (
  module in ('crm', 'vendas', 'operacional', 'financeiro', 'team')
);

comment on table public.organization_role_grants is
  'O que cada papel da organização pode fazer em crm, vendas, operacional, financeiro e team. O proprietário permanece com edição. vendas não existe para organização marca (modulo_disponivel).';

insert into public.organization_role_grants (organization_id, role, module, access)
select organization_id, role, 'vendas', access
  from public.organization_role_grants
 where module = 'crm'
on conflict (organization_id, role, module) do nothing;

-- A coluna scope nasce na 0042 (equipes, fase 1). Quando ela existe, vendas
-- herda o escopo do crm; sem ela, não há o que copiar.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'organization_role_grants' and column_name = 'scope'
  ) then
    execute $sql$
      update public.organization_role_grants v
         set scope = c.scope
        from public.organization_role_grants c
       where v.module = 'vendas'
         and c.module = 'crm'
         and c.organization_id = v.organization_id
         and c.role = v.role
         and v.scope is distinct from c.scope
    $sql$;
  end if;
end;
$$;

create or replace function public.semear_permissoes_da_organizacao(_org_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.organization_role_grants (organization_id, role, module, access)
  select _org_id, v.role::public.org_role, v.module, v.access
    from (values
      ('owner', 'crm', 'write'),
      ('owner', 'vendas', 'write'),
      ('owner', 'operacional', 'write'),
      ('owner', 'financeiro', 'write'),
      ('owner', 'team', 'write'),
      ('admin', 'crm', 'write'),
      ('admin', 'vendas', 'write'),
      ('admin', 'operacional', 'write'),
      ('admin', 'financeiro', 'write'),
      ('admin', 'team', 'write'),
      ('comercial', 'crm', 'write'),
      ('comercial', 'vendas', 'write'),
      ('comercial', 'operacional', 'read'),
      ('comercial', 'financeiro', 'read'),
      ('comercial', 'team', 'none'),
      ('operacional', 'crm', 'read'),
      ('operacional', 'vendas', 'read'),
      ('operacional', 'operacional', 'write'),
      ('operacional', 'financeiro', 'read'),
      ('operacional', 'team', 'none'),
      ('financeiro', 'crm', 'read'),
      ('financeiro', 'vendas', 'read'),
      ('financeiro', 'operacional', 'read'),
      ('financeiro', 'financeiro', 'write'),
      ('financeiro', 'team', 'none')
    ) as v(role, module, access)
  on conflict (organization_id, role, module) do nothing;
$$;

revoke all on function public.semear_permissoes_da_organizacao(uuid) from public, anon, authenticated;

-- Corpo da 0037 (membro ativo pela matriz ou sessão de suporte como admin),
-- agora abaixo do teto por tipo.
create or replace function public.can_access_module(
  _user_id uuid,
  _org_id uuid,
  _module text,
  _write boolean
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.modulo_disponivel(_org_id, _module) and (
    exists (
      select 1
        from public.organization_members om
        join public.organization_role_grants g
          on g.organization_id = om.organization_id
         and g.role = om.role
         and g.module = _module
       where om.user_id = _user_id
         and om.organization_id = _org_id
         and om.status = 'ativo'
         and (
           (_write and g.access = 'write')
           or (not _write and g.access in ('read', 'write'))
         )
    )
    or (
      _user_id = auth.uid()
      and public.sessao_suporte_vigente(_org_id)
      and exists (
        select 1
          from public.organization_role_grants g
         where g.organization_id = _org_id
           and g.role = 'admin'
           and g.module = _module
           and (
             (_write and g.access = 'write')
             or (not _write and g.access in ('read', 'write'))
           )
      )
    )
  );
$$;

comment on function public.can_access_module(uuid, uuid, text, boolean) is
  'Acesso do membro ativo segundo organization_role_grants, abaixo do teto por tipo de cliente (modulo_disponivel). write exige access = write; leitura aceita read ou write. Sessão de suporte vigente vale como o papel admin dessa organização, só para auth.uid(), sem virar membership nem owner.';

-- ─── 4. Policies do funil: crm → vendas ──────────────────────────────
-- Mesmas expressões da 0017 e da 0036, trocando só o módulo.
alter policy opportunities_tenant_read on public.opportunities
  using (public.can_access_module(auth.uid(), organization_id, 'vendas', false));
alter policy opportunities_module_insert on public.opportunities
  with check (((organization_id is not null) and (owner_id = auth.uid()) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));
alter policy opportunities_module_update on public.opportunities
  using (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)))
  with check (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));
alter policy opportunities_module_delete on public.opportunities
  using (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));

alter policy opportunity_activities_module_insert on public.opportunity_activities
  with check (((organization_id is not null) and (owner_id = auth.uid()) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));
alter policy opportunity_activities_module_update on public.opportunity_activities
  using (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)))
  with check (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));
alter policy opportunity_activities_module_delete on public.opportunity_activities
  using (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));

alter policy opportunity_audit_logs_module_insert on public.opportunity_audit_logs
  with check (public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true));

alter policy opportunity_comment_attachments_module_insert on public.opportunity_comment_attachments
  with check (((uploaded_by = auth.uid()) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));

alter policy opportunity_comments_module_insert on public.opportunity_comments
  with check (((author_id = auth.uid()) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));
alter policy opportunity_comments_module_update on public.opportunity_comments
  using (((author_id = auth.uid()) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)))
  with check (((author_id = auth.uid()) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));

alter policy proposals_tenant_read on public.proposals
  using (public.can_access_module(auth.uid(), organization_id, 'vendas', false));
alter policy proposals_module_insert on public.proposals
  with check ((public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true) and (owner_id = auth.uid())));
alter policy proposals_module_update on public.proposals
  using (public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true));
alter policy proposals_module_delete on public.proposals
  using (public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true));

alter policy proposal_items_module_insert on public.proposal_items
  with check (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));
alter policy proposal_items_module_update on public.proposal_items
  using (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)))
  with check (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));
alter policy proposal_items_module_delete on public.proposal_items
  using (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));

alter policy proposal_versions_module_insert on public.proposal_versions
  with check ((public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true) and (owner_id = auth.uid())));
alter policy proposal_versions_module_update on public.proposal_versions
  using (public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true));
alter policy proposal_versions_module_delete on public.proposal_versions
  using (public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true));

alter policy lead_scores_module_insert on public.lead_scores
  with check ((public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true) and (owner_id = auth.uid())));
alter policy lead_scores_module_update on public.lead_scores
  using (public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true));
alter policy lead_scores_module_delete on public.lead_scores
  using (public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true));

alter policy property_leads_module_update on public.property_leads
  using (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)))
  with check (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));
alter policy property_leads_module_delete on public.property_leads
  using (((organization_id is not null) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));

alter policy sponsor_proposal_profiles_module_insert on public.sponsor_proposal_profiles
  with check (((owner_id = auth.uid()) and public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true)));
alter policy sponsor_proposal_profiles_module_update on public.sponsor_proposal_profiles
  using (public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true))
  with check (public.can_access_module(auth.uid(), organization_id, 'vendas'::text, true));

-- Funções que conferiam o crm para mexer no funil. Corpos da 0019 e da 0015,
-- trocando só o módulo (e a mensagem).
create or replace function public.tg_validate_opportunity_org_access()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _actor uuid := auth.uid();
  _role text := auth.role();
  _resolved_org uuid;
begin
  -- insert feito por handle_lead_to_opportunity (lead do media kit público):
  -- owner e organização já vêm da propriedade
  if current_setting('brandplay.lead_insert', true) = 'on' then
    if new.organization_id is null then
      raise exception 'Organização obrigatória para oportunidade criada a partir de lead';
    end if;
    return new;
  end if;

  if _role = 'service_role' then
    if new.organization_id is null and new.owner_id is not null then
      new.organization_id := public.get_user_org(new.owner_id);
    end if;
    return new;
  end if;

  if _actor is null then
    raise exception 'Usuário não autenticado para criar ou alterar negociação';
  end if;

  if tg_op = 'INSERT' then
    if new.owner_id is null then
      new.owner_id := _actor;
    end if;

    if new.owner_id is distinct from _actor then
      raise exception 'Negociação deve ser criada pelo próprio usuário autenticado';
    end if;
  end if;

  _resolved_org := coalesce(new.organization_id, public.get_user_org(_actor));

  if _resolved_org is null then
    raise exception 'Nenhuma organização ativa encontrada para o usuário';
  end if;

  if not public.is_org_member(_actor, _resolved_org) then
    raise exception 'Usuário não pertence à organização da negociação';
  end if;

  if not public.can_access_module(_actor, _resolved_org, 'vendas', true) then
    raise exception 'Usuário sem permissão no funil de vendas para gerenciar negociações nesta organização';
  end if;

  new.organization_id := _resolved_org;
  return new;
end;
$function$;

revoke all on function public.tg_validate_opportunity_org_access() from public, anon, authenticated;
grant execute on function public.tg_validate_opportunity_org_access() to service_role;

create or replace function public.create_renewal_opportunity(_contract_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c record; _opp uuid;
begin
  select * into c from public.contracts where id = _contract_id;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if not public.can_access_module(auth.uid(), c.organization_id, 'vendas', true) then
    raise exception 'Usuário sem permissão no funil de vendas nesta organização';
  end if;

  insert into public.opportunities (owner_id, organization_id, brand, value, stage, property_id, sponsor_id, notes)
  values (auth.uid(), c.organization_id, c.brand, c.total_value, 'prospect'::opportunity_stage, c.property_id, c.sponsor_id,
          'Renovação gerada a partir do contrato ' || c.title || ' (término em ' || coalesce(c.end_date::text, 'sem data') || ').')
  returning id into _opp;

  insert into public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, new_value, source)
  values (c.organization_id, c.sponsor_id, auth.uid(), 'opportunity', _opp, 'renewal_created',
          jsonb_build_object('contract_id', c.id), 'manual');

  return _opp;
end $function$;

revoke all on function public.create_renewal_opportunity(_contract_id uuid) from public, anon, authenticated;
grant execute on function public.create_renewal_opportunity(_contract_id uuid) to authenticated, service_role;

-- ─── 5. Policy restritiva por tipo nas tabelas do funil ──────────────
-- Combina com AND com as permissivas, no formato de billing_access_restrictive
-- (0026). Cobre o que não passa por can_access_module: leitura por
-- is_org_member nas filhas, exclusão por has_org_role, funis e SLAs (padrão
-- 4), probabilidades por usuário (padrão 3) e a leitura do portal do
-- patrocinador em propostas.
do $$
declare
  _t text;
begin
  foreach _t in array array[
    'opportunities', 'opportunity_activities', 'opportunity_audit_logs',
    'opportunity_comments', 'opportunity_comment_attachments', 'opportunity_contacts',
    'proposals', 'proposal_items', 'proposal_versions', 'sponsor_proposal_profiles',
    'lead_scores', 'property_leads',
    'pipeline_funnels', 'pipeline_stage_slas', 'user_stage_probabilities'
  ] loop
    execute format('drop policy if exists vendas_tipo_de_cliente on public.%I', _t);
    execute format(
      'create policy vendas_tipo_de_cliente on public.%I as restrictive for all to authenticated
         using (public.modulo_disponivel(organization_id, %L))
         with check (public.modulo_disponivel(organization_id, %L))',
      _t, 'vendas', 'vendas'
    );
  end loop;
end;
$$;

-- ─── 6. Nada nasce no funil da marca ─────────────────────────────────
-- Antes do insert e depois dos gatilhos que preenchem organization_id
-- (set_org_id, trg_lead_scores_org): o nome com "zz" garante a ordem.
-- Só INSERT: UPDATE de oportunidade antiga (sincronia de estágio vinda de um
-- contrato) continua possível e, sob RLS, simplesmente não acha a linha.
create or replace function public.tg_vendas_disponivel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.modulo_disponivel(new.organization_id, 'vendas') then
    raise exception 'Funil de vendas indisponível para organização do tipo marca.'
      using errcode = 'check_violation', hint = 'tipo_de_cliente:vendas';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_vendas_disponivel() from public, anon, authenticated;

create trigger trg_zz_vendas_disponivel
  before insert on public.opportunities
  for each row execute function public.tg_vendas_disponivel();

create trigger trg_zz_vendas_disponivel
  before insert on public.proposals
  for each row execute function public.tg_vendas_disponivel();

create trigger trg_zz_vendas_disponivel
  before insert on public.lead_scores
  for each row execute function public.tg_vendas_disponivel();

-- ─── 7. Media kit público ────────────────────────────────────────────
-- As irmãs (is_asset_publicly_visible, is_sponsor_publicly_visible,
-- is_tier_publicly_visible) e as policies *_public_read,
-- property_leads_public_insert e property_events_public_read passam por aqui. O relatório /r/:slug (0040)
-- não depende desta função.
create or replace function public.is_property_published(target_property_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sports_properties p
    where p.id = target_property_id
      and p.is_published = true
      and public.modulo_disponivel(p.organization_id, 'vendas')
  );
$$;

comment on function public.is_property_published(uuid) is
  'Bônus (media kit público): true se a propriedade esportiva está publicada (is_published) e a organização tem o funil (agência). Usada em policies de SELECT para o público anônimo (role anon).';

-- A leitura anônima da própria propriedade (0005) olhava is_published direto.
alter policy sports_properties_public_read on public.sports_properties
  using (public.is_property_published(id));

-- ─── 8. Cadastro ─────────────────────────────────────────────────────
-- Corpo da 0022; a organização pessoal grava o tipo escolhido no cadastro
-- (user_metadata.client_type). Valor ausente ou inválido vira agencia. Não é
-- autorização vinda do cliente: a pessoa declara o tipo da própria
-- organização nova.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare _org_id uuid; _invite record; _tipo text;
begin
  insert into public.profiles (id, full_name, company)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company', '')
  );
  insert into public.user_roles (user_id, role) values (new.id, 'comercial');

  -- aceita convite pendente para organização, se houver
  select * into _invite from public.organization_invites
   where lower(email) = lower(new.email) and status = 'pendente' and expires_at > now()
   order by created_at desc limit 1;

  if found then
    insert into public.organization_members (organization_id, user_id, role, status)
    values (_invite.organization_id, new.id, _invite.role, 'ativo')
    on conflict do nothing;
    update public.organization_invites
       set status = 'aceito', accepted_at = now(), accepted_user_id = new.id
     where id = _invite.id;
  elsif exists (
    select 1 from public.sponsor_invites si
     where lower(si.email) = lower(new.email)
       and si.status = 'pendente'
       and si.expires_at > now()
  ) then
    -- patrocinador convidado: o acesso vem de accept_sponsor_invite_by_token
    null;
  else
    _tipo := case when new.raw_user_meta_data->>'client_type' = 'marca' then 'marca' else 'agencia' end;
    -- cria a organização pessoal (on_organization_created já insere o owner)
    insert into public.organizations (name, owner_id, client_type)
    values (coalesce(nullif(new.raw_user_meta_data->>'company', ''), 'Minha empresa'), new.id, _tipo)
    returning id into _org_id;
    insert into public.organization_members (organization_id, user_id, role, status)
    values (_org_id, new.id, 'owner', 'ativo')
    on conflict do nothing;
  end if;
  return new;
end $function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Corpo da 0015 com o tipo. A assinatura muda (parâmetro novo): a antiga sai
-- para não haver duas sobrecargas ambíguas na chamada por nome. Só a Edge
-- Function create-organization a chama.
drop function if exists public.create_organization_with_owner(uuid, text, text);

create function public.create_organization_with_owner(
  _owner_id uuid,
  _name text,
  _cnpj text default null,
  _client_type text default 'agencia'
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _org_id uuid;
  _clean_name text := btrim(_name);
  _clean_cnpj text := nullif(regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g'), '');
begin
  if _owner_id is null then
    raise exception 'Usuário não autenticado para criar organização';
  end if;

  if _clean_name is null or length(_clean_name) < 2 then
    raise exception 'Informe o nome da organização';
  end if;

  if coalesce(_client_type, '') not in ('agencia', 'marca') then
    raise exception 'Tipo de cliente inválido' using errcode = 'check_violation';
  end if;

  insert into public.organizations (name, owner_id, cnpj, client_type)
  values (_clean_name, _owner_id, _clean_cnpj, _client_type)
  returning id into _org_id;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (_org_id, _owner_id, 'owner', 'ativo')
  on conflict do nothing;

  return _org_id;
exception
  when unique_violation then
    if position('organizations_cnpj_unique' in sqlerrm) > 0 then
      raise exception 'Este CNPJ já está cadastrado';
    end if;
    raise;
end;
$function$;

revoke all on function public.create_organization_with_owner(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_organization_with_owner(uuid, text, text, text) to service_role;

-- ─── 9. Troca do tipo ────────────────────────────────────────────────
-- Inclui as ações da 0042 (equipes), que vem antes desta na ordem.
alter table public.team_audit_log drop constraint team_audit_log_action_check;
alter table public.team_audit_log add constraint team_audit_log_action_check check (
  action = any (array[
    'invite_sent', 'invite_resent', 'invite_revoked', 'member_created',
    'role_changed', 'member_revoked', 'member_reactivated', 'permission_changed',
    'invite_accepted', 'invite_declined',
    'team_created', 'team_updated', 'team_archived', 'team_restored',
    'team_member_added', 'team_member_updated', 'team_member_removed',
    'team_property_added', 'team_property_updated', 'team_property_removed',
    'scope_changed',
    'client_type_changed'
  ])
);

-- O owner corrige o tipo enquanto a organização nunca teve assinatura (D10).
create or replace function public.corrigir_tipo_de_cliente(_org_id uuid, _tipo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _antes text;
begin
  if auth.uid() is null or not public.has_org_role(_org_id, array['owner']) then
    raise exception 'Só o proprietário corrige o tipo de cliente.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(_tipo, '') not in ('agencia', 'marca') then
    raise exception 'Tipo de cliente inválido.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.billing_subscriptions s where s.organization_id = _org_id) then
    raise exception 'Depois da contratação, o tipo de cliente só muda com o suporte.'
      using errcode = 'check_violation', hint = 'tipo_de_cliente:contratado';
  end if;

  select client_type into _antes from public.organizations where id = _org_id for update;
  if _antes = _tipo then
    return _tipo;
  end if;

  perform set_config('brandplay.tipo_de_cliente', 'on', true);
  update public.organizations set client_type = _tipo where id = _org_id;
  perform set_config('brandplay.tipo_de_cliente', 'off', true);

  insert into public.team_audit_log (organization_id, actor_id, action, metadata)
  values (_org_id, auth.uid(), 'client_type_changed', jsonb_build_object('before', _antes, 'after', _tipo));

  return _tipo;
end;
$$;

comment on function public.corrigir_tipo_de_cliente(uuid, text) is
  'Owner corrige o tipo de cliente enquanto a organização não tem nenhuma assinatura registrada. Audita em team_audit_log.';

revoke all on function public.corrigir_tipo_de_cliente(uuid, text) from public, anon, authenticated;
grant execute on function public.corrigir_tipo_de_cliente(uuid, text) to authenticated, service_role;

create or replace function public.admin_alterar_tipo_de_cliente(_org_id uuid, _tipo text, _comentario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _antes text;
begin
  perform public.platform_admin_require();

  if nullif(btrim(_comentario), '') is null then
    raise exception 'Informe o motivo da troca.' using errcode = 'check_violation';
  end if;
  if coalesce(_tipo, '') not in ('agencia', 'marca') then
    raise exception 'Tipo de cliente inválido.' using errcode = 'check_violation';
  end if;

  select client_type into _antes from public.organizations where id = _org_id for update;
  if _antes is null then
    raise exception 'Organização não encontrada.' using errcode = 'no_data_found';
  end if;
  if _antes = _tipo then
    raise exception 'A organização já é deste tipo.' using errcode = 'check_violation';
  end if;

  perform set_config('brandplay.tipo_de_cliente', 'on', true);
  update public.organizations set client_type = _tipo where id = _org_id;
  perform set_config('brandplay.tipo_de_cliente', 'off', true);

  insert into public.platform_admin_audit_log
    (admin_user_id, action, organization_id, target_type, target_id, before, after, comment)
  values
    (auth.uid(), 'tipo_de_cliente_alterado', _org_id, 'organization', _org_id::text,
     jsonb_build_object('client_type', _antes), jsonb_build_object('client_type', _tipo),
     btrim(_comentario));

  return jsonb_build_object('organization_id', _org_id, 'client_type', _tipo);
end;
$$;

comment on function public.admin_alterar_tipo_de_cliente(uuid, text, text) is
  'Troca do tipo de cliente pelo superadmin, com motivo obrigatório e auditoria. Não apaga nem altera dado do funil.';

revoke all on function public.admin_alterar_tipo_de_cliente(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_alterar_tipo_de_cliente(uuid, text, text) to authenticated, service_role;

-- Leitura administrativa: tipo de todas as organizações (lista) e, no
-- detalhe, as contagens do que fica oculto na troca para marca. Só
-- contagens, como o resto da área administrativa (ADR-0008).
create or replace function public.admin_tipos_de_cliente()
returns table (organization_id uuid, client_type text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.platform_admin_require();
  return query select o.id, o.client_type from public.organizations o;
end;
$$;

create or replace function public.admin_tipo_de_cliente(_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _tipo text;
begin
  perform public.platform_admin_require();

  select client_type into _tipo from public.organizations where id = _org_id;
  if _tipo is null then
    return null;
  end if;

  return jsonb_build_object(
    'client_type', _tipo,
    'open_opportunities', (
      select count(*) from public.opportunities
       where organization_id = _org_id and stage not in ('fechado', 'perdido')
    ),
    'proposals', (select count(*) from public.proposals where organization_id = _org_id),
    'published_properties', (
      select count(*) from public.sports_properties
       where organization_id = _org_id and is_published
    ),
    'leads', (select count(*) from public.property_leads where organization_id = _org_id)
  );
end;
$$;

revoke all on function public.admin_tipos_de_cliente() from public, anon, authenticated;
revoke all on function public.admin_tipo_de_cliente(uuid) from public, anon, authenticated;
grant execute on function public.admin_tipos_de_cliente() to authenticated, service_role;
grant execute on function public.admin_tipo_de_cliente(uuid) to authenticated, service_role;
