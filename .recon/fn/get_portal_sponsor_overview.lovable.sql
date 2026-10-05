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
END $function$

