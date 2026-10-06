-- 0011_copy_opportunity_tier_to_contract.sql
-- Corrige o bug de frontend documentado em SCHEMA_NOTES.md ("Bug pré-existente
-- no frontend"): src/components/pipeline/OpportunityDrawer.tsx.convertToContract()
-- reaproveitava copy_opportunity_tier_to_proposal() passando o id do CONTRATO
-- recém-criado como _proposal_id, quando a oportunidade tem tier_id mas não
-- tem proposta prévia (fluxo "Oportunidade -> Contrato direto"). Essa chamada
-- sempre falhava (copy_opportunity_tier_to_proposal valida o id contra
-- public.proposals, nunca contra public.contracts) - o erro era só logado via
-- console.error, nunca bloqueava a UI, então passava despercebido.
--
-- Esta função não estava na lista original de 29 RPCs (não existia no banco
-- remoto do Lovable Cloud sob esse nome - o bug no frontend sugere que esse
-- caminho de conversão direta oportunidade->contrato com tier nunca funcionou
-- nem lá). É uma função nova, espelhando copy_opportunity_tier_to_proposal
-- (0010_journey_automation_functions.sql) mas inserindo em contract_assets em
-- vez de proposal_items - mesmo padrão de copy_proposal_items_to_contract.
--
-- Nunca editar 0001..0010 (já aplicadas) - isto é migration nova.

create or replace function public.copy_opportunity_tier_to_contract(_opportunity_id uuid, _contract_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  _opp record;
begin
  select id, organization_id, tier_id
  into _opp
  from public.opportunities
  where id = _opportunity_id;

  if not found then
    raise exception 'copy_opportunity_tier_to_contract: oportunidade % não encontrada', _opportunity_id;
  end if;

  if _opp.tier_id is null then
    raise exception 'copy_opportunity_tier_to_contract: oportunidade % não possui tier vinculado', _opportunity_id;
  end if;

  if not exists (select 1 from public.contracts where id = _contract_id and organization_id = _opp.organization_id) then
    raise exception 'copy_opportunity_tier_to_contract: contrato % não encontrado na mesma organização da oportunidade', _contract_id;
  end if;

  insert into public.contract_assets (organization_id, contract_id, asset_id, name, quantity, unit_value, notes)
  select
    _opp.organization_id, _contract_id, a.id, a.name, ta.quantity, a.unit_value, null
  from public.tier_assets ta
  join public.assets a on a.id = ta.asset_id
  where ta.tier_id = _opp.tier_id;
end;
$$;

comment on function public.copy_opportunity_tier_to_contract(uuid, uuid) is
  'Confiança alta (schema puro, espelha copy_opportunity_tier_to_proposal e copy_proposal_items_to_contract, ambas já validadas contra o stack local): criada para corrigir o bug de frontend documentado em SCHEMA_NOTES.md, não parte das 29 funções originais. Mesma regra de copy_opportunity_tier_to_proposal: sem tier_id, lança exceção em vez de inserir algo arbitrário.';
