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
$function$

