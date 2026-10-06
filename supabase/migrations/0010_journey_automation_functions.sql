-- 0010_journey_automation_functions.sql
-- Funções de automação da jornada "pipeline -> relatório de entrega"
-- (.lovable/plan/simplificar-a-jornada-da-marca-do-pipeline-ao-relatório-de-e-2026-08-07.md):
-- copy_opportunity_tier_to_proposal, copy_proposal_items_to_contract,
-- generate_contract_deliveries, generate_contract_installments,
-- sync_opportunity_stage, sync_opportunity_contact_to_sponsor,
-- create_renewal_opportunity. Ver SCHEMA_NOTES.md para o detalhe de
-- confiança/evidência de cada uma.
--
-- Nunca editar 0001..0009 (já aplicadas) - isto é migration nova.

-- =========================================================================
-- copy_opportunity_tier_to_proposal: "Oportunidade -> Proposta: ao converter,
-- copiar o tier da oportunidade como proposal_items (nome, quantidade, valor
-- unitário)." Call site confirmado em src/components/pipeline/OpportunityDrawer.tsx
-- (`convertToProposal`, só chamada quando `opp.tier_id` é truthy - a função
-- pode portanto assumir tier_id presente e falhar alto se não estiver).
-- =========================================================================

create or replace function public.copy_opportunity_tier_to_proposal(_opportunity_id uuid, _proposal_id uuid)
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
    raise exception 'copy_opportunity_tier_to_proposal: oportunidade % não encontrada', _opportunity_id;
  end if;

  if _opp.tier_id is null then
    raise exception 'copy_opportunity_tier_to_proposal: oportunidade % não possui tier vinculado', _opportunity_id;
  end if;

  if not exists (select 1 from public.proposals where id = _proposal_id and organization_id = _opp.organization_id) then
    raise exception 'copy_opportunity_tier_to_proposal: proposta % não encontrada na mesma organização da oportunidade', _proposal_id;
  end if;

  insert into public.proposal_items (organization_id, proposal_id, asset_id, name, description, quantity, unit_value, position, notes)
  select
    _opp.organization_id, _proposal_id, a.id, a.name, null, ta.quantity, a.unit_value,
    (row_number() over (order by ta.created_at))::integer - 1,
    null
  from public.tier_assets ta
  join public.assets a on a.id = ta.asset_id
  where ta.tier_id = _opp.tier_id;
end;
$$;

comment on function public.copy_opportunity_tier_to_proposal(uuid, uuid) is
  'Confiança alta: comportamento especificado literalmente no plano. "Se não existir tier, sugerir itens padrão da propriedade" é texto do plano para o FRONTEND (não para a RPC) - aqui, sem tier_id a função lança exceção clara em vez de inserir algo arbitrário (decisão documentada na tarefa: "use seu julgamento"). GAP CONFIRMADO fora desta migration: em OpportunityDrawer.tsx, o fluxo convertToContract() reutiliza esta MESMA rpc (nome errado reaproveitado) passando o id do CONTRATO recém-criado como `_proposal_id` quando não há proposta prévia mas há tier_id - isso sempre falhará aqui (exists check contra public.proposals não encontra um contrato) e o erro é só logado via console.error, nunca bloqueia a UI. É um bug pré-existente do frontend, fora do escopo desta tarefa (não tocamos em src/), documentado em SCHEMA_NOTES.md.';

-- =========================================================================
-- copy_proposal_items_to_contract: "Proposta -> Contrato: ao aceitar uma
-- proposta, copiar proposal_items como contract_assets e vincular
-- converted_opportunity_id/converted_proposal_id." Esses dois campos
-- existem em `proposals` (converted_opportunity_id, converted_contract_id),
-- não em `contracts` (confirmado em 0003_tables.sql) - só
-- proposals.converted_contract_id é setado aqui.
-- =========================================================================

