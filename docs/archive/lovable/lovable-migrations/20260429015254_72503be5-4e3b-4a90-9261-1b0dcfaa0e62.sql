CREATE OR REPLACE FUNCTION public.validate_opportunity_loss_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lost_value IS NOT NULL AND NEW.lost_value < 0 THEN
    RAISE EXCEPTION 'Valor perdido não pode ser negativo';
  END IF;

  IF NEW.lost_competitor IS NOT NULL AND length(btrim(NEW.lost_competitor)) > 120 THEN
    RAISE EXCEPTION 'Concorrente deve ter no máximo 120 caracteres';
  END IF;

  IF NEW.stage = 'perdido'::opportunity_stage THEN
    IF NEW.lost_reason IS NULL OR length(btrim(NEW.lost_reason)) < 2 THEN
      RAISE EXCEPTION 'Informe o motivo da perda';
    END IF;

    IF NEW.lost_comment IS NULL OR length(btrim(NEW.lost_comment)) < 2 THEN
      RAISE EXCEPTION 'Informe um comentário sobre a perda';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_opportunity_loss_fields_trigger ON public.opportunities;
CREATE TRIGGER validate_opportunity_loss_fields_trigger
BEFORE INSERT OR UPDATE ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.validate_opportunity_loss_fields();