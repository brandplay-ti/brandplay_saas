-- 0033_organizacao_herdada_do_pai.sql
-- Linhas filhas ficam na organização do registro pai, não na "primeira
-- organização" de quem criou (isolamento entre organizações, ADR-0002).
--
-- O problema (reproduzido em 2026-10-23): um usuário dono das organizações A
-- e B cria um contrato ativo na B. O gatilho trg_contracts_generate_installments
-- chama generate_contract_installments (0015), que insere as parcelas SEM
-- organization_id. O gatilho set_org_id (tg_set_organization_id, 0016)
-- preenche então com get_user_org(owner_id), a organização ativa mais antiga
-- do usuário: A. Membros da A que não estão na B passam a ler, pela RLS,
-- valor, vencimento e contract_id de parcelas de um contrato da B. O mesmo
-- caminho afeta toda linha inserida sem organization_id numa tabela com
-- tg_set_organization_id ou tg_set_org_from_membership_default:
--
--   origem                                    tabela
--   generate_contract_installments (banco)    installments
--   ProposalVersionsEditor/ProposalWizard     proposal_versions
--   BrandTrackUploads/FieldEvidenceImport     brandtrack_events, brandtrack_media
--   score-leads (Edge Function, IA-17)        lead_scores
--   dados do Lovable                          contract_churn_risk,
--                                             sponsor_executive_summaries,
--                                             deliveries (geração antiga)
--   FieldDeliveryDetail                       delivery_attachments: aqui o
--     validate_parent_org recusava o insert ("Registro pai pertence a outra
--     organização"); não vazava, mas o anexo não subia.
--
-- generate_contract_deliveries já grava o organization_id do contrato (0015).
--
-- O que muda:
-- 1. generate_contract_installments grava o organization_id do contrato.
-- 2. tg_set_organization_id e tg_set_org_from_membership_default, quando
--    organization_id vem nulo, herdam a organização do registro pai
--    (organizacao_do_registro_pai). get_user_org fica só para a linha que não
--    referencia pai nenhum (sponsors, sports_properties, assets, ou um
--    contrato sem oportunidade/patrocinador/propriedade). Se a linha
--    referencia um pai sem organização, fica nula (invisível), como o pai.
--    organization_id enviado explicitamente continua valendo como veio.
--    opportunities não muda: set_default_pipeline_funnel e
--    validate_opportunity_org_access resolvem a organização antes.
-- 3. Correção dos dados: UPDATE das linhas filhas cuja organização difere da
--    do pai. Não apaga nada. deliveries e delivery_attachments NÃO são
--    movidas: os arquivos de evidência ficam em delivery-evidence/{org_id}/...
--    e a policy do bucket decide pelo prefixo; mover a linha sem mover o
--    arquivo tiraria o acesso de quem deve ver e o deixaria com quem não deve.
--    A migration só conta as divergências (NOTICE); o procedimento está em
--    SCHEMA_NOTES.md.

-- ─── 1. Parcelas com a organização do contrato ──────────────────────────
-- Igual à 0015, só acrescenta organization_id aos dois inserts.
CREATE OR REPLACE FUNCTION public.generate_contract_installments(_contract_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record;
  i integer;
  n_installments integer;
  base_date date;
  due_d integer;
  next_due date;
  per_value numeric;
  months_span integer;
  step_months integer;
  step_days integer;
  dates date[];
begin
  select * into c from public.contracts where id = _contract_id;
  if not found then return; end if;

  delete from public.installments where contract_id = _contract_id and status <> 'pago';

  base_date := coalesce(c.start_date, current_date);
  if c.due_days is not null and c.due_days > 0 then
    base_date := base_date + (c.due_days || ' day')::interval;
  end if;
  due_d := coalesce(c.due_day, extract(day from base_date)::int);

  dates := coalesce(c.custom_due_dates, '{}'::date[]);

  -- Datas manuais têm prioridade
  if array_length(dates, 1) is not null and array_length(dates, 1) > 0 then
    n_installments := array_length(dates, 1);
    per_value := round(c.total_value / n_installments, 2);
    for i in 1..n_installments loop
      insert into public.installments (
        organization_id, contract_id, owner_id, installment_number, total_installments,
        amount, due_date, payment_method, status
      ) values (
        c.organization_id, c.id, c.owner_id, i, n_installments,
        per_value, dates[i], c.payment_method,
        case when dates[i] < current_date then 'atrasado'::installment_status else 'pendente'::installment_status end
      );
    end loop;
    return;
  end if;

  step_months := 1;
  step_days := 0;

  if c.payment_method = 'a_vista' then
    n_installments := 1;
    per_value := c.total_value;
  elsif c.payment_method = 'parcelado' then
    n_installments := greatest(c.installments, 1);
    per_value := round(c.total_value / n_installments, 2);
  elsif c.payment_method in ('mensal','bimestral','trimestral','semestral','anual') then
    step_months := case c.payment_method
      when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3
      when 'semestral' then 6 else 12 end;
    if c.end_date is not null then
      months_span := greatest(
        (extract(year from c.end_date)::int - extract(year from base_date)::int) * 12
        + (extract(month from c.end_date)::int - extract(month from base_date)::int) + 1,
        1
      );
      n_installments := greatest(ceil(months_span::numeric / step_months)::int, 1);
    else
      n_installments := greatest(c.installments, 1);
    end if;
    per_value := round(c.total_value / n_installments, 2);
  elsif c.payment_method = 'quinzenal' then
    step_days := 15;
    n_installments := greatest(c.installments, 1);
    if c.end_date is not null then
      n_installments := greatest(((c.end_date - base_date) / 15) + 1, 1);
    end if;
    per_value := round(c.total_value / n_installments, 2);
  else
    n_installments := 1;
    per_value := c.total_value;
  end if;

  for i in 1..n_installments loop
    if c.payment_method = 'a_vista' then
      next_due := base_date;
    elsif step_days > 0 then
      next_due := base_date + ((i - 1) * step_days || ' day')::interval;
    else
      next_due := (date_trunc('month', base_date) + (((i - 1) * step_months) || ' month')::interval)::date;
      next_due := least(
        (next_due + ((due_d - 1) || ' day')::interval)::date,
        (date_trunc('month', next_due) + interval '1 month - 1 day')::date
      );
    end if;

    insert into public.installments (
      organization_id, contract_id, owner_id, installment_number, total_installments,
      amount, due_date, payment_method, status
    ) values (
      c.organization_id, c.id, c.owner_id, i, n_installments,
      per_value, next_due, c.payment_method,
      case when next_due < current_date then 'atrasado'::installment_status else 'pendente'::installment_status end
    );
  end loop;
end;
$function$;
revoke all on function public.generate_contract_installments(_contract_id uuid) from public, anon, authenticated;
grant execute on function public.generate_contract_installments(_contract_id uuid) to service_role;

-- ─── 2. Organização herdada do registro pai ─────────────────────────────
-- Recebe a linha como jsonb para servir a qualquer tabela; coluna ausente vira
-- nulo. Em tabela com mais de um pai, vale o mais específico. tem_pai indica
-- se a linha referencia algum pai (mesmo que ele não tenha organização).
create or replace function public.organizacao_do_registro_pai(
  _tabela text,
  _linha jsonb,
  out organizacao uuid,
  out tem_pai boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  _contrato     uuid := (_linha->>'contract_id')::uuid;
  _oportunidade uuid := (_linha->>'opportunity_id')::uuid;
  _patrocinador uuid := (_linha->>'sponsor_id')::uuid;
  _propriedade  uuid := (_linha->>'property_id')::uuid;
begin
  case _tabela
    when 'installments', 'contract_churn_risk' then
      tem_pai := _contrato is not null;
      organizacao := (select organization_id from public.contracts where id = _contrato);

    when 'deliveries' then
      tem_pai := coalesce(_contrato, _oportunidade, _patrocinador, _propriedade) is not null;
      organizacao := coalesce(
        (select organization_id from public.contracts where id = _contrato),
        (select organization_id from public.opportunities where id = _oportunidade),
        (select organization_id from public.sponsors where id = _patrocinador),
        (select organization_id from public.sports_properties where id = _propriedade));

    when 'contracts' then
      tem_pai := coalesce(_oportunidade, _patrocinador, _propriedade) is not null;
      organizacao := coalesce(
        (select organization_id from public.opportunities where id = _oportunidade),
        (select organization_id from public.sponsors where id = _patrocinador),
        (select organization_id from public.sports_properties where id = _propriedade));

    when 'proposals' then
      tem_pai := coalesce(_patrocinador, _propriedade) is not null;
      organizacao := coalesce(
        (select organization_id from public.sponsors where id = _patrocinador),
        (select organization_id from public.sports_properties where id = _propriedade));

    when 'proposal_versions' then
      tem_pai := _linha->>'proposal_id' is not null;
      organizacao := (select organization_id from public.proposals
                       where id = (_linha->>'proposal_id')::uuid);

    when 'delivery_attachments' then
      tem_pai := _linha->>'delivery_id' is not null;
      organizacao := (select organization_id from public.deliveries
                       where id = (_linha->>'delivery_id')::uuid);

    when 'sponsorship_tiers', 'brandtrack_events' then
      tem_pai := _propriedade is not null;
      organizacao := (select organization_id from public.sports_properties where id = _propriedade);

    when 'brandtrack_media', 'brandtrack_event_brands' then
      tem_pai := _linha->>'event_id' is not null;
      organizacao := (select organization_id from public.brandtrack_events
                       where id = (_linha->>'event_id')::uuid);

    when 'brandtrack_detections' then
      tem_pai := _linha->>'media_id' is not null;
      organizacao := (select organization_id from public.brandtrack_media
                       where id = (_linha->>'media_id')::uuid);

    when 'brandtrack_brands', 'sponsor_executive_summaries' then
      tem_pai := _patrocinador is not null;
      organizacao := (select organization_id from public.sponsors where id = _patrocinador);

    when 'lead_scores' then
      -- target_id não é FK: aponta para sponsors ou opportunities conforme
      -- target_type (score-leads).
      tem_pai := _linha->>'target_id' is not null or _propriedade is not null;
      organizacao := coalesce(
        case _linha->>'target_type'
          when 'sponsor' then (select organization_id from public.sponsors
                                where id = (_linha->>'target_id')::uuid)
          when 'opportunity' then (select organization_id from public.opportunities
                                    where id = (_linha->>'target_id')::uuid)
        end,
        (select organization_id from public.sports_properties where id = _propriedade));

    when 'sellout_reports' then
      tem_pai := coalesce(_propriedade, (_linha->>'event_id')::uuid) is not null;
      organizacao := coalesce(
        (select organization_id from public.sports_properties where id = _propriedade),
        (select organization_id from public.property_events where id = (_linha->>'event_id')::uuid));

    else
      tem_pai := false;
  end case;
end;
$function$;
revoke all on function public.organizacao_do_registro_pai(text, jsonb) from public, anon, authenticated;
grant execute on function public.organizacao_do_registro_pai(text, jsonb) to service_role;

comment on function public.organizacao_do_registro_pai(text, jsonb) is
  'Organização do registro pai de uma linha (0033). Usada pelos gatilhos que preenchem organization_id nulo; get_user_org só quando tem_pai = false.';

CREATE OR REPLACE FUNCTION public.tg_set_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pai record;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _pai FROM public.organizacao_do_registro_pai(TG_TABLE_NAME, to_jsonb(NEW));
  IF _pai.tem_pai THEN
    NEW.organization_id := _pai.organizacao;
  ELSIF NEW.owner_id IS NOT NULL THEN
    NEW.organization_id := public.get_user_org(NEW.owner_id);
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_set_organization_id() from public, anon, authenticated;
grant execute on function public.tg_set_organization_id() to service_role;

CREATE OR REPLACE FUNCTION public.tg_set_org_from_membership_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pai record;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _pai FROM public.organizacao_do_registro_pai(TG_TABLE_NAME, to_jsonb(NEW));
  IF _pai.tem_pai THEN
    NEW.organization_id := _pai.organizacao;
  ELSE
    NEW.organization_id := public.get_user_org(COALESCE(NEW.owner_id, auth.uid()));
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_set_org_from_membership_default() from public, anon, authenticated;
grant execute on function public.tg_set_org_from_membership_default() to service_role;

-- ─── 3. Correção dos dados existentes ───────────────────────────────────
-- Só linhas cuja organização difere da do pai (inclusive nula). Pai sem
-- organização não move nada. A ordem importa no BrandTrack: evento, depois
-- mídia e marcas do evento, depois detecções da mídia.
do $$
declare
  n bigint;
begin
  update public.installments f set organization_id = p.organization_id
    from public.contracts p
   where p.id = f.contract_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: installments corrigidas: %', n;

  update public.contract_churn_risk f set organization_id = p.organization_id
    from public.contracts p
   where p.id = f.contract_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: contract_churn_risk corrigidos: %', n;

  update public.proposal_versions f set organization_id = p.organization_id
    from public.proposals p
   where p.id = f.proposal_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: proposal_versions corrigidas: %', n;

  update public.sponsor_executive_summaries f set organization_id = p.organization_id
    from public.sponsors p
   where p.id = f.sponsor_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: sponsor_executive_summaries corrigidos: %', n;

  update public.lead_scores f set organization_id = p.organization_id
    from public.sponsors p
   where f.target_type = 'sponsor' and p.id = f.target_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: lead_scores (patrocinador) corrigidos: %', n;

  update public.lead_scores f set organization_id = p.organization_id
    from public.opportunities p
   where f.target_type = 'opportunity' and p.id = f.target_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: lead_scores (oportunidade) corrigidos: %', n;

  update public.brandtrack_events f set organization_id = p.organization_id
    from public.sports_properties p
   where p.id = f.property_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: brandtrack_events corrigidos: %', n;

  update public.brandtrack_media f set organization_id = p.organization_id
    from public.brandtrack_events p
   where p.id = f.event_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: brandtrack_media corrigidas: %', n;

  update public.brandtrack_event_brands f set organization_id = p.organization_id
    from public.brandtrack_events p
   where p.id = f.event_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: brandtrack_event_brands corrigidas: %', n;

  update public.brandtrack_detections f set organization_id = p.organization_id
    from public.brandtrack_media p
   where p.id = f.media_id and p.organization_id is not null
     and f.organization_id is distinct from p.organization_id;
  get diagnostics n = row_count;
  raise notice '0033: brandtrack_detections corrigidas: %', n;

  -- Só diagnóstico (ver cabeçalho e SCHEMA_NOTES.md).
  select count(*) into n
    from public.deliveries d
    left join public.contracts c on c.id = d.contract_id
    left join public.opportunities o on o.id = d.opportunity_id
   where coalesce(c.organization_id, o.organization_id) is not null
     and d.organization_id is distinct from coalesce(c.organization_id, o.organization_id);
  raise notice '0033: deliveries em organização diferente da do contrato/oportunidade (NÃO corrigidas): %', n;

  select count(*) into n
    from public.delivery_attachments a
    join public.deliveries d on d.id = a.delivery_id
   where a.organization_id is distinct from d.organization_id;
  raise notice '0033: delivery_attachments em organização diferente da entrega (NÃO corrigidos): %', n;
end $$;
