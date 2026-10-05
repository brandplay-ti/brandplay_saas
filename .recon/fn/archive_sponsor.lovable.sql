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
END $function$

