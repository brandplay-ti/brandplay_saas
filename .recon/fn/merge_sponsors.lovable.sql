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
END $function$

