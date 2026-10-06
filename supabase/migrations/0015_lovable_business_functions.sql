-- 0015_lovable_business_functions.sql
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


-- handle_new_user: cria profile, papel global comercial e aceita convite pendente; sem convite, cria a organização pessoal (comportamento real do produto)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _org_id uuid; _invite record;
BEGIN
  INSERT INTO public.profiles (id, full_name, company)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'comercial');

  -- accept pending org invite if any
  SELECT * INTO _invite FROM public.organization_invites
   WHERE lower(email) = lower(NEW.email) AND status = 'pendente' AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (_invite.organization_id, NEW.id, _invite.role, 'ativo')
    ON CONFLICT DO NOTHING;
    UPDATE public.organization_invites
       SET status = 'aceito', accepted_at = now(), accepted_user_id = NEW.id
     WHERE id = _invite.id;
  ELSE
    -- create personal organization
    INSERT INTO public.organizations (name, owner_id)
    VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company',''), 'Minha empresa'), NEW.id)
    RETURNING id INTO _org_id;
    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (_org_id, NEW.id, 'owner', 'ativo');
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- create_organization_with_owner: só service_role (Edge Function create-organization). Antes executável por anon/authenticated com _owner_id arbitrário
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(_owner_id uuid, _name text, _cnpj text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _org_id uuid;
  _clean_name text := btrim(_name);
  _clean_cnpj text := nullif(regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g'), '');
BEGIN
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado para criar organização';
  END IF;

  IF _clean_name IS NULL OR length(_clean_name) < 2 THEN
    RAISE EXCEPTION 'Informe o nome da organização';
  END IF;

  INSERT INTO public.organizations (name, owner_id, cnpj)
  VALUES (_clean_name, _owner_id, _clean_cnpj)
  RETURNING id INTO _org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (_org_id, _owner_id, 'owner', 'ativo')
  ON CONFLICT DO NOTHING;

  RETURN _org_id;
EXCEPTION
  WHEN unique_violation THEN
    IF position('organizations_cnpj_unique' in SQLERRM) > 0 THEN
      RAISE EXCEPTION 'Este CNPJ já está cadastrado';
    END IF;
    RAISE;
END;
$function$;
revoke all on function public.create_organization_with_owner(_owner_id uuid, _name text, _cnpj text) from public, anon, authenticated;
grant execute on function public.create_organization_with_owner(_owner_id uuid, _name text, _cnpj text) to service_role;

-- accept_sponsor_invite_by_token: fluxo público por token
CREATE OR REPLACE FUNCTION public.accept_sponsor_invite_by_token(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _invite record;
  _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT email INTO _user_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO _invite
  FROM public.sponsor_invites
  WHERE token = p_token
    AND status = 'pendente'
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido ou expirado';
  END IF;

  IF lower(_invite.email) <> lower(coalesce(_user_email, '')) THEN
    RAISE EXCEPTION 'Este convite pertence a outro e-mail';
  END IF;

  INSERT INTO public.sponsor_portal_access (user_id, sponsor_id, status, granted_by)
  VALUES (auth.uid(), _invite.sponsor_id, 'ativo', _invite.invited_by)
  ON CONFLICT DO NOTHING;

  UPDATE public.sponsor_invites
  SET status = 'aceito', accepted_user_id = auth.uid(), accepted_at = now()
  WHERE id = _invite.id;

  RETURN true;
END;
$function$;
revoke all on function public.accept_sponsor_invite_by_token(p_token text) from public, anon, authenticated;
grant execute on function public.accept_sponsor_invite_by_token(p_token text) to anon, authenticated, service_role;

-- get_organization_invite_by_token: fluxo público por token
drop function if exists public.get_organization_invite_by_token(p_token text);
CREATE OR REPLACE FUNCTION public.get_organization_invite_by_token(p_token text)
 RETURNS TABLE(email text, status text, expires_at timestamp with time zone, organization_name text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT oi.email, oi.status::text, oi.expires_at, o.name AS organization_name, oi.role::text
  FROM public.organization_invites oi
  JOIN public.organizations o ON o.id = oi.organization_id
  WHERE oi.token = p_token
    AND oi.status = 'pendente'
    AND oi.expires_at > now()
  LIMIT 1;
$function$;
revoke all on function public.get_organization_invite_by_token(p_token text) from public, anon, authenticated;
grant execute on function public.get_organization_invite_by_token(p_token text) to anon, authenticated, service_role;

-- get_sponsor_invite_by_token: fluxo público por token
drop function if exists public.get_sponsor_invite_by_token(p_token text);
CREATE OR REPLACE FUNCTION public.get_sponsor_invite_by_token(p_token text)
 RETURNS TABLE(email text, status text, expires_at timestamp with time zone, sponsor_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT si.email, si.status, si.expires_at, s.name AS sponsor_name
  FROM public.sponsor_invites si
  JOIN public.sponsors s ON s.id = si.sponsor_id
  WHERE si.token = p_token
    AND si.status = 'pendente'
    AND si.expires_at > now()
  LIMIT 1;
$function$;
revoke all on function public.get_sponsor_invite_by_token(p_token text) from public, anon, authenticated;
grant execute on function public.get_sponsor_invite_by_token(p_token text) to anon, authenticated, service_role;

-- debug_table_policies: diagnóstico; antes executável por authenticated/anon
drop function if exists public.debug_table_policies(_table_name text);
CREATE OR REPLACE FUNCTION public.debug_table_policies(_table_name text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'policyname', policyname,
        'cmd', cmd,
        'roles', roles,
        'qual', qual,
        'with_check', with_check
      )
      ORDER BY policyname
    ),
    '[]'::jsonb
  )
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = _table_name;
$function$;
revoke all on function public.debug_table_policies(_table_name text) from public, anon, authenticated;
grant execute on function public.debug_table_policies(_table_name text) to service_role;

-- get_user_org
CREATE OR REPLACE FUNCTION public.get_user_org(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.organization_members
   WHERE user_id = _user_id AND status = 'ativo'
   ORDER BY created_at ASC LIMIT 1
$function$;
revoke all on function public.get_user_org(_user_id uuid) from public, anon, authenticated;
grant execute on function public.get_user_org(_user_id uuid) to authenticated, service_role;

-- user_sponsor_ids: retorno real: setof uuid (antes uuid[])
drop function if exists public.user_sponsor_ids(_user_id uuid);
CREATE OR REPLACE FUNCTION public.user_sponsor_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select sponsor_id from public.sponsor_portal_access
  where user_id = _user_id and status = 'ativo'
$function$;
revoke all on function public.user_sponsor_ids(_user_id uuid) from public, anon, authenticated;
grant execute on function public.user_sponsor_ids(_user_id uuid) to authenticated, service_role;

-- get_portal_sponsor_overview: checa has_sponsor_access internamente
drop function if exists public.get_portal_sponsor_overview(_sponsor_id uuid);
CREATE OR REPLACE FUNCTION public.get_portal_sponsor_overview(_sponsor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _s record; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF NOT public.has_sponsor_access(auth.uid(), _sponsor_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado a este patrocinador';
  END IF;

  SELECT s.id, s.name, s.logo_path, s.website,
         COALESCE(pp.portal_display_name, s.name) AS display_name
    INTO _s
    FROM public.sponsors s
    LEFT JOIN public.sponsor_portal_profiles pp ON pp.sponsor_id = s.id
   WHERE s.id = _sponsor_id;

  IF _s IS NULL THEN RAISE EXCEPTION 'Patrocinador não encontrado'; END IF;

  SELECT jsonb_build_object(
    'sponsor', jsonb_build_object('id', _s.id, 'name', _s.display_name, 'logo_path', _s.logo_path, 'website', _s.website),
    'contracts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status,
        'start_date', c.start_date, 'end_date', c.end_date) ORDER BY c.created_at DESC)
      FROM public.contracts c WHERE c.sponsor_id = _sponsor_id), '[]'::jsonb),
    'deliveries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'due_date', d.due_date,
        'status', d.status, 'approval', d.approval) ORDER BY d.due_date NULLS LAST)
      FROM public.deliveries d WHERE d.sponsor_id = _sponsor_id), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END $function$;
