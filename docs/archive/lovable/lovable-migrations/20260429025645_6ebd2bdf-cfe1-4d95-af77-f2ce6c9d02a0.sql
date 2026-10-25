-- Restrict direct execution of trigger-only SECURITY DEFINER helpers created for tenant propagation.
REVOKE ALL ON FUNCTION public.set_org_from_property() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_org_from_proposal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_org_from_sponsor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_org_from_tier() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_org_from_user_membership() FROM PUBLIC, anon, authenticated;
