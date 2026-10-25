CREATE OR REPLACE FUNCTION public.tg_set_child_sponsor_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sponsor_id IS NULL AND NEW.contract_id IS NOT NULL THEN
    SELECT sponsor_id INTO NEW.sponsor_id FROM public.contracts WHERE id = NEW.contract_id;
  END IF;

  IF TG_TABLE_NAME = 'deliveries' THEN
    IF NEW.sponsor_id IS NULL AND NEW.opportunity_id IS NOT NULL THEN
      SELECT sponsor_id INTO NEW.sponsor_id FROM public.opportunities WHERE id = NEW.opportunity_id;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'installments' THEN
    IF NEW.organization_id IS NULL AND NEW.contract_id IS NOT NULL THEN
      SELECT organization_id INTO NEW.organization_id FROM public.contracts WHERE id = NEW.contract_id;
    END IF;
  END IF;

  RETURN NEW;
END $function$;