revoke all on function public.get_portal_sponsor_overview(_sponsor_id uuid) from public, anon, authenticated;
grant execute on function public.get_portal_sponsor_overview(_sponsor_id uuid) to authenticated, service_role;

-- get_delivery_report_data: chamada pela Edge Function generate-delivery-report com service_role
drop function if exists public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid);
CREATE OR REPLACE FUNCTION public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  opp record;
  c record;
  result jsonb;
  report_deliveries jsonb;
  report_evidence jsonb;
begin
  select * into opp from public.opportunities where id = _opportunity_id;
  if not found then return null; end if;

  if _contract_id is not null then
    select * into c from public.contracts where id = _contract_id;
  else
    select * into c from public.contracts
    where opportunity_id = _opportunity_id
    order by created_at desc
    limit 1;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'title', d.title,
      'description', d.description,
      'quantity', d.quantity,
      'due_date', d.due_date,
      'status', d.status,
      'approval', d.approval
    ) order by d.position, d.due_date
  ), '[]'::jsonb)
  into report_deliveries
  from public.deliveries d
  where d.opportunity_id = _opportunity_id
    and (c is null or d.contract_id is not distinct from c.id)
    and d.status in ('entregue', 'aprovada');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'media_url', m.media_url,
      'media_type', m.media_type,
      'brand', m.brand,
      'detection_confidence', m.detection_confidence,
      'detected_at', m.detected_at,
      'event_name', e.name
    ) order by m.detected_at desc
  ), '[]'::jsonb)
  into report_evidence
  from public.brandtrack_media m
  left join public.brandtrack_events e on e.id = m.event_id
  where m.organization_id = opp.organization_id
    and (m.brand ilike opp.brand or m.sponsor_id is not distinct from opp.sponsor_id)
    and m.detection_confidence >= 0.6;

  result := jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', opp.id,
      'brand', opp.brand,
      'value', opp.value
    ),
    'contract', case when c is null then null else jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'total_value', c.total_value,
      'start_date', c.start_date,
      'end_date', c.end_date
    ) end,
    'deliveries', report_deliveries,
    'evidence', report_evidence
  );

  return result;