create or replace function public.copy_proposal_items_to_contract(_contract_id uuid, _proposal_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  _contract record;
  _proposal record;
begin
  select id, organization_id into _contract from public.contracts where id = _contract_id;
  if not found then
    raise exception 'copy_proposal_items_to_contract: contrato % não encontrado', _contract_id;
  end if;

  select id, organization_id into _proposal from public.proposals where id = _proposal_id;
  if not found then
    raise exception 'copy_proposal_items_to_contract: proposta % não encontrada', _proposal_id;
  end if;

  if _contract.organization_id is distinct from _proposal.organization_id then
    raise exception 'copy_proposal_items_to_contract: contrato e proposta pertencem a organizações diferentes';
  end if;

  insert into public.contract_assets (organization_id, contract_id, asset_id, name, quantity, unit_value, notes)
  select _contract.organization_id, _contract_id, pi.asset_id, pi.name, pi.quantity, pi.unit_value, pi.notes
  from public.proposal_items pi
  where pi.proposal_id = _proposal_id;

  update public.proposals
  set converted_contract_id = _contract_id
  where id = _proposal_id
    and converted_contract_id is null;
end;
$$;

comment on function public.copy_proposal_items_to_contract(uuid, uuid) is
  'Confiança alta: call site confirmado em OpportunityDrawer.tsx (`convertToContract`, chamada quando `opp.converted_proposal_id` existe). `converted_opportunity_id`/`converted_contract_id` pertencem a `proposals` (e `converted_proposal_id`/`converted_contract_id` a `opportunities`) - nunca a `contracts`, que não tem essas colunas (confirmado lendo 0003_tables.sql por completo antes de escrever esta função). Só proposals.converted_contract_id é atualizado aqui; o vínculo opportunities.converted_contract_id já é setado separadamente pelo próprio frontend logo após chamar esta RPC (OpportunityDrawer.tsx, update direto em opportunities).';

-- =========================================================================
-- generate_contract_deliveries: "Contrato -> Entregas: quando o contrato
-- mudar para `ativo`, gerar automaticamente deliveries a partir dos
-- contract_assets, com due_date proporcional entre start_date e end_date,
-- vínculo opportunity_id/contract_id." Idempotente (no-op se já existem
-- entregas para o contrato).
-- =========================================================================

create or replace function public.generate_contract_deliveries(_contract_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  _contract record;
  _n integer;
begin
  select id, organization_id, owner_id, brand, opportunity_id, sponsor_id, property_id, start_date, end_date
  into _contract
  from public.contracts
  where id = _contract_id;

  if not found then
    raise exception 'generate_contract_deliveries: contrato % não encontrado', _contract_id;
  end if;

  if exists (select 1 from public.deliveries where contract_id = _contract_id) then
    return; -- idempotente: não duplica entregas já geradas para este contrato.
  end if;

  select count(*) into _n from public.contract_assets where contract_id = _contract_id;
  if _n = 0 then
    return;
  end if;

  insert into public.deliveries (
    organization_id, owner_id, contract_id, opportunity_id, sponsor_id, property_id,
    title, brand, quantity, position, due_date, status, approval
  )
  select
    _contract.organization_id, _contract.owner_id, _contract.id, _contract.opportunity_id,
    _contract.sponsor_id, _contract.property_id,
    ca.name, _contract.brand, ca.quantity,
    (row_number() over (order by ca.created_at))::integer - 1,
    case
      when _contract.start_date is null or _contract.end_date is null then null
      when _n <= 1 then _contract.end_date
      else _contract.start_date + round(
        (_contract.end_date - _contract.start_date)::numeric
        * ((row_number() over (order by ca.created_at)) - 1)
        / (_n - 1)
      )::integer
    end,
    'pendente', 'pendente'
  from public.contract_assets ca
  where ca.contract_id = _contract_id;
end;
$$;

comment on function public.generate_contract_deliveries(uuid) is
  'Confiança alta: especificação literal do plano para o cálculo de due_date proporcional. Idempotência (no-op se já há deliveries para o contrato) é suposição deliberada para permitir chamar esta função com segurança a partir do trigger contracts_activated_generate (ver abaixo) mesmo que o status "ativo" seja setado mais de uma vez. due_date usa distribuição proporcional linear entre start_date e end_date pela ordem de criação dos contract_assets; com start_date/end_date nulos, due_date fica nulo (não inventamos uma data).';

-- =========================================================================
-- generate_contract_installments: algoritmo reconstruído a partir da
-- semântica exata dos campos de contracts, confirmada em
-- src/components/contracts/PaymentScheduleFields.tsx (textos de ajuda da UI):
-- "due_days: Prazo somado à data de início para o primeiro vencimento" e
-- "custom_due_dates: Se informadas, substituem o cálculo automático das
-- parcelas." due_day é o dia fixo do mês (campo separado, "Vencimento: Dia N"
-- em Contracts.tsx). Idempotente como generate_contract_deliveries.
-- =========================================================================

