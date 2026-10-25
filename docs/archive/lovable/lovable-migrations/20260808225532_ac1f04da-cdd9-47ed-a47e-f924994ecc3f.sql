
CREATE OR REPLACE FUNCTION public.tg_set_org_from_membership_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_user_org(COALESCE(NEW.owner_id, auth.uid()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_sellout_reports BEFORE INSERT ON public.sellout_reports
FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_membership_default();

CREATE TRIGGER set_org_sponsor_exec_summaries BEFORE INSERT ON public.sponsor_executive_summaries
FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_membership_default();

CREATE TRIGGER set_org_contract_churn_risk BEFORE INSERT ON public.contract_churn_risk
FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_membership_default();