end;
$function$;
revoke all on function public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid) from public, anon, authenticated;
grant execute on function public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid) to service_role;

-- mark_overdue_installments: bloqueia _owner diferente de auth.uid() fora do service_role
CREATE OR REPLACE FUNCTION public.mark_overdue_installments(_owner uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND _owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed to update installments for another user';
  END IF;

  UPDATE public.installments
    SET status = 'atrasado'
    WHERE owner_id = _owner
      AND status = 'pendente'
      AND due_date < current_date;
END;
$function$;
revoke all on function public.mark_overdue_installments(_owner uuid) from public, anon, authenticated;
grant execute on function public.mark_overdue_installments(_owner uuid) to authenticated, service_role;

-- archive_sponsor: exige owner/admin
CREATE OR REPLACE FUNCTION public.archive_sponsor(_sponsor_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.sponsors WHERE id = _sponsor_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'Patrocinador não encontrado'; END IF;
  IF NOT public.has_org_role(auth.uid(), _org, ARRAY['owner','admin']::org_role[]) THEN
    RAISE EXCEPTION 'Somente Owner ou Admin podem arquivar contas';
  END IF;
  UPDATE public.sponsors
     SET archived_at = now(), archived_by = auth.uid(),
         archive_reason = NULLIF(btrim(coalesce(_reason,'')), ''), lifecycle = 'arquivado'
   WHERE id = _sponsor_id;
END $function$;
revoke all on function public.archive_sponsor(_sponsor_id uuid, _reason text) from public, anon, authenticated;
grant execute on function public.archive_sponsor(_sponsor_id uuid, _reason text) to authenticated, service_role;

-- unarchive_sponsor: exige owner/admin
CREATE OR REPLACE FUNCTION public.unarchive_sponsor(_sponsor_id uuid, _lifecycle sponsor_lifecycle DEFAULT 'prospect'::sponsor_lifecycle)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.sponsors WHERE id = _sponsor_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'Patrocinador não encontrado'; END IF;
  IF NOT public.has_org_role(auth.uid(), _org, ARRAY['owner','admin']::org_role[]) THEN
    RAISE EXCEPTION 'Somente Owner ou Admin podem desarquivar contas';
  END IF;
  UPDATE public.sponsors
     SET archived_at = NULL, archived_by = NULL, archive_reason = NULL,
         lifecycle = CASE WHEN _lifecycle = 'arquivado' THEN 'prospect'::sponsor_lifecycle ELSE _lifecycle END
   WHERE id = _sponsor_id;
END $function$;
revoke all on function public.unarchive_sponsor(_sponsor_id uuid, _lifecycle sponsor_lifecycle) from public, anon, authenticated;
grant execute on function public.unarchive_sponsor(_sponsor_id uuid, _lifecycle sponsor_lifecycle) to authenticated, service_role;

-- merge_sponsors: exige owner/admin
drop function if exists public.merge_sponsors(_duplicate_id uuid, _target_id uuid);
CREATE OR REPLACE FUNCTION public.merge_sponsors(_target_id uuid, _duplicate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _org uuid; _dup_org uuid; _moved jsonb := '{}'::jsonb; _n int;
BEGIN
  IF _target_id = _duplicate_id THEN RAISE EXCEPTION 'Selecione contas diferentes'; END IF;
  SELECT organization_id INTO _org FROM public.sponsors WHERE id = _target_id;
  SELECT organization_id INTO _dup_org FROM public.sponsors WHERE id = _duplicate_id;
  IF _org IS NULL OR _dup_org IS NULL THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;
  IF _org IS DISTINCT FROM _dup_org THEN RAISE EXCEPTION 'As contas pertencem a organizações diferentes'; END IF;
  IF NOT public.has_org_role(auth.uid(), _org, ARRAY['owner','admin']::org_role[]) THEN
    RAISE EXCEPTION 'Somente Owner ou Admin podem mesclar contas';
  END IF;

  UPDATE public.opportunities SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('opportunities', _n);
  UPDATE public.proposals SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('proposals', _n);
  UPDATE public.contracts SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('contracts', _n);
  UPDATE public.deliveries SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('deliveries', _n);
  UPDATE public.installments SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('installments', _n);
  UPDATE public.sponsor_interactions SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('interactions', _n);

  -- contatos sem duplicar (mesmo e-mail ou mesmo nome)
  UPDATE public.sponsor_contacts sc SET sponsor_id = _target_id
   WHERE sc.sponsor_id = _duplicate_id
     AND NOT EXISTS (
       SELECT 1 FROM public.sponsor_contacts t
        WHERE t.sponsor_id = _target_id
          AND (lower(coalesce(t.email,'')) = lower(coalesce(sc.email,'')) AND coalesce(sc.email,'') <> ''
               OR lower(t.name) = lower(sc.name)));
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('contacts', _n);

  UPDATE public.sponsor_brands sb SET sponsor_id = _target_id
   WHERE sb.sponsor_id = _duplicate_id
     AND NOT EXISTS (SELECT 1 FROM public.sponsor_brands t WHERE t.sponsor_id = _target_id AND lower(t.name) = lower(sb.name));
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('brands', _n);

  UPDATE public.sponsor_portal_access spa SET sponsor_id = _target_id
   WHERE spa.sponsor_id = _duplicate_id
     AND NOT EXISTS (SELECT 1 FROM public.sponsor_portal_access t WHERE t.sponsor_id = _target_id AND t.user_id = spa.user_id);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('portal_access', _n);

  UPDATE public.sponsors
     SET archived_at = now(), archived_by = auth.uid(), lifecycle = 'arquivado',
         archive_reason = 'Mesclado em outra conta', merged_into_sponsor_id = _target_id
   WHERE id = _duplicate_id;

  INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, old_value, new_value, source)
  VALUES (_org, _target_id, auth.uid(), 'sponsor', _duplicate_id, 'merged',
          jsonb_build_object('duplicate_id', _duplicate_id), _moved, 'manual');

  RETURN _moved;
END $function$;
revoke all on function public.merge_sponsors(_target_id uuid, _duplicate_id uuid) from public, anon, authenticated;
grant execute on function public.merge_sponsors(_target_id uuid, _duplicate_id uuid) to authenticated, service_role;

-- generate_contract_deliveries: chamada pelos triggers de contrato
CREATE OR REPLACE FUNCTION public.generate_contract_deliveries(_contract_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record;
  ca record;
  exists_count integer;
  total_assets integer;
  idx integer := 0;
  base_date date;
  end_date date;
  span_days integer;
  proportional_due date;
begin
  select * into c from public.contracts where id = _contract_id;
  if not found then return; end if;

  base_date := coalesce(c.start_date, current_date);
  end_date := coalesce(c.end_date, base_date);
  span_days := greatest(end_date - base_date, 0);

  select count(*) into total_assets from public.contract_assets where contract_id = _contract_id;

  for ca in select * from public.contract_assets where contract_id = _contract_id order by created_at, id loop
    -- evita duplicar: pula se já existe entrega vinculada a este contrato com mesmo título e oportunidade
    select count(*) into exists_count
      from public.deliveries
      where opportunity_id is not distinct from c.opportunity_id
        and contract_id is not distinct from c.id
        and title = ca.name;

    if exists_count = 0 then
      if total_assets > 1 then
        proportional_due := base_date + ((span_days * idx) / (total_assets - 1))::integer;
      else
        proportional_due := end_date;
      end if;

      insert into public.deliveries (
        owner_id, organization_id, brand, property_id, opportunity_id, contract_id,
        title, description, asset_type, quantity,
        due_date, status, approval, position
      ) values (
        c.owner_id, c.organization_id, c.brand, c.property_id, c.opportunity_id, c.id,
        ca.name, ca.notes, 'ativo_contratado', greatest(coalesce(ca.quantity, 1), 1),
        proportional_due, 'pendente'::delivery_status, 'pendente'::delivery_approval, idx
      );
    end if;
    idx := idx + 1;
  end loop;
end;
$function$;
revoke all on function public.generate_contract_deliveries(_contract_id uuid) from public, anon, authenticated;
grant execute on function public.generate_contract_deliveries(_contract_id uuid) to service_role;

-- generate_contract_installments: chamada pelos triggers de contrato
CREATE OR REPLACE FUNCTION public.generate_contract_installments(_contract_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record;
  i integer;
  n_installments integer;
  base_date date;
  due_d integer;
  next_due date;
  per_value numeric;
  months_span integer;
  step_months integer;
  step_days integer;
  dates date[];
begin
  select * into c from public.contracts where id = _contract_id;
  if not found then return; end if;

  delete from public.installments where contract_id = _contract_id and status <> 'pago';

  base_date := coalesce(c.start_date, current_date);
  if c.due_days is not null and c.due_days > 0 then
    base_date := base_date + (c.due_days || ' day')::interval;
  end if;
  due_d := coalesce(c.due_day, extract(day from base_date)::int);

  dates := coalesce(c.custom_due_dates, '{}'::date[]);

  -- Datas manuais têm prioridade
  if array_length(dates, 1) is not null and array_length(dates, 1) > 0 then
    n_installments := array_length(dates, 1);
    per_value := round(c.total_value / n_installments, 2);
    for i in 1..n_installments loop
      insert into public.installments (
        contract_id, owner_id, installment_number, total_installments,
        amount, due_date, payment_method, status
      ) values (
        c.id, c.owner_id, i, n_installments,
        per_value, dates[i], c.payment_method,
        case when dates[i] < current_date then 'atrasado'::installment_status else 'pendente'::installment_status end
      );
    end loop;
    return;
  end if;

  step_months := 1;
  step_days := 0;

  if c.payment_method = 'a_vista' then
    n_installments := 1;
    per_value := c.total_value;
  elsif c.payment_method = 'parcelado' then
    n_installments := greatest(c.installments, 1);
    per_value := round(c.total_value / n_installments, 2);
  elsif c.payment_method in ('mensal','bimestral','trimestral','semestral','anual') then
    step_months := case c.payment_method
      when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3
      when 'semestral' then 6 else 12 end;
    if c.end_date is not null then
      months_span := greatest(
        (extract(year from c.end_date)::int - extract(year from base_date)::int) * 12
        + (extract(month from c.end_date)::int - extract(month from base_date)::int) + 1,
        1
      );
      n_installments := greatest(ceil(months_span::numeric / step_months)::int, 1);
    else
      n_installments := greatest(c.installments, 1);
    end if;
    per_value := round(c.total_value / n_installments, 2);
  elsif c.payment_method = 'quinzenal' then
    step_days := 15;
    n_installments := greatest(c.installments, 1);
    if c.end_date is not null then
      n_installments := greatest(((c.end_date - base_date) / 15) + 1, 1);
    end if;
    per_value := round(c.total_value / n_installments, 2);
  else
    n_installments := 1;
    per_value := c.total_value;
  end if;

  for i in 1..n_installments loop
    if c.payment_method = 'a_vista' then
      next_due := base_date;
    elsif step_days > 0 then
      next_due := base_date + ((i - 1) * step_days || ' day')::interval;
    else
      next_due := (date_trunc('month', base_date) + (((i - 1) * step_months) || ' month')::interval)::date;
      next_due := least(
        (next_due + ((due_d - 1) || ' day')::interval)::date,
        (date_trunc('month', next_due) + interval '1 month - 1 day')::date
      );
    end if;

    insert into public.installments (
      contract_id, owner_id, installment_number, total_installments,
      amount, due_date, payment_method, status
    ) values (
      c.id, c.owner_id, i, n_installments,
      per_value, next_due, c.payment_method,
      case when next_due < current_date then 'atrasado'::installment_status else 'pendente'::installment_status end
    );
  end loop;
end;
$function$;
revoke all on function public.generate_contract_installments(_contract_id uuid) from public, anon, authenticated;
grant execute on function public.generate_contract_installments(_contract_id uuid) to service_role;

-- sync_opportunity_stage: DESVIO DELIBERADO: no Lovable era SECURITY DEFINER executável por anon/authenticated sem checar organização (qualquer um mudava o estágio de qualquer oportunidade). Só triggers/service_role a usam
CREATE OR REPLACE FUNCTION public.sync_opportunity_stage(_opportunity_id uuid, _target opportunity_stage)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order text[] := ARRAY['prospect','reuniao','proposta_enviada','negociacao','fechado'];
  _current opportunity_stage;
BEGIN
  IF _opportunity_id IS NULL THEN RETURN; END IF;
  SELECT stage INTO _current FROM public.opportunities WHERE id = _opportunity_id;
  IF _current IS NULL OR _current = 'perdido' THEN RETURN; END IF;
  IF array_position(_order, _target::text) IS NULL THEN RETURN; END IF;
  IF array_position(_order, _target::text) <= array_position(_order, _current::text) THEN RETURN; END IF;

  UPDATE public.opportunities
  SET stage = _target,
      last_stage_change_at = now(),
      updated_at = now()
  WHERE id = _opportunity_id;
END;
$function$;
revoke all on function public.sync_opportunity_stage(_opportunity_id uuid, _target opportunity_stage) from public, anon, authenticated;
grant execute on function public.sync_opportunity_stage(_opportunity_id uuid, _target opportunity_stage) to service_role;

-- sync_opportunity_contact_to_sponsor: DESVIO DELIBERADO: mesmo caso de sync_opportunity_stage
CREATE OR REPLACE FUNCTION public.sync_opportunity_contact_to_sponsor(_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _c record; _sponsor uuid; _org uuid; _role text;
BEGIN
  SELECT * INTO _c FROM public.opportunity_contacts WHERE id = _contact_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT sponsor_id, organization_id INTO _sponsor, _org FROM public.opportunities WHERE id = _c.opportunity_id;
  IF _sponsor IS NULL THEN RETURN; END IF;

  _role := COALESCE(NULLIF(btrim(_c.role), ''),
    CASE _c.contact_type WHEN 'contrato' THEN 'Responsável pelo contrato'
                         WHEN 'financeiro' THEN 'Financeiro'
                         ELSE NULL END);

  IF EXISTS (
    SELECT 1 FROM public.sponsor_contacts sc
    WHERE sc.sponsor_id = _sponsor
      AND ((COALESCE(_c.email,'') <> '' AND lower(COALESCE(sc.email,'')) = lower(_c.email))
           OR lower(sc.name) = lower(_c.name))
  ) THEN
    UPDATE public.sponsor_contacts sc
       SET role = COALESCE(_role, sc.role),
           email = COALESCE(NULLIF(_c.email,''), sc.email),
           phone = COALESCE(NULLIF(_c.phone,''), sc.phone)
     WHERE sc.sponsor_id = _sponsor
       AND ((COALESCE(_c.email,'') <> '' AND lower(COALESCE(sc.email,'')) = lower(_c.email))
            OR lower(sc.name) = lower(_c.name));
  ELSE
    INSERT INTO public.sponsor_contacts (sponsor_id, organization_id, name, role, email, phone, is_primary)
    VALUES (_sponsor, COALESCE(_org, _c.organization_id), _c.name, _role, NULLIF(_c.email,''), NULLIF(_c.phone,''), _c.is_primary);
  END IF;
END $function$;
revoke all on function public.sync_opportunity_contact_to_sponsor(_contact_id uuid) from public, anon, authenticated;
grant execute on function public.sync_opportunity_contact_to_sponsor(_contact_id uuid) to service_role;

-- create_renewal_opportunity: exige can_access_module crm escrita
CREATE OR REPLACE FUNCTION public.create_renewal_opportunity(_contract_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c record; _opp uuid;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  IF NOT public.can_access_module(auth.uid(), c.organization_id, 'crm', true) THEN
    RAISE EXCEPTION 'Usuário sem permissão de CRM nesta organização';
  END IF;

  INSERT INTO public.opportunities (owner_id, organization_id, brand, value, stage, property_id, sponsor_id, notes)
  VALUES (auth.uid(), c.organization_id, c.brand, c.total_value, 'prospect'::opportunity_stage, c.property_id, c.sponsor_id,
          'Renovação gerada a partir do contrato ' || c.title || ' (término em ' || COALESCE(c.end_date::text, 'sem data') || ').')
  RETURNING id INTO _opp;

  INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, new_value, source)
  VALUES (c.organization_id, c.sponsor_id, auth.uid(), 'opportunity', _opp, 'renewal_created',
          jsonb_build_object('contract_id', c.id), 'manual');

  RETURN _opp;
END $function$;
revoke all on function public.create_renewal_opportunity(_contract_id uuid) from public, anon, authenticated;
grant execute on function public.create_renewal_opportunity(_contract_id uuid) to authenticated, service_role;

-- log_sponsor_interaction: chamada pelos triggers de interação
drop function if exists public.log_sponsor_interaction(_contract_id uuid, _delivery_id uuid, _description text, _installment_id uuid, _metadata json, _opportunity_id uuid, _owner_id uuid, _proposal_id uuid, _sponsor_id uuid, _title text, _type sponsor_interaction_type);
CREATE OR REPLACE FUNCTION public.log_sponsor_interaction(_sponsor_id uuid, _owner_id uuid, _type sponsor_interaction_type, _title text, _description text, _metadata jsonb, _opportunity_id uuid, _contract_id uuid, _proposal_id uuid, _delivery_id uuid, _installment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _sponsor_id IS NULL OR _owner_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.sponsor_interactions (
    sponsor_id, owner_id, type, source, title, description, metadata,
    related_opportunity_id, related_contract_id, related_proposal_id,
    related_delivery_id, related_installment_id
  ) VALUES (
    _sponsor_id, _owner_id, _type, 'auto', _title, _description, COALESCE(_metadata, '{}'::jsonb),
    _opportunity_id, _contract_id, _proposal_id, _delivery_id, _installment_id
  );
END $function$;
revoke all on function public.log_sponsor_interaction(_sponsor_id uuid, _owner_id uuid, _type sponsor_interaction_type, _title text, _description text, _metadata jsonb, _opportunity_id uuid, _contract_id uuid, _proposal_id uuid, _delivery_id uuid, _installment_id uuid) from public, anon, authenticated;
grant execute on function public.log_sponsor_interaction(_sponsor_id uuid, _owner_id uuid, _type sponsor_interaction_type, _title text, _description text, _metadata jsonb, _opportunity_id uuid, _contract_id uuid, _proposal_id uuid, _delivery_id uuid, _installment_id uuid) to service_role;

-- Mantidas da reconstrução: só permissões (remove anon)
-- copy_opportunity_tier_to_proposal: MANTIDA (invoker, protegida por RLS). No Lovable é SECURITY DEFINER sem checar organização e restrita a service_role, o que fazia a chamada do frontend (OpportunityDrawer) falhar em silêncio
revoke all on function public.copy_opportunity_tier_to_proposal(_opportunity_id uuid, _proposal_id uuid) from public, anon, authenticated;
grant execute on function public.copy_opportunity_tier_to_proposal(_opportunity_id uuid, _proposal_id uuid) to authenticated, service_role;
-- copy_proposal_items_to_contract: MANTIDA pelo mesmo motivo (chamada por OpportunityDrawer e Proposals)
revoke all on function public.copy_proposal_items_to_contract(_contract_id uuid, _proposal_id uuid) from public, anon, authenticated;
grant execute on function public.copy_proposal_items_to_contract(_contract_id uuid, _proposal_id uuid) to authenticated, service_role;
-- copy_opportunity_tier_to_contract: MANTIDA (0011, não existe no Lovable)
revoke all on function public.copy_opportunity_tier_to_contract(_opportunity_id uuid, _contract_id uuid) from public, anon, authenticated;
grant execute on function public.copy_opportunity_tier_to_contract(_opportunity_id uuid, _contract_id uuid) to authenticated, service_role;

-- crm_unlinked_records: definição real (a reconstrução não tinha como inferir o SQL)
drop view if exists public.crm_unlinked_records;
create view public.crm_unlinked_records with (security_invoker = on) as
 SELECT 'opportunity'::text AS entity_type,
    o.id AS entity_id,
    o.organization_id,
    o.brand AS label,
    o.created_at
   FROM opportunities o
  WHERE o.sponsor_id IS NULL
UNION ALL
 SELECT 'proposal'::text AS entity_type,
    p.id AS entity_id,
    p.organization_id,
    p.brand AS label,
    p.created_at
   FROM proposals p
  WHERE p.sponsor_id IS NULL
UNION ALL
 SELECT 'contract'::text AS entity_type,
    c.id AS entity_id,
    c.organization_id,
    c.brand AS label,
    c.created_at
   FROM contracts c
  WHERE c.sponsor_id IS NULL
UNION ALL
 SELECT 'delivery'::text AS entity_type,
    d.id AS entity_id,
    d.organization_id,
    d.brand AS label,
    d.created_at
   FROM deliveries d
  WHERE d.sponsor_id IS NULL;
grant select on public.crm_unlinked_records to authenticated, service_role;
