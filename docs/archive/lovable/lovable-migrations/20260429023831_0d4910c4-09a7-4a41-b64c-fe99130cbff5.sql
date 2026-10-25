CREATE OR REPLACE FUNCTION public.notify_commercial_team_opportunity_lost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _reason text;
  _lost_value numeric;
  _description text;
  _dedupe_key text;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR NEW.stage IS DISTINCT FROM 'perdido'::opportunity_stage
     OR OLD.stage IS NOT DISTINCT FROM 'perdido'::opportunity_stage THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  _reason := COALESCE(NULLIF(btrim(NEW.lost_reason), ''), 'Motivo não informado');
  _lost_value := COALESCE(NEW.lost_value, NEW.value, 0);
  _description := 'Motivo: ' || _reason || ' · Valor perdido: R$ ' || trim(to_char(_lost_value, 'FM999G999G999G990D00'));
  _dedupe_key := 'opportunity_lost:' || NEW.id::text;

  INSERT INTO public.notifications (
    user_id,
    organization_id,
    category,
    priority,
    title,
    description,
    action_url,
    related_entity_type,
    related_entity_id,
    metadata,
    dedupe_key
  )
  SELECT
    om.user_id,
    NEW.organization_id,
    'opportunity_lost',
    'alta',
    'Oportunidade perdida: ' || NEW.brand,
    _description,
    '/dashboard/pipeline',
    'opportunity',
    NEW.id,
    jsonb_build_object(
      'brand', NEW.brand,
      'lost_reason', _reason,
      'lost_comment', NEW.lost_comment,
      'lost_competitor', NEW.lost_competitor,
      'lost_value', _lost_value,
      'previous_stage', OLD.stage,
      'current_stage', NEW.stage
    ),
    _dedupe_key
  FROM public.organization_members om
  WHERE om.organization_id = NEW.organization_id
    AND om.status = 'ativo'
    AND om.role IN ('owner'::org_role, 'admin'::org_role, 'comercial'::org_role)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = om.user_id
        AND n.dedupe_key = _dedupe_key
    );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notify_commercial_team_opportunity_lost ON public.opportunities;
CREATE TRIGGER notify_commercial_team_opportunity_lost
AFTER UPDATE OF stage ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.notify_commercial_team_opportunity_lost();