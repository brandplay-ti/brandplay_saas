revoke execute on function public.generate_contract_deliveries(uuid) from public, anon, authenticated;
revoke execute on function public.copy_opportunity_tier_to_proposal(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.copy_proposal_items_to_contract(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.get_delivery_report_data(uuid, uuid) from public, anon, authenticated;

grant execute on function public.generate_contract_deliveries(uuid) to service_role;
grant execute on function public.copy_opportunity_tier_to_proposal(uuid, uuid) to service_role;
grant execute on function public.copy_proposal_items_to_contract(uuid, uuid) to service_role;
grant execute on function public.get_delivery_report_data(uuid, uuid) to service_role;