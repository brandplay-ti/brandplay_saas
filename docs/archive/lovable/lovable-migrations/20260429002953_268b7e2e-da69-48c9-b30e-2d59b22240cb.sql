-- Harden SECURITY DEFINER functions: remove broad PUBLIC/anon execution.
REVOKE EXECUTE ON FUNCTION public.can_access_module(uuid, uuid, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_org(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, org_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_sponsor_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_installments(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_sponsor_ids(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_access_module(uuid, uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, org_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_sponsor_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_overdue_installments(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_sponsor_ids(uuid) TO authenticated, service_role;

-- Public catalog helpers used by public media-kit reads remain available to anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.is_property_published(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_asset_publicly_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_property_published(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_asset_publicly_visible(uuid) TO anon, authenticated, service_role;

-- Internal trigger/automation functions should not be directly callable by app users.
REVOKE EXECUTE ON FUNCTION public.enforce_delivery_attachment_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_contract_deliveries(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_contract_installments(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_checklist_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_contract_deliveries() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_contract_installments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_lead_to_opportunity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_organization() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_opportunity_stage_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_opportunity_won() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_sponsor_interaction(uuid, uuid, sponsor_interaction_type, text, text, jsonb, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_contract_interaction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_delivery_interaction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_installment_interaction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_opportunity_interaction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_proposal_interaction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_organization_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_update_sponsor_last_contact() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_delivery_attachment_limit() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_contract_deliveries(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_contract_installments(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_checklist_completion() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_contract_deliveries() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_contract_installments() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_lead_to_opportunity() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_organization() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_opportunity_stage_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_opportunity_won() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_sponsor_interaction(uuid, uuid, sponsor_interaction_type, text, text, jsonb, uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_contract_interaction() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_delivery_interaction() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_installment_interaction() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_opportunity_interaction() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_proposal_interaction() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_set_organization_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_update_sponsor_last_contact() TO service_role;