CREATE TABLE IF NOT EXISTS public.opportunity_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  from_stage opportunity_stage,
  to_stage opportunity_stage,
  old_value numeric,
  new_value numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_opportunity_audit_logs_opportunity_created
  ON public.opportunity_audit_logs (opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunity_audit_logs_organization
  ON public.opportunity_audit_logs (organization_id);

DROP POLICY IF EXISTS "Org members view opportunity audit logs" ON public.opportunity_audit_logs;
CREATE POLICY "Org members view opportunity audit logs"
ON public.opportunity_audit_logs
FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "CRM users create opportunity audit logs" ON public.opportunity_audit_logs;
CREATE POLICY "CRM users create opportunity audit logs"
ON public.opportunity_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE OR REPLACE FUNCTION public.tg_opportunity_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.opportunity_audit_logs (
      opportunity_id, organization_id, actor_id, event_type, to_stage, new_value, metadata
    ) VALUES (
      NEW.id, NEW.organization_id, COALESCE(_actor, NEW.owner_id), 'created', NEW.stage, NEW.value,
      jsonb_build_object('brand', NEW.brand)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.opportunity_audit_logs (
      opportunity_id, organization_id, actor_id, event_type, from_stage, to_stage, old_value, new_value, metadata
    ) VALUES (
      NEW.id, NEW.organization_id, COALESCE(_actor, NEW.owner_id), 'stage_changed', OLD.stage, NEW.stage, OLD.value, NEW.value,
      jsonb_build_object('brand', NEW.brand)
    );
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.value IS DISTINCT FROM OLD.value THEN
    INSERT INTO public.opportunity_audit_logs (
      opportunity_id, organization_id, actor_id, event_type, old_value, new_value, metadata
    ) VALUES (
      NEW.id, NEW.organization_id, COALESCE(_actor, NEW.owner_id), 'value_changed', OLD.value, NEW.value,
      jsonb_build_object('brand', NEW.brand, 'stage', NEW.stage)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_audit_log ON public.opportunities;
CREATE TRIGGER trg_opportunity_audit_log
AFTER INSERT OR UPDATE ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.tg_opportunity_audit_log();