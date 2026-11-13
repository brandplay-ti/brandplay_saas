-- 0048 — Textos do banco: "propriedade" passa a ser "projeto" (BP-6).
--
-- O produto passou a chamar de "projeto" o que antes chamava de "propriedade"
-- (sports_properties). Esta migration troca só o TEXTO que chega ao usuário:
-- mensagens de erro dos gatilhos e a descrição/benefícios dos planos padrão.
--
-- Não muda nenhum nome técnico: tabelas, colunas, funções, o hint
-- `limite_plano:propriedades` (lido por portal/src/lib/billing.ts) e a chave
-- `propriedade` do JSON de report_landing_data continuam iguais. As funções
-- abaixo são as mesmas da 0019, 0024 e 0040, com a mesma lógica; só o texto
-- das exceções mudou.

-- ─── 1. Lead do media kit (0019) ─────────────────────────────────────────────
create or replace function public.handle_lead_to_opportunity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _prop record;
  _value numeric := 0;
  _opp_id uuid;
  _brand text;
begin
  select owner_id, organization_id into _prop
  from public.sports_properties
  where id = new.property_id;

  if not found or _prop.organization_id is null then
    raise exception 'Projeto inválido para receber lead';
  end if;

  -- nunca confiar em owner_id/organization_id vindos do formulário público
  new.owner_id := _prop.owner_id;
  new.organization_id := _prop.organization_id;

  if new.tier_id is not null then
    select value into _value
    from public.sponsorship_tiers
    where id = new.tier_id and property_id = new.property_id;
  end if;

  _brand := coalesce(nullif(new.company, ''), new.contact_name);

  perform set_config('brandplay.lead_insert', 'on', true);
  insert into public.opportunities (owner_id, organization_id, brand, value, stage, property_id, notes)
  values (
    _prop.owner_id,
    _prop.organization_id,
    _brand,
    coalesce(_value, 0),
    'prospect'::opportunity_stage,
    new.property_id,
    'Lead recebido via media kit público.' || E'\n' ||
    'Contato: ' || new.contact_name || E'\n' ||
    'Email: ' || new.email || E'\n' ||
    coalesce('Telefone: ' || new.phone || E'\n', '') ||
    coalesce('Mensagem: ' || new.message, '')
  )
  returning id into _opp_id;
  perform set_config('brandplay.lead_insert', 'off', true);

  new.created_opportunity_id := _opp_id;
  return new;
end;
$function$;

revoke all on function public.handle_lead_to_opportunity() from public, anon, authenticated;
grant execute on function public.handle_lead_to_opportunity() to service_role;

-- ─── 2. Limite de projetos do plano (0024) ───────────────────────────────────
-- Conta só a raiz: uma edição/temporada (parent_property_id) é o mesmo projeto
-- em outro ano e não ocupa vaga. O hint continua `limite_plano:propriedades`.
create or replace function public.tg_billing_limit_properties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _plan  public.billing_plans;
  _count integer;
begin
  if public.billing_limits_bypassed()
     or new.organization_id is null
     or new.parent_property_id is not null then
    return new;
  end if;

  _plan := public.billing_effective_plan(new.organization_id);
  if _plan.id is null then
    perform public.billing_raise_without_plan();
  end if;
  if _plan.max_properties is null then
    return new;
  end if;

  select count(*) into _count
    from public.sports_properties
   where organization_id = new.organization_id
     and parent_property_id is null;

  if _count >= _plan.max_properties then
    raise exception using
      errcode = 'check_violation',
      message = format('Limite de projetos do plano %s atingido (%s de %s).',
                       _plan.name, _count, _plan.max_properties),
      detail = coalesce(public.billing_suggest_plan(_count + 1, 0), ''),
      hint = 'limite_plano:propriedades';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_billing_limit_properties() from public, anon, authenticated;
grant execute on function public.tg_billing_limit_properties() to service_role;

-- ─── 3. Vínculos do relatório (0040) ─────────────────────────────────────────
create or replace function public.tg_relatorio_vinculos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _linha    jsonb := to_jsonb(new);
  _org      uuid;
  _sponsor  uuid := nullif(_linha->>'sponsor_id', '')::uuid;
  _evento   uuid := nullif(_linha->>'event_id', '')::uuid;
  _contrato uuid := nullif(_linha->>'contract_id', '')::uuid;