create or replace function public.generate_contract_installments(_contract_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  _c record;
  _n integer;
  _total numeric(14,2);
  _first_due date;
  _step interval;
  _i integer;
  _due date;
  _amount numeric(14,2);
  _sum numeric(14,2) := 0;
  _dates text[];
begin
  select id, organization_id, owner_id, sponsor_id, payment_method, use_flat_value, flat_value,
         total_value, installments, due_day, due_days, custom_due_dates, start_date
  into _c
  from public.contracts
  where id = _contract_id;

  if not found then
    raise exception 'generate_contract_installments: contrato % não encontrado', _contract_id;
  end if;

  if exists (select 1 from public.installments where contract_id = _contract_id) then
    return; -- idempotente: nunca gera parcelas duplicadas para o mesmo contrato.
  end if;

  _total := case when _c.use_flat_value then coalesce(_c.flat_value, 0) else coalesce(_c.total_value, 0) end;
  _dates := array_remove(coalesce(_c.custom_due_dates, '{}'::text[]), null);

  if coalesce(array_length(_dates, 1), 0) > 0 then
    -- Datas manuais substituem o cálculo automático por completo: uma
    -- parcela por data informada (PaymentScheduleFields.tsx).
    _n := array_length(_dates, 1);
    for _i in 1.._n loop
      if _i = _n then
        _amount := _total - _sum;
      else
        _amount := round(_total / _n, 2);
        _sum := _sum + _amount;
      end if;
      insert into public.installments (
        organization_id, owner_id, contract_id, sponsor_id, installment_number,
        total_installments, amount, due_date, status, payment_method
      ) values (
        _c.organization_id, _c.owner_id, _c.id, _c.sponsor_id, _i,
        _n, _amount, _dates[_i]::date, 'pendente', _c.payment_method
      );
    end loop;
    return;
  end if;

  _n := case when _c.payment_method = 'a_vista' then 1 else greatest(coalesce(_c.installments, 1), 1) end;

  if _c.due_day is not null then
    _first_due := date_trunc('month', coalesce(_c.start_date, current_date))::date + (_c.due_day - 1);
    if _c.start_date is not null and _first_due < _c.start_date then
      _first_due := (date_trunc('month', _c.start_date) + interval '1 month')::date + (_c.due_day - 1);
    end if;
  elsif _c.due_days is not null then
    _first_due := coalesce(_c.start_date, current_date) + _c.due_days;
  else
    _first_due := coalesce(_c.start_date, current_date);
  end if;

  _step := case _c.payment_method
    when 'quinzenal' then interval '15 days'
    when 'bimestral' then interval '2 months'
    when 'trimestral' then interval '3 months'
    when 'semestral' then interval '6 months'
    when 'anual' then interval '12 months'
    else interval '1 month' -- mensal, parcelado, personalizado (sem datas manuais)
  end;

  for _i in 1.._n loop
    _due := (_first_due + (_step * (_i - 1)))::date;
    if _i = _n then
      _amount := _total - _sum;
    else
      _amount := round(_total / _n, 2);
      _sum := _sum + _amount;
    end if;
    insert into public.installments (
      organization_id, owner_id, contract_id, sponsor_id, installment_number,
      total_installments, amount, due_date, status, payment_method
    ) values (
      _c.organization_id, _c.owner_id, _c.id, _c.sponsor_id, _i,
      _n, _amount, _due, 'pendente', _c.payment_method
    );
  end loop;
end;
$$;

comment on function public.generate_contract_installments(uuid) is
  'Confiança média: NÃO há nenhum call site (client ou Edge Function) que gere installments hoje - nem via RPC nem via insert direto - então o algoritmo é uma reconstrução best-effort a partir da semântica de campo confirmada na UI (PaymentScheduleFields.tsx, Contracts.tsx), não de um comportamento observado em produção. Decisões específicas: (1) payment_method=''a_vista'' força 1 parcela, ignorando contracts.installments; (2) due_day define o dia fixo do mês (ajustado para o mês seguinte se cair antes de start_date); (3) due_days soma dias corridos a start_date só para a 1ª parcela; (4) payment_method=''personalizado'' sem custom_due_dates cai no fallback mensal (nenhuma evidência de comportamento alternativo); (5) a última parcela absorve o resto da divisão (total - soma das anteriores já arredondadas) para a soma bater exatamente com _total; (6) custom_due_dates (text[]) é castado para date assumindo formato ISO "YYYY-MM-DD", confirmado pelo código que gera essas strings em PaymentScheduleFields.tsx (`toISOString().slice(0,10)`); (7) idempotente (no-op se o contrato já tem parcelas) pela mesma razão de generate_contract_deliveries.';

-- =========================================================================
-- Trigger: liga a ativação do contrato (status -> 'ativo') à geração
-- automática de entregas e parcelas. NÃO pedida explicitamente por nome na
-- lista de 29 funções, mas é necessária para o comportamento já especificado
-- pelo plano ("quando o contrato mudar para ativo, gerar automaticamente
-- deliveries") realmente acontecer: confirmado lendo
-- src/pages/dashboard/Contracts.tsx `markAsSigned()`, que faz
-- `update contracts set status='ativo'` e IMEDIATAMENTE EM SEGUIDA conta
-- `deliveries` do contrato para mostrar "N entrega(s) geradas" - sem
-- nenhuma chamada de RPC entre as duas operações. Isso só é possível se a
-- geração for disparada por um trigger de banco, não por uma chamada
-- explícita do client. Documentado aqui em vez de inventado em silêncio.
-- =========================================================================

create or replace function public.trigger_contract_activated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Tratado em dois ramos (em vez de uma única condição com `tg_op = 'INSERT'
  -- or old.status is distinct from new.status`) para nunca depender de
  -- short-circuit de OR evitando acessar OLD num evento INSERT - em um
  -- trigger combinado "after insert or update", OLD não é atribuído durante
  -- INSERT, e referenciar OLD.status nesse caminho lançaria erro em
  -- PL/pgSQL ("record \"old\" is not assigned yet") se fosse avaliado.
  if tg_op = 'INSERT' then
    if new.status = 'ativo' then
      perform public.generate_contract_deliveries(new.id);
      perform public.generate_contract_installments(new.id);
    end if;
  elsif new.status = 'ativo' and old.status is distinct from new.status then
    perform public.generate_contract_deliveries(new.id);
    perform public.generate_contract_installments(new.id);
  end if;
  return new;
end;
$$;

comment on function public.trigger_contract_activated() is
  'Confiança média-alta para a parte de deliveries (comportamento confirmado em src/pages/dashboard/Contracts.tsx markAsSigned()); confiança média para também disparar generate_contract_installments no mesmo evento (inferência por simetria - nenhum código-fonte confirma isso tão diretamente quanto para deliveries, mas não há NENHUM outro caminho no app que crie parcelas, e faz sentido de produto gerar o cronograma de cobrança no mesmo momento em que o contrato é assinado). SECURITY INVOKER (default, sem SECURITY DEFINER): roda com os privilégios de quem atualizou o contrato, que já passou pela RLS de contracts para chegar até aqui.';

drop trigger if exists contracts_activated_generate on public.contracts;

create trigger contracts_activated_generate
  after insert or update of status on public.contracts
  for each row execute function public.trigger_contract_activated();

-- =========================================================================
-- sync_opportunity_stage: NENHUM call site encontrado (grep confirmado em
-- src/ e supabase/functions/) - todas as mudanças de estágio hoje são
-- `.update({ stage: ... })` direto em opportunities a partir do frontend
-- (OpportunityDrawer.tsx, Pipeline.tsx), e `opportunity_audit_logs` nunca é
-- escrita por ninguém no código atual, só lida (Pipeline.tsx,
-- OpportunityDrawer.tsx esperam `event_type='stage_changed'`). Reconstruída
-- para formalizar essa transição E produzir o audit log que a UI já lê mas
-- que hoje nunca é populado - gap de produto, documentado, não escondido.
-- =========================================================================

create or replace function public.sync_opportunity_stage(_opportunity_id uuid, _target public.opportunity_stage)
returns void
language plpgsql
set search_path = public
as $$
declare
  _old public.opportunity_stage;
  _org_id uuid;
begin
  select stage, organization_id into _old, _org_id
  from public.opportunities
  where id = _opportunity_id;

  if not found then
    raise exception 'sync_opportunity_stage: oportunidade % não encontrada', _opportunity_id;
  end if;

  if _old = _target then
    return;
  end if;

  update public.opportunities
  set stage = _target,
      last_stage_change_at = now(),
      updated_at = now()
  where id = _opportunity_id;

  insert into public.opportunity_audit_logs (organization_id, opportunity_id, actor_id, event_type, from_stage, to_stage)
  values (_org_id, _opportunity_id, auth.uid(), 'stage_changed', _old, _target);
end;
$$;

comment on function public.sync_opportunity_stage(uuid, public.opportunity_stage) is
  'Confiança média: GAP DE PRODUTO CONFIRMADO - nenhum call site usa esta RPC hoje; o frontend muda `opportunities.stage` via update direto e NUNCA insere em opportunity_audit_logs (grep confirmado), apesar de Pipeline.tsx e OpportunityDrawer.tsx já lerem esse log esperando `event_type=''stage_changed''`. Reconstruída para ser o caminho que preencheria esse log corretamente (schema de opportunity_audit_logs confirmado em 0003_tables.sql), caso o frontend passe a chamá-la em vez do update direto - decisão e gap documentados em SCHEMA_NOTES.md, não escondidos.';

-- =========================================================================
-- sync_opportunity_contact_to_sponsor: NENHUM call site encontrado. Copia um
-- contato registrado numa oportunidade (opportunity_contacts, "comitê de
-- decisão" - ver plano CRM Patrocinadores Fase 3) para o cadastro do
-- patrocinador (sponsor_contacts) assim que a oportunidade tiver sponsor_id.
-- =========================================================================

create or replace function public.sync_opportunity_contact_to_sponsor(_contact_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  _contact record;
begin
  select oc.id, oc.name, oc.role, oc.email, oc.phone, oc.is_primary, o.sponsor_id, o.organization_id
  into _contact
  from public.opportunity_contacts oc
  join public.opportunities o on o.id = oc.opportunity_id
  where oc.id = _contact_id;

  if not found then
    raise exception 'sync_opportunity_contact_to_sponsor: contato % não encontrado', _contact_id;
  end if;

  if _contact.sponsor_id is null then
    raise exception 'sync_opportunity_contact_to_sponsor: oportunidade do contato % ainda não tem patrocinador vinculado', _contact_id;
  end if;

  if exists (
    select 1 from public.sponsor_contacts sc
    where sc.sponsor_id = _contact.sponsor_id
      and (
        (sc.email is not null and _contact.email is not null and lower(sc.email) = lower(_contact.email))
        or (sc.email is null and _contact.email is null and lower(sc.name) = lower(_contact.name))
      )
  ) then
    return; -- idempotente: já existe um contato equivalente no patrocinador.
  end if;

  insert into public.sponsor_contacts (organization_id, sponsor_id, name, role, email, phone, is_primary)
  values (_contact.organization_id, _contact.sponsor_id, _contact.name, _contact.role, _contact.email, _contact.phone, _contact.is_primary);
end;
$$;

comment on function public.sync_opportunity_contact_to_sponsor(uuid) is
  'Confiança média-baixa: nenhum call site encontrado em src/ ou supabase/functions/. Reconstruída por inferência de nome/schema: opportunity_contacts (comitê de decisão de uma oportunidade) é logicamente o embrião de sponsor_contacts (comitê de decisão do patrocinador já fechado) - ver plano CRM Patrocinadores, Fase 3 ("Contatos (comitê de decisão)"). Dedup por e-mail (case-insensitive) ou, na ausência de e-mail em ambos os lados, por nome - para evitar duplicar o mesmo contato a cada chamada.';

-- =========================================================================
-- create_renewal_opportunity: call site confirmado em
-- src/pages/dashboard/SponsorDetail.tsx (`createRenewal`, chamada com
-- `_contract_id`, toast "Renovação criada... Uma nova negociação foi aberta
-- no pipeline"). Ver também plano CRM Patrocinadores Fase 5: "Renovação cria
-- nova oportunidade vinculada, sem alterar a original."
-- =========================================================================

create or replace function public.create_renewal_opportunity(_contract_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  _c record;
  _new_id uuid;
begin
  select id, organization_id, owner_id, sponsor_id, property_id, brand, total_value, contract_number, title
  into _c
  from public.contracts
  where id = _contract_id;

  if not found then
    raise exception 'create_renewal_opportunity: contrato % não encontrado', _contract_id;
  end if;

  insert into public.opportunities (organization_id, owner_id, sponsor_id, property_id, brand, stage, value, notes)
  values (
    _c.organization_id, coalesce(auth.uid(), _c.owner_id), _c.sponsor_id, _c.property_id, _c.brand,
    'prospect', coalesce(_c.total_value, 0),
    'Renovação do contrato ' || coalesce(_c.contract_number, _c.title)
  )
  returning id into _new_id;

  if _c.sponsor_id is not null then
    perform public.log_sponsor_interaction(
      _contract_id := _c.id,
      _delivery_id := null,
      _description := 'Nova oportunidade de renovação criada a partir deste contrato.',
      _installment_id := null,
      _metadata := json_build_object('opportunity_id', _new_id),
      _opportunity_id := _new_id,
      _owner_id := coalesce(auth.uid(), _c.owner_id),
      _proposal_id := null,
      _sponsor_id := _c.sponsor_id,
      _title := 'Renovação criada',
      _type := 'oportunidade'
    );
  end if;

  return _new_id;
end;
$$;

comment on function public.create_renewal_opportunity(uuid) is
  'Confiança alta: call site confirmado em src/pages/dashboard/SponsorDetail.tsx. Nova oportunidade entra sempre em stage=''prospect'' (consistente com "sem alterar a original" do plano - a oportunidade original do contrato não é tocada) copiando sponsor_id/property_id/brand/total_value do contrato. Registra adicionalmente uma sponsor_interactions via log_sponsor_interaction (type=''oportunidade'') quando há sponsor_id, para rastreabilidade no CRM - extensão razoável não pedida explicitamente, mas alinhada ao padrão de auditoria já usado em toda a Fase 1/5 do plano.';
