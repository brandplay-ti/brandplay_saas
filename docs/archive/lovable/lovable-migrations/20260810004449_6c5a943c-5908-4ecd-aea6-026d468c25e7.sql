-- 1) Validate public lead submissions server-side
CREATE OR REPLACE FUNCTION public.validate_property_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.contact_name := btrim(NEW.contact_name);
  NEW.email := lower(btrim(NEW.email));
  NEW.company := nullif(btrim(coalesce(NEW.company, '')), '');
  NEW.phone := nullif(btrim(coalesce(NEW.phone, '')), '');
  NEW.message := nullif(btrim(coalesce(NEW.message, '')), '');
  NEW.budget_range := nullif(btrim(coalesce(NEW.budget_range, '')), '');

  IF char_length(NEW.contact_name) < 2 OR char_length(NEW.contact_name) > 120 THEN
    RAISE EXCEPTION 'invalid contact_name';
  END IF;
  IF NEW.email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' OR char_length(NEW.email) > 254 THEN
    RAISE EXCEPTION 'invalid email';
  END IF;
  IF NEW.phone IS NOT NULL AND (char_length(NEW.phone) > 30 OR NEW.phone !~ '^[0-9+()\-\s.]+$') THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;
  IF NEW.company IS NOT NULL AND char_length(NEW.company) > 160 THEN
    RAISE EXCEPTION 'invalid company';
  END IF;
  IF NEW.message IS NOT NULL AND char_length(NEW.message) > 2000 THEN
    RAISE EXCEPTION 'invalid message';
  END IF;
  IF NEW.budget_range IS NOT NULL AND char_length(NEW.budget_range) > 80 THEN
    RAISE EXCEPTION 'invalid budget_range';
  END IF;

  -- Public submitters cannot control workflow columns
  IF auth.uid() IS NULL THEN
    NEW.status := 'novo';
    NEW.created_opportunity_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_lead ON public.property_leads;
CREATE TRIGGER trg_validate_property_lead
BEFORE INSERT ON public.property_leads
FOR EACH ROW EXECUTE FUNCTION public.validate_property_lead();

-- 2) Remove redundant overlapping ALL policies
DROP POLICY IF EXISTS "Users manage own org dashboard preferences" ON public.user_dashboard_preferences;
DROP POLICY IF EXISTS "Users manage own org stage probabilities" ON public.user_stage_probabilities;

DROP POLICY IF EXISTS "Users insert own dashboard prefs" ON public.user_dashboard_preferences;
DROP POLICY IF EXISTS "Users update own dashboard prefs" ON public.user_dashboard_preferences;
CREATE POLICY "Users insert own dashboard prefs"
ON public.user_dashboard_preferences FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR is_org_member(auth.uid(), organization_id)));
CREATE POLICY "Users update own dashboard prefs"
ON public.user_dashboard_preferences FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR is_org_member(auth.uid(), organization_id)));

DROP POLICY IF EXISTS "Users insert own probabilities" ON public.user_stage_probabilities;
DROP POLICY IF EXISTS "Users update own probabilities" ON public.user_stage_probabilities;
CREATE POLICY "Users insert own probabilities"
ON public.user_stage_probabilities FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR is_org_member(auth.uid(), organization_id)));
CREATE POLICY "Users update own probabilities"
ON public.user_stage_probabilities FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR is_org_member(auth.uid(), organization_id)));