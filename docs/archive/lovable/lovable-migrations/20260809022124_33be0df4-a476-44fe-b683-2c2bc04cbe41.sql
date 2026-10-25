CREATE OR REPLACE FUNCTION public.sync_opportunity_stage(_opportunity_id uuid, _target opportunity_stage)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      decided_at = CASE WHEN _target = 'fechado' THEN COALESCE(decided_at, now()) ELSE decided_at END,
      updated_at = now()
  WHERE id = _opportunity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_proposal_sync_opportunity_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.converted_opportunity_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'aceita' THEN
    PERFORM public.sync_opportunity_stage(NEW.converted_opportunity_id, 'fechado');
  ELSIF NEW.status = 'enviada' THEN
    PERFORM public.sync_opportunity_stage(NEW.converted_opportunity_id, 'proposta_enviada');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposal_sync_opportunity_stage ON public.proposals;
CREATE TRIGGER proposal_sync_opportunity_stage
AFTER INSERT OR UPDATE OF status ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_sync_opportunity_stage();

CREATE OR REPLACE FUNCTION public.tg_contract_sync_opportunity_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.opportunity_id IS NOT NULL THEN
    PERFORM public.sync_opportunity_stage(NEW.opportunity_id, 'fechado');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_sync_opportunity_stage ON public.contracts;
CREATE TRIGGER contract_sync_opportunity_stage
AFTER INSERT OR UPDATE OF opportunity_id, status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.tg_contract_sync_opportunity_stage();

CREATE OR REPLACE FUNCTION public.tg_delivery_sync_opportunity_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.opportunity_id IS NOT NULL THEN
    PERFORM public.sync_opportunity_stage(NEW.opportunity_id, 'fechado');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_sync_opportunity_stage ON public.deliveries;
CREATE TRIGGER delivery_sync_opportunity_stage
AFTER INSERT ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_sync_opportunity_stage();