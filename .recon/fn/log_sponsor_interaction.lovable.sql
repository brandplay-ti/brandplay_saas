CREATE OR REPLACE FUNCTION public.log_sponsor_interaction(_sponsor_id uuid, _owner_id uuid, _type sponsor_interaction_type, _title text, _description text, _metadata jsonb, _opportunity_id uuid, _contract_id uuid, _proposal_id uuid, _delivery_id uuid, _installment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _sponsor_id IS NULL OR _owner_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.sponsor_interactions (
    sponsor_id, owner_id, type, source, title, description, metadata,
    related_opportunity_id, related_contract_id, related_proposal_id,
    related_delivery_id, related_installment_id
  ) VALUES (
    _sponsor_id, _owner_id, _type, 'auto', _title, _description, COALESCE(_metadata, '{}'::jsonb),
    _opportunity_id, _contract_id, _proposal_id, _delivery_id, _installment_id
  );
END $function$