begin
  select p.organization_id into _org
    from public.sports_properties p
   where p.id = new.property_id;
  if _org is null then
    raise exception 'Projeto não encontrado ou sem organização' using errcode = '23503';
  end if;

  if tg_table_name <> 'property_media' then
    new.organization_id := _org;
  elsif new.organization_id is distinct from _org then
    raise exception 'A mídia não é da organização do projeto' using errcode = '23503';
  end if;

  if _sponsor is not null and not exists (
    select 1 from public.sponsors s where s.id = _sponsor and s.organization_id = _org
  ) then
    raise exception 'Patrocinador de outra organização' using errcode = '23503';
  end if;

  if _evento is not null and not exists (
    select 1 from public.property_events e where e.id = _evento and e.property_id = new.property_id
  ) then
    raise exception 'Momento de outro projeto' using errcode = '23503';
  end if;

  if _contrato is not null and not exists (
    select 1 from public.contracts c
     where c.id = _contrato
       and c.organization_id = _org
       and c.sponsor_id is not distinct from _sponsor
  ) then
    raise exception 'Contrato de outra organização ou de outro patrocinador' using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_relatorio_vinculos() from public, anon, authenticated;
grant execute on function public.tg_relatorio_vinculos() to service_role;

comment on function public.tg_relatorio_vinculos() is
  'Relatório (0040, texto na 0048): organization_id vem do projeto; patrocinador, momento e contrato precisam ser da mesma organização.';

-- ─── 4. Regras do relatório (0040) ───────────────────────────────────────────
create or replace function public.tg_reports_regras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid   uuid := auth.uid();
  _admin boolean := _uid is null or public.has_org_role(new.organization_id, array['owner', 'admin']);
begin
  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.relatorio_slug(new.title);
    end if;
    if new.status = 'excluido' then
      raise exception 'Relatório novo não nasce excluído' using errcode = '23514';
    end if;
    if new.access_mode = 'publico' and not _admin then
      raise exception 'Só owner e admin publicam relatório público' using errcode = '42501';
    end if;
    new.created_by := coalesce(_uid, new.created_by);
    new.deleted_at := null;
    new.deleted_by := null;
    if new.status = 'publicado' then
      new.published_at := now();
      new.published_by := _uid;
    else
      new.published_at := null;
      new.published_by := null;
    end if;
    return new;
  end if;

  if old.status = 'excluido' then
    raise exception 'Relatório excluído não pode ser alterado' using errcode = '23514';
  end if;
  if new.slug is distinct from old.slug then
    raise exception 'O endereço do relatório não muda depois de criado' using errcode = '23514';
  end if;
  if new.property_id is distinct from old.property_id then
    raise exception 'O projeto do relatório não muda depois de criado' using errcode = '23514';
  end if;
  if (old.access_mode = 'publico' or new.access_mode = 'publico') and not _admin then
    raise exception 'Só owner e admin alteram relatório público' using errcode = '42501';
  end if;
  if new.status = 'excluido' and not _admin then
    raise exception 'Só owner e admin excluem relatório' using errcode = '42501';
  end if;

  new.created_by := old.created_by;
  if new.status = 'publicado' and old.status <> 'publicado' then
    new.published_at := now();
    new.published_by := _uid;
  elsif new.status = 'rascunho' then
    new.published_at := null;
    new.published_by := null;
  else
    new.published_at := old.published_at;
    new.published_by := old.published_by;
  end if;
  if new.status = 'excluido' then
    new.deleted_at := now();
    new.deleted_by := _uid;
  else
    new.deleted_at := null;
    new.deleted_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_reports_regras() from public, anon, authenticated;
grant execute on function public.tg_reports_regras() to service_role;

-- ─── 5. Planos padrão (0024) ─────────────────────────────────────────────────
-- Só troca o texto que ainda é o original: o que o superadmin já editou em
-- /admin/planos fica como está. array_replace troca só o item idêntico.
update public.billing_plans
   set description = 'Para quem está começando, com poucos projetos.'
 where id = 'starter'
   and description = 'Para projetos e pequenas propriedades.';

update public.billing_plans
   set features = array_replace(features, 'Até 3 propriedades', 'Até 3 projetos')
 where id = 'starter'
   and 'Até 3 propriedades' = any (features);

update public.billing_plans
   set features = array_replace(features, 'Propriedades ilimitadas', 'Projetos ilimitados')
 where id = 'pro'
   and 'Propriedades ilimitadas' = any (features);

comment on column public.billing_plans.max_properties is
  'Teto de projetos RAIZ da organização (edições/temporadas não contam). Nulo = sem teto.';

insert into migrations.schema_migrations (version)
values ('0048_textos_propriedade_para_projeto');
