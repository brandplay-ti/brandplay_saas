CREATE OR REPLACE FUNCTION public.merge_sponsors(_duplicate_id uuid, _target_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _target_org uuid;
  _dup_org uuid;
  _n integer;
  _counts jsonb := '{}'::jsonb;
begin
  if _duplicate_id = _target_id then
    raise exception 'merge_sponsors: duplicate_id e target_id não podem ser o mesmo patrocinador';
  end if;

  select organization_id into _target_org from public.sponsors where id = _target_id;
  select organization_id into _dup_org from public.sponsors where id = _duplicate_id;

  if _target_org is null then
    raise exception 'merge_sponsors: patrocinador alvo % não encontrado ou sem organização', _target_id;
  end if;
  if _dup_org is null then
    raise exception 'merge_sponsors: patrocinador duplicado % não encontrado ou sem organização', _duplicate_id;
  end if;
  if _target_org <> _dup_org then
    raise exception 'merge_sponsors: os dois patrocinadores precisam pertencer à mesma organização';
  end if;
  if not public.has_org_role(_target_org, array['owner', 'admin']) then
    raise exception 'merge_sponsors: apenas owner/admin podem mesclar patrocinadores';
  end if;
  if exists (select 1 from public.sponsors where id = _duplicate_id and merged_into_sponsor_id is not null) then
    raise exception 'merge_sponsors: patrocinador duplicado já foi mesclado anteriormente';
  end if;

  -- Tabelas com várias linhas por patrocinador (sem unique(sponsor_id)):
  -- reatribuição direta, sem risco de conflito.
  update public.brandtrack_brands set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('brandtrack_brands', _n);

  update public.brandtrack_event_brands set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('brandtrack_event_brands', _n);

  update public.sponsor_contacts set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_contacts', _n);

  update public.sponsor_audit_logs set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_audit_logs', _n);

  update public.sponsor_brands set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_brands', _n);

  update public.sponsor_documents set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_documents', _n);

  update public.sponsor_invites set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_invites', _n);

  update public.tier_sales set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('tier_sales', _n);

  update public.property_checklist_items set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('property_checklist_items', _n);

  update public.opportunities set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('opportunities', _n);

  update public.contracts set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('contracts', _n);

  update public.installments set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('installments', _n);

  update public.deliveries set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('deliveries', _n);

  update public.proposals set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('proposals', _n);

  update public.crm_tasks set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('crm_tasks', _n);

  update public.sponsor_interactions set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_interactions', _n);

  update public.assets set exclusive_sponsor_id = _target_id where exclusive_sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('assets_exclusive_sponsor_id', _n);

  -- Tabelas "perfil" 1:1 por patrocinador (constraint unique(sponsor_id)):
  -- se o alvo já tem uma linha, a do duplicado é DESCARTADA (dado do alvo
  -- prevalece - decisão explícita, sem merge campo a campo; é a única
  -- exceção a "nunca exclusão física" neste schema, limitada a este
  -- conflito de unicidade específico). Senão, reatribuída normalmente.
  delete from public.sponsor_brandtrack_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_brandtrack_profiles where sponsor_id = _target_id);
  update public.sponsor_brandtrack_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_brandtrack_profiles', _n);

  delete from public.sponsor_contract_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_contract_profiles where sponsor_id = _target_id);
  update public.sponsor_contract_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_contract_profiles', _n);

  delete from public.sponsor_crm_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_crm_profiles where sponsor_id = _target_id);
  update public.sponsor_crm_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_crm_profiles', _n);

  delete from public.sponsor_delivery_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_delivery_profiles where sponsor_id = _target_id);
  update public.sponsor_delivery_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_delivery_profiles', _n);

  delete from public.sponsor_finance_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_finance_profiles where sponsor_id = _target_id);
  update public.sponsor_finance_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_finance_profiles', _n);

  delete from public.sponsor_portal_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_portal_profiles where sponsor_id = _target_id);
  update public.sponsor_portal_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_portal_profiles', _n);

  delete from public.sponsor_proposal_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_proposal_profiles where sponsor_id = _target_id);
  update public.sponsor_proposal_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_proposal_profiles', _n);

  delete from public.sponsor_executive_summaries where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_executive_summaries where sponsor_id = _target_id);
  update public.sponsor_executive_summaries set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_executive_summaries', _n);

  -- sponsor_portal_access: unique(sponsor_id, user_id). Se o usuário já tem
  -- acesso ao alvo, a linha do duplicado é descartada (o usuário já está
  -- coberto); senão, reatribuída.
  delete from public.sponsor_portal_access spa_dup
  where spa_dup.sponsor_id = _duplicate_id
    and exists (
      select 1 from public.sponsor_portal_access spa_target
      where spa_target.sponsor_id = _target_id
        and spa_target.user_id = spa_dup.user_id
    );
  update public.sponsor_portal_access set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_portal_access', _n);

  -- Marca o duplicado como mesclado - NUNCA exclusão física do registro
  -- sponsors em si (plano: "sem exclusão física").
  update public.sponsors
  set merged_into_sponsor_id = _target_id,
      lifecycle = 'arquivado',
      archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = 'merged_into:' || _target_id::text,
      updated_at = now()
  where id = _duplicate_id;

  insert into public.sponsor_audit_logs (
    organization_id, actor_id, sponsor_id, entity_type, entity_id, action, old_value, new_value, source
  ) values (
    _target_org, auth.uid(), _target_id, 'sponsor', _duplicate_id, 'merge',
    jsonb_build_object('duplicate_id', _duplicate_id),
    jsonb_build_object('target_id', _target_id, 'moved', _counts),
    'manual'
  );

  return (jsonb_build_object('target_id', _target_id, 'duplicate_id', _duplicate_id, 'moved', _counts))::json;
end;
$function$

