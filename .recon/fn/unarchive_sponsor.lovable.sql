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
END $function$

