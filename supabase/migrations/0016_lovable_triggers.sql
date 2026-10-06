-- 0016_lovable_triggers.sql
-- Porta as 47 funções de trigger e os triggers reais do Lovable que faltavam
-- na reconstrução (o types.ts não expõe triggers). Categorias:
--
--   * preenchimento de organization_id a partir do pai ou do usuário (o
--     frontend NÃO envia organization_id em ~37 inserts; sem estes triggers a
--     RLS rejeita o insert, ou a linha fica com organization_id nulo e
--     invisível, ex.: lead do media kit público);
--   * updated_at;
--   * automações de negócio (contrato ativo gera parcelas e entregas,
--     sincronismo de estágio da oportunidade, ciclo de vida do patrocinador,
--     efeitos de tarefas de CRM, lead -> oportunidade, oportunidade ganha);
--   * validação de organização do registro pai (isolamento entre tenants);
--   * log de interações do patrocinador, auditoria, numeração de proposta,
--     funil padrão, menções, validações de perda e de lead.
--
-- ATENÇÃO (comportamento herdado do Lovable): quando organization_id vem nulo,
-- vários triggers usam get_user_org(), que devolve a organização ATIVA MAIS
-- ANTIGA do usuário, não a selecionada na UI. Para usuários em mais de uma
-- organização o registro pode cair na organização errada (sempre uma da qual
-- o usuário é membro). Correção definitiva: o frontend enviar o
-- organization_id ativo nesses inserts (os triggers só preenchem se nulo).
--
-- Substitui o trigger da reconstrução contracts_activated_generate (0010),
-- coberto pelos triggers reais trg_contracts_generate_installments/deliveries;
-- manter os dois geraria parcelas e entregas em dobro.
--
-- Funções de trigger não ficam executáveis por anon/authenticated (o disparo
-- de trigger não exige EXECUTE).

drop trigger if exists contracts_activated_generate on public.contracts;
drop function if exists public.trigger_contract_activated();

-- enforce_delivery_attachment_limit
CREATE OR REPLACE FUNCTION public.enforce_delivery_attachment_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _count int;
BEGIN
  SELECT count(*) INTO _count FROM public.delivery_attachments WHERE delivery_id = NEW.delivery_id;
  IF _count >= 10 THEN
    RAISE EXCEPTION 'Limite de 10 anexos por entrega atingido';
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.enforce_delivery_attachment_limit() from public, anon, authenticated;
grant execute on function public.enforce_delivery_attachment_limit() to service_role;

-- handle_checklist_completion
CREATE OR REPLACE FUNCTION public.handle_checklist_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'concluido' AND (OLD.status IS DISTINCT FROM 'concluido') THEN
    NEW.completed_at := now();
    IF NEW.delivery_id IS NOT NULL THEN
      UPDATE public.deliveries
        SET status = 'entregue'::delivery_status,
            delivered_at = COALESCE(delivered_at, current_date)
        WHERE id = NEW.delivery_id;
    END IF;
  ELSIF NEW.status <> 'concluido' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.handle_checklist_completion() from public, anon, authenticated;
grant execute on function public.handle_checklist_completion() to service_role;

-- handle_contract_deliveries
CREATE OR REPLACE FUNCTION public.handle_contract_deliveries()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT' and new.status = 'ativo') then
    perform public.generate_contract_deliveries(new.id);
  elsif (tg_op = 'UPDATE' and new.status = 'ativo' and old.status <> 'ativo') then
    perform public.generate_contract_deliveries(new.id);
  end if;
  return new;
end;
$function$;
revoke all on function public.handle_contract_deliveries() from public, anon, authenticated;
grant execute on function public.handle_contract_deliveries() to service_role;

-- handle_contract_installments
CREATE OR REPLACE FUNCTION public.handle_contract_installments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT' and new.status = 'ativo') then
    perform public.generate_contract_installments(new.id);
  elsif (tg_op = 'UPDATE') then
    if (new.status = 'ativo' and old.status <> 'ativo') then
      perform public.generate_contract_installments(new.id);
    elsif (new.status = 'ativo' and (
      new.total_value <> old.total_value
      or new.installments <> old.installments
      or new.payment_method <> old.payment_method
      or coalesce(new.start_date, '1900-01-01') <> coalesce(old.start_date, '1900-01-01')
      or coalesce(new.end_date, '1900-01-01') <> coalesce(old.end_date, '1900-01-01')
      or coalesce(new.due_day, -1) <> coalesce(old.due_day, -1)
    )) then
      perform public.generate_contract_installments(new.id);
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.handle_contract_installments() from public, anon, authenticated;
grant execute on function public.handle_contract_installments() to service_role;

-- handle_lead_to_opportunity
CREATE OR REPLACE FUNCTION public.handle_lead_to_opportunity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _value numeric := 0;
  _opp_id uuid;
  _brand text;
BEGIN
  IF NEW.tier_id IS NOT NULL THEN
    SELECT value INTO _value FROM public.sponsorship_tiers WHERE id = NEW.tier_id;
  END IF;

  _brand := COALESCE(NULLIF(NEW.company, ''), NEW.contact_name);

  INSERT INTO public.opportunities (owner_id, brand, value, stage, property_id, notes)
  VALUES (
    NEW.owner_id,
    _brand,
    COALESCE(_value, 0),
    'prospect'::opportunity_stage,
    NEW.property_id,
    'Lead recebido via media kit público.' || E'\n' ||
    'Contato: ' || NEW.contact_name || E'\n' ||
    'Email: ' || NEW.email || E'\n' ||
    COALESCE('Telefone: ' || NEW.phone || E'\n', '') ||
    COALESCE('Mensagem: ' || NEW.message, '')
  )
  RETURNING id INTO _opp_id;

  NEW.created_opportunity_id := _opp_id;
  RETURN NEW;
END;
$function$;
revoke all on function public.handle_lead_to_opportunity() from public, anon, authenticated;
grant execute on function public.handle_lead_to_opportunity() to service_role;

-- handle_new_organization
CREATE OR REPLACE FUNCTION public.handle_new_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_id, 'owner', 'ativo')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;
revoke all on function public.handle_new_organization() from public, anon, authenticated;
grant execute on function public.handle_new_organization() to service_role;

-- handle_opportunity_stage_change
CREATE OR REPLACE FUNCTION public.handle_opportunity_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.last_stage_change_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.handle_opportunity_stage_change() from public, anon, authenticated;
grant execute on function public.handle_opportunity_stage_change() to service_role;

-- handle_opportunity_won
CREATE OR REPLACE FUNCTION public.handle_opportunity_won()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  exists_count integer;
BEGIN
  IF NEW.stage = 'fechado'::opportunity_stage
     AND (TG_OP = 'INSERT' OR OLD.stage IS DISTINCT FROM 'fechado'::opportunity_stage)
     AND NEW.tier_id IS NOT NULL THEN
    SELECT count(*) INTO exists_count
      FROM public.tier_sales
      WHERE tier_id = NEW.tier_id
        AND owner_id = NEW.owner_id
        AND brand = NEW.brand
        AND status <> 'cancelada';
    IF exists_count = 0 THEN
      INSERT INTO public.tier_sales (tier_id, owner_id, sponsor_id, brand, status, notes)
      VALUES (NEW.tier_id, NEW.owner_id, NEW.sponsor_id, NEW.brand, 'vendida',
              'Gerado automaticamente ao fechar oportunidade.');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.handle_opportunity_won() from public, anon, authenticated;
grant execute on function public.handle_opportunity_won() to service_role;

-- notify_commercial_team_opportunity_lost
CREATE OR REPLACE FUNCTION public.notify_commercial_team_opportunity_lost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _reason text;
  _lost_value numeric;
  _description text;
  _dedupe_key text;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR NEW.stage IS DISTINCT FROM 'perdido'::opportunity_stage
     OR OLD.stage IS NOT DISTINCT FROM 'perdido'::opportunity_stage THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  _reason := COALESCE(NULLIF(btrim(NEW.lost_reason), ''), 'Motivo não informado');
  _lost_value := COALESCE(NEW.lost_value, NEW.value, 0);
  _description := 'Motivo: ' || _reason || ' · Valor perdido: R$ ' || trim(to_char(_lost_value, 'FM999G999G999G990D00'));
  _dedupe_key := 'opportunity_lost:' || NEW.id::text;

  INSERT INTO public.notifications (
    user_id,
    organization_id,
    category,
    priority,
    title,
    description,
    action_url,
    related_entity_type,
    related_entity_id,
    metadata,
    dedupe_key
  )
  SELECT
    om.user_id,
    NEW.organization_id,
    'opportunity_lost',
    'alta',
    'Oportunidade perdida: ' || NEW.brand,
    _description,
    '/dashboard/pipeline',
    'opportunity',
    NEW.id,
    jsonb_build_object(
      'brand', NEW.brand,
      'lost_reason', _reason,
      'lost_comment', NEW.lost_comment,
      'lost_competitor', NEW.lost_competitor,
      'lost_value', _lost_value,
      'previous_stage', OLD.stage,
      'current_stage', NEW.stage
    ),
    _dedupe_key
  FROM public.organization_members om
  WHERE om.organization_id = NEW.organization_id
    AND om.status = 'ativo'
    AND om.role IN ('owner'::org_role, 'admin'::org_role, 'comercial'::org_role)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = om.user_id
        AND n.dedupe_key = _dedupe_key
    );

  RETURN NEW;
END;
$function$;
revoke all on function public.notify_commercial_team_opportunity_lost() from public, anon, authenticated;
grant execute on function public.notify_commercial_team_opportunity_lost() to service_role;

-- notify_opportunity_comment_mentions
CREATE OR REPLACE FUNCTION public.notify_opportunity_comment_mentions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _mentioned_user uuid;
  _brand text;
  _author_name text;
  _excerpt text;
  _new_mentions uuid[];
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(m), '{}') INTO _new_mentions
    FROM unnest(NEW.mentions) AS m
    WHERE NOT (m = ANY(COALESCE(OLD.mentions, '{}')));
  ELSE
    _new_mentions := NEW.mentions;
  END IF;

  IF _new_mentions IS NULL OR array_length(_new_mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.brand INTO _brand
  FROM public.opportunities o
  WHERE o.id = NEW.opportunity_id
  LIMIT 1;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(p.company), ''), 'Alguém') INTO _author_name
  FROM public.profiles p
  WHERE p.id = NEW.author_id
  LIMIT 1;

  _excerpt := left(regexp_replace(NEW.content, '\s+', ' ', 'g'), 180);

  FOREACH _mentioned_user IN ARRAY _new_mentions LOOP
    INSERT INTO public.notifications (
      user_id,
      organization_id,
      category,
      priority,
      title,
      description,
      action_url,
      related_entity_type,
      related_entity_id,
      metadata,
      dedupe_key
    )
    SELECT
      _mentioned_user,
      NEW.organization_id,
      'opportunity_mention',
      'alta',
      'Você foi mencionado em uma oportunidade',
      COALESCE(_author_name, 'Alguém') || ' mencionou você em ' || COALESCE(_brand, 'uma oportunidade') || ': ' || _excerpt,
      '/dashboard/pipeline',
      'opportunity_comment',
      NEW.id,
      jsonb_build_object(
        'opportunity_id', NEW.opportunity_id,
        'opportunity_brand', _brand,
        'comment_id', NEW.id,
        'author_id', NEW.author_id,
        'comment_kind', NEW.kind,
        'excerpt', _excerpt
      ),
      'opportunity_mention:' || NEW.id::text || ':' || _mentioned_user::text
    WHERE EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = NEW.organization_id
        AND om.user_id = _mentioned_user
        AND om.status = 'ativo'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = _mentioned_user
        AND n.dedupe_key = 'opportunity_mention:' || NEW.id::text || ':' || _mentioned_user::text
    );
  END LOOP;

  RETURN NEW;
END;
$function$;
revoke all on function public.notify_opportunity_comment_mentions() from public, anon, authenticated;
grant execute on function public.notify_opportunity_comment_mentions() to service_role;

-- set_org_from_property
CREATE OR REPLACE FUNCTION public.set_org_from_property()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.sports_properties
    WHERE id = NEW.property_id;
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.set_org_from_property() from public, anon, authenticated;
grant execute on function public.set_org_from_property() to service_role;

-- set_org_from_proposal
CREATE OR REPLACE FUNCTION public.set_org_from_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.proposals
    WHERE id = NEW.proposal_id;
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.set_org_from_proposal() from public, anon, authenticated;
grant execute on function public.set_org_from_proposal() to service_role;

-- set_org_from_sponsor
CREATE OR REPLACE FUNCTION public.set_org_from_sponsor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.sponsors
    WHERE id = NEW.sponsor_id;
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.set_org_from_sponsor() from public, anon, authenticated;
grant execute on function public.set_org_from_sponsor() to service_role;

-- set_org_from_tier
CREATE OR REPLACE FUNCTION public.set_org_from_tier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.sponsorship_tiers
    WHERE id = NEW.tier_id;
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.set_org_from_tier() from public, anon, authenticated;
grant execute on function public.set_org_from_tier() to service_role;

-- set_org_from_user_membership
CREATE OR REPLACE FUNCTION public.set_org_from_user_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.organization_members
    WHERE user_id = NEW.user_id AND status = 'ativo'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.set_org_from_user_membership() from public, anon, authenticated;
grant execute on function public.set_org_from_user_membership() to service_role;

-- tg_contract_interaction
CREATE OR REPLACE FUNCTION public.tg_contract_interaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _title text;
BEGIN
  IF NEW.sponsor_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    _title := 'Contrato criado: ' || NEW.title;
    PERFORM public.log_sponsor_interaction(
      NEW.sponsor_id, NEW.owner_id, 'contrato'::sponsor_interaction_type,
      _title, 'Status: ' || NEW.status::text || ' \u2014 Valor: R$ ' || NEW.total_value::text,
      jsonb_build_object('status', NEW.status, 'total_value', NEW.total_value),
      NEW.opportunity_id, NEW.id, NULL, NULL, NULL
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    _title := 'Contrato ' || NEW.status::text || ': ' || NEW.title;
    PERFORM public.log_sponsor_interaction(
      NEW.sponsor_id, NEW.owner_id, 'contrato'::sponsor_interaction_type,
      _title, 'Mudou de ' || OLD.status::text || ' para ' || NEW.status::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      NEW.opportunity_id, NEW.id, NULL, NULL, NULL
    );
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_contract_interaction() from public, anon, authenticated;
grant execute on function public.tg_contract_interaction() to service_role;

-- tg_contract_sync_opportunity_stage
CREATE OR REPLACE FUNCTION public.tg_contract_sync_opportunity_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.opportunity_id IS NOT NULL THEN
    PERFORM public.sync_opportunity_stage(NEW.opportunity_id, 'fechado');
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_contract_sync_opportunity_stage() from public, anon, authenticated;
grant execute on function public.tg_contract_sync_opportunity_stage() to service_role;

-- tg_contract_sync_sponsor_lifecycle
CREATE OR REPLACE FUNCTION public.tg_contract_sync_sponsor_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _sponsor uuid := COALESCE(NEW.sponsor_id, OLD.sponsor_id); _active int;
BEGIN
  IF _sponsor IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO _active FROM public.contracts
   WHERE sponsor_id = _sponsor AND status = 'ativo';

  IF _active > 0 THEN
    UPDATE public.sponsors SET lifecycle = 'cliente_ativo'
     WHERE id = _sponsor AND archived_at IS NULL AND lifecycle <> 'cliente_ativo';
  ELSE
    UPDATE public.sponsors SET lifecycle = 'cliente_inativo'
     WHERE id = _sponsor AND archived_at IS NULL AND lifecycle = 'cliente_ativo';
  END IF;

  RETURN NULL;
END $function$;
revoke all on function public.tg_contract_sync_sponsor_lifecycle() from public, anon, authenticated;
grant execute on function public.tg_contract_sync_sponsor_lifecycle() to service_role;

-- tg_crm_task_effects
CREATE OR REPLACE FUNCTION public.tg_crm_task_effects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _next record; _sponsor uuid := COALESCE(NEW.sponsor_id, OLD.sponsor_id);
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'concluida' AND OLD.status IS DISTINCT FROM 'concluida' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
    INSERT INTO public.sponsor_interactions (
      sponsor_id, organization_id, owner_id, type, source, title, description, occurred_at,
      related_opportunity_id, created_by, metadata
    ) VALUES (
      NEW.sponsor_id, NEW.organization_id, COALESCE(NEW.assignee_id, NEW.created_by, auth.uid()),
      'nota'::sponsor_interaction_type, 'auto'::sponsor_interaction_source,
      'Tarefa concluída: ' || NEW.title, NEW.completion_notes, now(),
      NEW.opportunity_id, auth.uid(), jsonb_build_object('task_id', NEW.id, 'task_type', NEW.task_type)
    );
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_crm_task_effects() from public, anon, authenticated;
grant execute on function public.tg_crm_task_effects() to service_role;

-- tg_crm_task_sync_next_action
CREATE OR REPLACE FUNCTION public.tg_crm_task_sync_next_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _sponsor uuid := COALESCE(NEW.sponsor_id, OLD.sponsor_id); _t record;
BEGIN
  SELECT title, due_date INTO _t
    FROM public.crm_tasks
   WHERE sponsor_id = _sponsor AND status = 'aberta'
   ORDER BY due_date NULLS LAST, created_at
   LIMIT 1;

  UPDATE public.sponsors
     SET next_action = _t.title,
         next_action_at = CASE WHEN _t.due_date IS NULL THEN NULL ELSE _t.due_date::timestamptz END
   WHERE id = _sponsor;
  RETURN NULL;
END $function$;
revoke all on function public.tg_crm_task_sync_next_action() from public, anon, authenticated;
grant execute on function public.tg_crm_task_sync_next_action() to service_role;

-- tg_delivery_interaction
CREATE OR REPLACE FUNCTION public.tg_delivery_interaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _sponsor uuid; _title text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.approval IS DISTINCT FROM OLD.approval THEN
    SELECT c.sponsor_id INTO _sponsor
      FROM public.contracts c
     WHERE (c.opportunity_id = NEW.opportunity_id OR c.brand = NEW.brand)
       AND c.sponsor_id IS NOT NULL
     LIMIT 1;
    IF _sponsor IS NULL THEN RETURN NEW; END IF;

    _title := 'Entrega ' || NEW.approval::text || ': ' || NEW.title;
    PERFORM public.log_sponsor_interaction(
      _sponsor, NEW.owner_id, 'entrega'::sponsor_interaction_type,
      _title, COALESCE(NEW.approval_comment, NEW.description),
      jsonb_build_object('from', OLD.approval, 'to', NEW.approval),
      NEW.opportunity_id, NULL, NULL, NEW.id, NULL
    );
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_delivery_interaction() from public, anon, authenticated;
grant execute on function public.tg_delivery_interaction() to service_role;

-- tg_delivery_sync_opportunity_stage
CREATE OR REPLACE FUNCTION public.tg_delivery_sync_opportunity_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.opportunity_id IS NOT NULL THEN
    PERFORM public.sync_opportunity_stage(NEW.opportunity_id, 'fechado');
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_delivery_sync_opportunity_stage() from public, anon, authenticated;
grant execute on function public.tg_delivery_sync_opportunity_stage() to service_role;

-- tg_installment_interaction
CREATE OR REPLACE FUNCTION public.tg_installment_interaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _sponsor uuid; _title text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('pago'::installment_status, 'atrasado'::installment_status) THEN
    SELECT c.sponsor_id INTO _sponsor FROM public.contracts c
     WHERE c.id = NEW.contract_id AND c.sponsor_id IS NOT NULL;
    IF _sponsor IS NULL THEN RETURN NEW; END IF;

    _title := 'Parcela ' || NEW.installment_number::text || '/' || NEW.total_installments::text
              || ' \u2014 ' || NEW.status::text;
    PERFORM public.log_sponsor_interaction(
      _sponsor, NEW.owner_id, 'parcela'::sponsor_interaction_type,
      _title, 'Valor: R$ ' || NEW.amount::text || ' \u2014 Vencimento: ' || NEW.due_date::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'amount', NEW.amount),
      NULL, NEW.contract_id, NULL, NULL, NEW.id
    );
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_installment_interaction() from public, anon, authenticated;
grant execute on function public.tg_installment_interaction() to service_role;

-- tg_opportunity_audit_log
CREATE OR REPLACE FUNCTION public.tg_opportunity_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.opportunity_audit_logs (
      opportunity_id, organization_id, actor_id, event_type, to_stage, new_value, metadata
    ) VALUES (
      NEW.id, NEW.organization_id, COALESCE(_actor, NEW.owner_id), 'created', NEW.stage, NEW.value,
      jsonb_build_object('brand', NEW.brand)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.opportunity_audit_logs (
      opportunity_id, organization_id, actor_id, event_type, from_stage, to_stage, old_value, new_value, metadata
    ) VALUES (
      NEW.id, NEW.organization_id, COALESCE(_actor, NEW.owner_id), 'stage_changed', OLD.stage, NEW.stage, OLD.value, NEW.value,
      jsonb_build_object('brand', NEW.brand)
    );
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.value IS DISTINCT FROM OLD.value THEN
    INSERT INTO public.opportunity_audit_logs (
      opportunity_id, organization_id, actor_id, event_type, old_value, new_value, metadata
    ) VALUES (
      NEW.id, NEW.organization_id, COALESCE(_actor, NEW.owner_id), 'value_changed', OLD.value, NEW.value,
      jsonb_build_object('brand', NEW.brand, 'stage', NEW.stage)
    );
  END IF;

  RETURN NEW;
END;
$function$;
revoke all on function public.tg_opportunity_audit_log() from public, anon, authenticated;
grant execute on function public.tg_opportunity_audit_log() to service_role;

-- tg_opportunity_contact_sync
CREATE OR REPLACE FUNCTION public.tg_opportunity_contact_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_opportunity_contact_to_sponsor(NEW.id);
  RETURN NULL;
END $function$;
revoke all on function public.tg_opportunity_contact_sync() from public, anon, authenticated;
grant execute on function public.tg_opportunity_contact_sync() to service_role;

-- tg_opportunity_interaction
CREATE OR REPLACE FUNCTION public.tg_opportunity_interaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _title text; _desc text;
BEGIN
  IF NEW.sponsor_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    _title := 'Oportunidade criada: ' || NEW.brand;
    _desc  := 'Etapa inicial: ' || NEW.stage::text;
    PERFORM public.log_sponsor_interaction(
      NEW.sponsor_id, NEW.owner_id, 'oportunidade'::sponsor_interaction_type,
      _title, _desc, jsonb_build_object('stage', NEW.stage, 'value', NEW.value),
      NEW.id, NULL, NULL, NULL, NULL
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    _title := 'Oportunidade movida para ' || NEW.stage::text;
    _desc  := 'De ' || OLD.stage::text || ' para ' || NEW.stage::text;
    PERFORM public.log_sponsor_interaction(
      NEW.sponsor_id, NEW.owner_id, 'oportunidade'::sponsor_interaction_type,
      _title, _desc, jsonb_build_object('from', OLD.stage, 'to', NEW.stage),
      NEW.id, NULL, NULL, NULL, NULL
    );
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_opportunity_interaction() from public, anon, authenticated;
grant execute on function public.tg_opportunity_interaction() to service_role;

-- tg_opportunity_sponsor_sync_contacts
CREATE OR REPLACE FUNCTION public.tg_opportunity_sponsor_sync_contacts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _c record;
BEGIN
  IF NEW.sponsor_id IS NOT NULL AND NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id THEN
    FOR _c IN SELECT id FROM public.opportunity_contacts WHERE opportunity_id = NEW.id LOOP
      PERFORM public.sync_opportunity_contact_to_sponsor(_c.id);
    END LOOP;
  END IF;
  RETURN NULL;
END $function$;
revoke all on function public.tg_opportunity_sponsor_sync_contacts() from public, anon, authenticated;
grant execute on function public.tg_opportunity_sponsor_sync_contacts() to service_role;

-- tg_proposal_interaction
CREATE OR REPLACE FUNCTION public.tg_proposal_interaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _title text;
BEGIN
  IF NEW.sponsor_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    _title := 'Proposta criada: ' || NEW.title;
    PERFORM public.log_sponsor_interaction(
      NEW.sponsor_id, NEW.owner_id, 'proposta'::sponsor_interaction_type,
      _title, 'Status inicial: ' || NEW.status::text,
      jsonb_build_object('status', NEW.status, 'total_value', NEW.total_value),
      NULL, NULL, NEW.id, NULL, NULL
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    _title := 'Proposta ' || NEW.status::text || ': ' || NEW.title;
    PERFORM public.log_sponsor_interaction(
      NEW.sponsor_id, NEW.owner_id, 'proposta'::sponsor_interaction_type,
      _title, 'Mudou de ' || OLD.status::text || ' para ' || NEW.status::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      NULL, NULL, NEW.id, NULL, NULL
    );
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_proposal_interaction() from public, anon, authenticated;
grant execute on function public.tg_proposal_interaction() to service_role;

-- tg_proposal_sync_opportunity_stage
CREATE OR REPLACE FUNCTION public.tg_proposal_sync_opportunity_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.converted_opportunity_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'aceita' THEN
    PERFORM public.sync_opportunity_stage(NEW.converted_opportunity_id, 'fechado');
  ELSIF NEW.status = 'enviada' THEN
    PERFORM public.sync_opportunity_stage(NEW.converted_opportunity_id, 'proposta_enviada');
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_proposal_sync_opportunity_stage() from public, anon, authenticated;
grant execute on function public.tg_proposal_sync_opportunity_stage() to service_role;

-- tg_set_asset_child_organization_id
CREATE OR REPLACE FUNCTION public.tg_set_asset_child_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'asset_allocations' THEN
    SELECT organization_id INTO NEW.organization_id FROM public.assets WHERE id = NEW.asset_id;
  ELSIF TG_TABLE_NAME = 'asset_photos' THEN
    SELECT organization_id INTO NEW.organization_id FROM public.assets WHERE id = NEW.asset_id;
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para o ativo';
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_set_asset_child_organization_id() from public, anon, authenticated;
grant execute on function public.tg_set_asset_child_organization_id() to service_role;

-- tg_set_child_sponsor_id
CREATE OR REPLACE FUNCTION public.tg_set_child_sponsor_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sponsor_id IS NULL AND NEW.contract_id IS NOT NULL THEN
    SELECT sponsor_id INTO NEW.sponsor_id FROM public.contracts WHERE id = NEW.contract_id;
  END IF;

  IF TG_TABLE_NAME = 'deliveries' THEN
    IF NEW.sponsor_id IS NULL AND NEW.opportunity_id IS NOT NULL THEN
      SELECT sponsor_id INTO NEW.sponsor_id FROM public.opportunities WHERE id = NEW.opportunity_id;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'installments' THEN
    IF NEW.organization_id IS NULL AND NEW.contract_id IS NOT NULL THEN
      SELECT organization_id INTO NEW.organization_id FROM public.contracts WHERE id = NEW.contract_id;
    END IF;
  END IF;

  RETURN NEW;
END $function$;
revoke all on function public.tg_set_child_sponsor_id() from public, anon, authenticated;
grant execute on function public.tg_set_child_sponsor_id() to service_role;

-- tg_set_contract_child_organization_id
CREATE OR REPLACE FUNCTION public.tg_set_contract_child_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.contracts WHERE id = NEW.contract_id;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para o contrato';
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_set_contract_child_organization_id() from public, anon, authenticated;
grant execute on function public.tg_set_contract_child_organization_id() to service_role;

-- tg_set_default_pipeline_funnel
CREATE OR REPLACE FUNCTION public.tg_set_default_pipeline_funnel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _funnel_id uuid;
BEGIN
  IF NEW.pipeline_funnel_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    NEW.organization_id := public.get_user_org(NEW.owner_id);
  END IF;

  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _funnel_id
  FROM public.pipeline_funnels
  WHERE organization_id = NEW.organization_id AND is_default = true
  LIMIT 1;

  IF _funnel_id IS NULL THEN
    INSERT INTO public.pipeline_funnels (organization_id, name, description, position, is_default, is_active)
    VALUES (NEW.organization_id, 'Pipeline principal', 'Funil padrão criado automaticamente.', 0, true, true)
    RETURNING id INTO _funnel_id;
  END IF;

  NEW.pipeline_funnel_id := _funnel_id;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_set_default_pipeline_funnel() from public, anon, authenticated;
grant execute on function public.tg_set_default_pipeline_funnel() to service_role;

-- tg_set_delivery_approval_organization_id
CREATE OR REPLACE FUNCTION public.tg_set_delivery_approval_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.deliveries WHERE id = NEW.delivery_id;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para a entrega';
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_set_delivery_approval_organization_id() from public, anon, authenticated;
grant execute on function public.tg_set_delivery_approval_organization_id() to service_role;

-- tg_set_opportunity_activity_organization_id
CREATE OR REPLACE FUNCTION public.tg_set_opportunity_activity_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.opportunities WHERE id = NEW.opportunity_id;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para a oportunidade';
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_set_opportunity_activity_organization_id() from public, anon, authenticated;
grant execute on function public.tg_set_opportunity_activity_organization_id() to service_role;

-- tg_set_opportunity_contact_org
CREATE OR REPLACE FUNCTION public.tg_set_opportunity_contact_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.opportunities WHERE id = NEW.opportunity_id;
  END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_set_opportunity_contact_org() from public, anon, authenticated;
grant execute on function public.tg_set_opportunity_contact_org() to service_role;

-- tg_set_org_from_membership_default
CREATE OR REPLACE FUNCTION public.tg_set_org_from_membership_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_user_org(COALESCE(NEW.owner_id, auth.uid()));
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_set_org_from_membership_default() from public, anon, authenticated;
grant execute on function public.tg_set_org_from_membership_default() to service_role;

-- tg_set_organization_id
CREATE OR REPLACE FUNCTION public.tg_set_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    NEW.organization_id := public.get_user_org(NEW.owner_id);
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_set_organization_id() from public, anon, authenticated;
grant execute on function public.tg_set_organization_id() to service_role;

-- tg_set_proposal_number
CREATE OR REPLACE FUNCTION public.tg_set_proposal_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _year text := to_char(COALESCE(NEW.created_at, now()), 'YYYY');
  _seq int;
BEGIN
  IF NEW.proposal_number IS NOT NULL AND btrim(NEW.proposal_number) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX((split_part(proposal_number, '-', 2))::int), 0) + 1
    INTO _seq
  FROM public.proposals
  WHERE organization_id IS NOT DISTINCT FROM NEW.organization_id
    AND proposal_number ~ ('^' || _year || '-[0-9]+$');

  NEW.proposal_number := _year || '-' || lpad(_seq::text, 4, '0');
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_set_proposal_number() from public, anon, authenticated;
grant execute on function public.tg_set_proposal_number() to service_role;

-- tg_sponsor_audit
CREATE OR REPLACE FUNCTION public.tg_sponsor_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, new_value, source)
    VALUES (NEW.organization_id, NEW.id, COALESCE(_actor, NEW.owner_id), 'sponsor', NEW.id, 'created',
            jsonb_build_object('name', NEW.name, 'lifecycle', NEW.lifecycle), 'manual');
    RETURN NEW;
  END IF;

  IF NEW.account_owner_id IS DISTINCT FROM OLD.account_owner_id THEN
    INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, old_value, new_value, source)
    VALUES (NEW.organization_id, NEW.id, _actor, 'sponsor', NEW.id, 'owner_changed',
            to_jsonb(OLD.account_owner_id), to_jsonb(NEW.account_owner_id), CASE WHEN _actor IS NULL THEN 'automatico'::crm_audit_source ELSE 'manual'::crm_audit_source END);
  END IF;
  IF NEW.lifecycle IS DISTINCT FROM OLD.lifecycle THEN
    INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, old_value, new_value, source)
    VALUES (NEW.organization_id, NEW.id, _actor, 'sponsor', NEW.id, 'lifecycle_changed',
            to_jsonb(OLD.lifecycle), to_jsonb(NEW.lifecycle), CASE WHEN _actor IS NULL THEN 'automatico'::crm_audit_source ELSE 'manual'::crm_audit_source END);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, old_value, new_value, source)
    VALUES (NEW.organization_id, NEW.id, _actor, 'sponsor', NEW.id, 'priority_changed', to_jsonb(OLD.priority), to_jsonb(NEW.priority), 'manual');
  END IF;
  IF NEW.health IS DISTINCT FROM OLD.health THEN
    INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, old_value, new_value, source)
    VALUES (NEW.organization_id, NEW.id, _actor, 'sponsor', NEW.id, 'health_changed', to_jsonb(OLD.health), to_jsonb(NEW.health), 'manual');
  END IF;
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, old_value, new_value, source)
    VALUES (NEW.organization_id, NEW.id, _actor, 'sponsor', NEW.id,
            CASE WHEN NEW.archived_at IS NULL THEN 'unarchived' ELSE 'archived' END,
            jsonb_build_object('archived_at', OLD.archived_at),
            jsonb_build_object('archived_at', NEW.archived_at, 'reason', NEW.archive_reason), 'manual');
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_sponsor_audit() from public, anon, authenticated;
grant execute on function public.tg_sponsor_audit() to service_role;

-- tg_sync_sponsor_last_contact
CREATE OR REPLACE FUNCTION public.tg_sync_sponsor_last_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.sponsors
     SET last_contact_at = GREATEST(COALESCE(last_contact_at, NEW.occurred_at::date), NEW.occurred_at::date)
   WHERE id = NEW.sponsor_id;
  RETURN NEW;
END $function$;
revoke all on function public.tg_sync_sponsor_last_contact() from public, anon, authenticated;
grant execute on function public.tg_sync_sponsor_last_contact() to service_role;

-- tg_update_sponsor_last_contact
CREATE OR REPLACE FUNCTION public.tg_update_sponsor_last_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source = 'manual' AND NEW.type IN ('reuniao','ligacao','email','whatsapp') THEN
    UPDATE public.sponsors SET last_contact_at = NEW.occurred_at::date
      WHERE id = NEW.sponsor_id
        AND (last_contact_at IS NULL OR last_contact_at < NEW.occurred_at::date);
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_update_sponsor_last_contact() from public, anon, authenticated;
grant execute on function public.tg_update_sponsor_last_contact() to service_role;

-- tg_validate_opportunity_org_access
CREATE OR REPLACE FUNCTION public.tg_validate_opportunity_org_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _role text := auth.role();
  _resolved_org uuid;
BEGIN
  IF _role = 'service_role' THEN
    IF NEW.organization_id IS NULL AND NEW.owner_id IS NOT NULL THEN
      NEW.organization_id := public.get_user_org(NEW.owner_id);
    END IF;
    RETURN NEW;
  END IF;

  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado para criar ou alterar negociação';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_id IS NULL THEN
      NEW.owner_id := _actor;
    END IF;

    IF NEW.owner_id IS DISTINCT FROM _actor THEN
      RAISE EXCEPTION 'Negociação deve ser criada pelo próprio usuário autenticado';
    END IF;
  END IF;

  _resolved_org := COALESCE(NEW.organization_id, public.get_user_org(_actor));

  IF _resolved_org IS NULL THEN
    RAISE EXCEPTION 'Nenhuma organização ativa encontrada para o usuário';
  END IF;

  IF NOT public.is_org_member(_actor, _resolved_org) THEN
    RAISE EXCEPTION 'Usuário não pertence à organização da negociação';
  END IF;

  IF NOT public.can_access_module(_actor, _resolved_org, 'crm', true) THEN
    RAISE EXCEPTION 'Usuário sem permissão de CRM para gerenciar negociações nesta organização';
  END IF;

  NEW.organization_id := _resolved_org;
  RETURN NEW;
END;
$function$;
revoke all on function public.tg_validate_opportunity_org_access() from public, anon, authenticated;
grant execute on function public.tg_validate_opportunity_org_access() to service_role;

-- tg_validate_parent_organization
CREATE OR REPLACE FUNCTION public.tg_validate_parent_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _parent_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'contract_assets' OR TG_TABLE_NAME = 'contract_clauses' THEN
    SELECT organization_id INTO _parent_org FROM public.contracts WHERE id = NEW.contract_id;
  ELSIF TG_TABLE_NAME = 'proposal_items' THEN
    SELECT organization_id INTO _parent_org FROM public.proposals WHERE id = NEW.proposal_id;
  ELSIF TG_TABLE_NAME = 'tier_assets' THEN
    SELECT organization_id INTO _parent_org FROM public.sponsorship_tiers WHERE id = NEW.tier_id;
  ELSIF TG_TABLE_NAME = 'delivery_attachments' THEN
    SELECT organization_id INTO _parent_org FROM public.deliveries WHERE id = NEW.delivery_id;
  ELSIF TG_TABLE_NAME = 'opportunity_comment_attachments' THEN
    SELECT organization_id INTO _parent_org FROM public.opportunity_comments WHERE id = NEW.comment_id;
  END IF;

  IF _parent_org IS NULL THEN
    RAISE EXCEPTION 'Registro pai não encontrado ou sem organização definida';
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := _parent_org;
  ELSIF NEW.organization_id IS DISTINCT FROM _parent_org THEN
    RAISE EXCEPTION 'Registro pai pertence a outra organização';
  END IF;

  RETURN NEW;
END;
$function$;
revoke all on function public.tg_validate_parent_organization() from public, anon, authenticated;
grant execute on function public.tg_validate_parent_organization() to service_role;

-- update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
revoke all on function public.update_updated_at_column() from public, anon, authenticated;
grant execute on function public.update_updated_at_column() to service_role;

-- validate_opportunity_loss_fields
CREATE OR REPLACE FUNCTION public.validate_opportunity_loss_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lost_value IS NOT NULL AND NEW.lost_value < 0 THEN
    RAISE EXCEPTION 'Valor perdido não pode ser negativo';
  END IF;

  IF NEW.lost_reason IS NOT NULL AND length(btrim(NEW.lost_reason)) > 120 THEN
    RAISE EXCEPTION 'Motivo deve ter no máximo 120 caracteres';
  END IF;

  IF NEW.lost_comment IS NOT NULL AND length(btrim(NEW.lost_comment)) > 1000 THEN
    RAISE EXCEPTION 'Comentário deve ter no máximo 1000 caracteres';
  END IF;

  IF NEW.lost_competitor IS NOT NULL AND length(btrim(NEW.lost_competitor)) > 120 THEN
    RAISE EXCEPTION 'Concorrente deve ter no máximo 120 caracteres';
  END IF;

  IF NEW.stage = 'perdido'::opportunity_stage THEN
    IF NEW.lost_reason IS NULL OR length(btrim(NEW.lost_reason)) < 2 THEN
      RAISE EXCEPTION 'Informe o motivo da perda';
    END IF;

    IF NEW.lost_comment IS NULL OR length(btrim(NEW.lost_comment)) < 2 THEN
      RAISE EXCEPTION 'Informe um comentário sobre a perda';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
revoke all on function public.validate_opportunity_loss_fields() from public, anon, authenticated;
grant execute on function public.validate_opportunity_loss_fields() to service_role;

-- validate_property_lead
CREATE OR REPLACE FUNCTION public.validate_property_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
revoke all on function public.validate_property_lead() from public, anon, authenticated;
grant execute on function public.validate_property_lead() to service_role;

-- triggers
drop trigger if exists update_ai_conversations_updated_at on public.ai_conversations;
CREATE TRIGGER update_ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists update_ai_suggestions_updated_at on public.ai_suggestions;
CREATE TRIGGER update_ai_suggestions_updated_at BEFORE UPDATE ON public.ai_suggestions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists set_asset_allocations_organization_id on public.asset_allocations;
CREATE TRIGGER set_asset_allocations_organization_id BEFORE INSERT OR UPDATE OF asset_id ON public.asset_allocations FOR EACH ROW EXECUTE FUNCTION tg_set_asset_child_organization_id();
drop trigger if exists set_asset_photos_organization_id on public.asset_photos;
CREATE TRIGGER set_asset_photos_organization_id BEFORE INSERT OR UPDATE OF asset_id ON public.asset_photos FOR EACH ROW EXECUTE FUNCTION tg_set_asset_child_organization_id();
drop trigger if exists set_org_id on public.assets;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists update_assets_updated_at on public.assets;
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_brandtrack_brands_org on public.brandtrack_brands;
CREATE TRIGGER trg_brandtrack_brands_org BEFORE INSERT ON public.brandtrack_brands FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_brandtrack_brands_updated on public.brandtrack_brands;
CREATE TRIGGER trg_brandtrack_brands_updated BEFORE UPDATE ON public.brandtrack_brands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_brandtrack_detections_org on public.brandtrack_detections;
CREATE TRIGGER trg_brandtrack_detections_org BEFORE INSERT ON public.brandtrack_detections FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_brandtrack_event_brands_org on public.brandtrack_event_brands;
CREATE TRIGGER trg_brandtrack_event_brands_org BEFORE INSERT ON public.brandtrack_event_brands FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_brandtrack_event_brands_updated on public.brandtrack_event_brands;
CREATE TRIGGER trg_brandtrack_event_brands_updated BEFORE UPDATE ON public.brandtrack_event_brands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_brandtrack_events_org on public.brandtrack_events;
CREATE TRIGGER trg_brandtrack_events_org BEFORE INSERT ON public.brandtrack_events FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_brandtrack_events_updated on public.brandtrack_events;
CREATE TRIGGER trg_brandtrack_events_updated BEFORE UPDATE ON public.brandtrack_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_brandtrack_media_org on public.brandtrack_media;
CREATE TRIGGER trg_brandtrack_media_org BEFORE INSERT ON public.brandtrack_media FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_brandtrack_media_updated on public.brandtrack_media;
CREATE TRIGGER trg_brandtrack_media_updated BEFORE UPDATE ON public.brandtrack_media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists set_contract_assets_organization_id on public.contract_assets;
CREATE TRIGGER set_contract_assets_organization_id BEFORE INSERT OR UPDATE OF contract_id ON public.contract_assets FOR EACH ROW EXECUTE FUNCTION tg_set_contract_child_organization_id();
drop trigger if exists validate_parent_org on public.contract_assets;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.contract_assets FOR EACH ROW EXECUTE FUNCTION tg_validate_parent_organization();
drop trigger if exists set_org_churn on public.contract_churn_risk;
CREATE TRIGGER set_org_churn BEFORE INSERT ON public.contract_churn_risk FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists set_org_contract_churn_risk on public.contract_churn_risk;
CREATE TRIGGER set_org_contract_churn_risk BEFORE INSERT ON public.contract_churn_risk FOR EACH ROW EXECUTE FUNCTION tg_set_org_from_membership_default();
drop trigger if exists update_contract_clause_templates_updated_at on public.contract_clause_templates;
CREATE TRIGGER update_contract_clause_templates_updated_at BEFORE UPDATE ON public.contract_clause_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists set_contract_clauses_organization_id on public.contract_clauses;
CREATE TRIGGER set_contract_clauses_organization_id BEFORE INSERT OR UPDATE OF contract_id ON public.contract_clauses FOR EACH ROW EXECUTE FUNCTION tg_set_contract_child_organization_id();
drop trigger if exists validate_parent_org on public.contract_clauses;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.contract_clauses FOR EACH ROW EXECUTE FUNCTION tg_validate_parent_organization();
drop trigger if exists contract_sync_opportunity_stage on public.contracts;
CREATE TRIGGER contract_sync_opportunity_stage AFTER INSERT OR UPDATE OF opportunity_id, status ON public.contracts FOR EACH ROW EXECUTE FUNCTION tg_contract_sync_opportunity_stage();
drop trigger if exists contracts_updated_at on public.contracts;
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists set_org_id on public.contracts;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.contracts FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_contract_interaction on public.contracts;
CREATE TRIGGER trg_contract_interaction AFTER INSERT OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION tg_contract_interaction();
drop trigger if exists trg_contract_sponsor_lifecycle on public.contracts;
CREATE TRIGGER trg_contract_sponsor_lifecycle AFTER INSERT OR DELETE OR UPDATE OF status, sponsor_id ON public.contracts FOR EACH ROW EXECUTE FUNCTION tg_contract_sync_sponsor_lifecycle();
drop trigger if exists trg_contracts_generate_deliveries on public.contracts;
CREATE TRIGGER trg_contracts_generate_deliveries AFTER INSERT OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION handle_contract_deliveries();
drop trigger if exists trg_contracts_generate_installments on public.contracts;
CREATE TRIGGER trg_contracts_generate_installments AFTER INSERT OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION handle_contract_installments();
drop trigger if exists trg_crm_task_effects on public.crm_tasks;
CREATE TRIGGER trg_crm_task_effects BEFORE UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION tg_crm_task_effects();
drop trigger if exists trg_crm_task_next_action on public.crm_tasks;
CREATE TRIGGER trg_crm_task_next_action AFTER INSERT OR DELETE OR UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION tg_crm_task_sync_next_action();
drop trigger if exists trg_crm_tasks_org on public.crm_tasks;
CREATE TRIGGER trg_crm_tasks_org BEFORE INSERT ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION set_org_from_sponsor();
drop trigger if exists trg_crm_tasks_updated on public.crm_tasks;
CREATE TRIGGER trg_crm_tasks_updated BEFORE UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists deliveries_updated_at on public.deliveries;
CREATE TRIGGER deliveries_updated_at BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists delivery_sync_opportunity_stage on public.deliveries;
CREATE TRIGGER delivery_sync_opportunity_stage AFTER INSERT ON public.deliveries FOR EACH ROW EXECUTE FUNCTION tg_delivery_sync_opportunity_stage();
drop trigger if exists set_org_id on public.deliveries;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.deliveries FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_deliveries_sponsor on public.deliveries;
CREATE TRIGGER trg_deliveries_sponsor BEFORE INSERT OR UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION tg_set_child_sponsor_id();
drop trigger if exists trg_delivery_interaction on public.deliveries;
CREATE TRIGGER trg_delivery_interaction AFTER UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION tg_delivery_interaction();
drop trigger if exists set_delivery_approval_log_organization_id on public.delivery_approval_log;
CREATE TRIGGER set_delivery_approval_log_organization_id BEFORE INSERT OR UPDATE OF delivery_id ON public.delivery_approval_log FOR EACH ROW EXECUTE FUNCTION tg_set_delivery_approval_organization_id();
drop trigger if exists trg_delivery_attachments_limit on public.delivery_attachments;
CREATE TRIGGER trg_delivery_attachments_limit BEFORE INSERT ON public.delivery_attachments FOR EACH ROW EXECUTE FUNCTION enforce_delivery_attachment_limit();
drop trigger if exists trg_delivery_attachments_org on public.delivery_attachments;
CREATE TRIGGER trg_delivery_attachments_org BEFORE INSERT ON public.delivery_attachments FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists validate_parent_org on public.delivery_attachments;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.delivery_attachments FOR EACH ROW EXECUTE FUNCTION tg_validate_parent_organization();
drop trigger if exists set_org_id on public.installments;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.installments FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_installment_interaction on public.installments;
CREATE TRIGGER trg_installment_interaction AFTER UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION tg_installment_interaction();
drop trigger if exists trg_installments_sponsor on public.installments;
CREATE TRIGGER trg_installments_sponsor BEFORE INSERT OR UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION tg_set_child_sponsor_id();
drop trigger if exists update_installments_updated_at on public.installments;
CREATE TRIGGER update_installments_updated_at BEFORE UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_lead_scores_org on public.lead_scores;
CREATE TRIGGER trg_lead_scores_org BEFORE INSERT ON public.lead_scores FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_lead_scores_updated on public.lead_scores;
CREATE TRIGGER trg_lead_scores_updated BEFORE UPDATE ON public.lead_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists notify_commercial_team_opportunity_lost on public.opportunities;
CREATE TRIGGER notify_commercial_team_opportunity_lost AFTER UPDATE OF stage ON public.opportunities FOR EACH ROW EXECUTE FUNCTION notify_commercial_team_opportunity_lost();
drop trigger if exists set_default_pipeline_funnel on public.opportunities;
CREATE TRIGGER set_default_pipeline_funnel BEFORE INSERT OR UPDATE OF organization_id, owner_id, pipeline_funnel_id ON public.opportunities FOR EACH ROW EXECUTE FUNCTION tg_set_default_pipeline_funnel();
drop trigger if exists set_org_id on public.opportunities;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.opportunities FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_opportunity_audit_log on public.opportunities;
CREATE TRIGGER trg_opportunity_audit_log AFTER INSERT OR UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION tg_opportunity_audit_log();
drop trigger if exists trg_opportunity_interaction on public.opportunities;
CREATE TRIGGER trg_opportunity_interaction AFTER INSERT OR UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION tg_opportunity_interaction();
drop trigger if exists trg_opportunity_sponsor_sync_contacts on public.opportunities;
CREATE TRIGGER trg_opportunity_sponsor_sync_contacts AFTER UPDATE OF sponsor_id ON public.opportunities FOR EACH ROW EXECUTE FUNCTION tg_opportunity_sponsor_sync_contacts();
drop trigger if exists trg_opportunity_stage_change on public.opportunities;
CREATE TRIGGER trg_opportunity_stage_change BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION handle_opportunity_stage_change();
drop trigger if exists trg_opportunity_won on public.opportunities;
CREATE TRIGGER trg_opportunity_won AFTER INSERT OR UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION handle_opportunity_won();
drop trigger if exists update_opportunities_updated_at on public.opportunities;
CREATE TRIGGER update_opportunities_updated_at BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists validate_opportunity_loss_fields_trigger on public.opportunities;
CREATE TRIGGER validate_opportunity_loss_fields_trigger BEFORE INSERT OR UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION validate_opportunity_loss_fields();
drop trigger if exists validate_opportunity_org_access on public.opportunities;
CREATE TRIGGER validate_opportunity_org_access BEFORE INSERT OR UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION tg_validate_opportunity_org_access();
drop trigger if exists set_opportunity_activities_organization_id on public.opportunity_activities;
CREATE TRIGGER set_opportunity_activities_organization_id BEFORE INSERT OR UPDATE OF opportunity_id ON public.opportunity_activities FOR EACH ROW EXECUTE FUNCTION tg_set_opportunity_activity_organization_id();
drop trigger if exists trg_opportunity_activities_updated on public.opportunity_activities;
CREATE TRIGGER trg_opportunity_activities_updated BEFORE UPDATE ON public.opportunity_activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists validate_parent_org on public.opportunity_comment_attachments;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.opportunity_comment_attachments FOR EACH ROW EXECUTE FUNCTION tg_validate_parent_organization();
drop trigger if exists notify_opportunity_comment_mentions on public.opportunity_comments;
CREATE TRIGGER notify_opportunity_comment_mentions AFTER INSERT OR UPDATE OF mentions ON public.opportunity_comments FOR EACH ROW EXECUTE FUNCTION notify_opportunity_comment_mentions();
drop trigger if exists update_opportunity_comments_updated_at on public.opportunity_comments;
CREATE TRIGGER update_opportunity_comments_updated_at BEFORE UPDATE ON public.opportunity_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_opportunity_contacts_set_org on public.opportunity_contacts;
CREATE TRIGGER trg_opportunity_contacts_set_org BEFORE INSERT ON public.opportunity_contacts FOR EACH ROW EXECUTE FUNCTION tg_set_opportunity_contact_org();
drop trigger if exists trg_opportunity_contacts_sync on public.opportunity_contacts;
CREATE TRIGGER trg_opportunity_contacts_sync AFTER INSERT OR UPDATE ON public.opportunity_contacts FOR EACH ROW EXECUTE FUNCTION tg_opportunity_contact_sync();
drop trigger if exists trg_opportunity_contacts_updated_at on public.opportunity_contacts;
CREATE TRIGGER trg_opportunity_contacts_updated_at BEFORE UPDATE ON public.opportunity_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists on_organization_created on public.organizations;
CREATE TRIGGER on_organization_created AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION handle_new_organization();
drop trigger if exists update_pipeline_funnels_updated_at on public.pipeline_funnels;
CREATE TRIGGER update_pipeline_funnels_updated_at BEFORE UPDATE ON public.pipeline_funnels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists update_pipeline_stage_slas_updated_at on public.pipeline_stage_slas;
CREATE TRIGGER update_pipeline_stage_slas_updated_at BEFORE UPDATE ON public.pipeline_stage_slas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists profiles_updated_at on public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_checklist_completion on public.property_checklist_items;
CREATE TRIGGER trg_checklist_completion BEFORE INSERT OR UPDATE ON public.property_checklist_items FOR EACH ROW EXECUTE FUNCTION handle_checklist_completion();
drop trigger if exists trg_property_checklist_items_org on public.property_checklist_items;
CREATE TRIGGER trg_property_checklist_items_org BEFORE INSERT OR UPDATE OF property_id, organization_id ON public.property_checklist_items FOR EACH ROW EXECUTE FUNCTION set_org_from_property();
drop trigger if exists trg_property_checklist_updated_at on public.property_checklist_items;
CREATE TRIGGER trg_property_checklist_updated_at BEFORE UPDATE ON public.property_checklist_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_property_events_org on public.property_events;
CREATE TRIGGER trg_property_events_org BEFORE INSERT OR UPDATE OF property_id, organization_id ON public.property_events FOR EACH ROW EXECUTE FUNCTION set_org_from_property();
drop trigger if exists update_property_events_updated_at on public.property_events;
CREATE TRIGGER update_property_events_updated_at BEFORE UPDATE ON public.property_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_lead_to_opportunity on public.property_leads;
CREATE TRIGGER trg_lead_to_opportunity BEFORE INSERT ON public.property_leads FOR EACH ROW EXECUTE FUNCTION handle_lead_to_opportunity();
drop trigger if exists trg_property_leads_org on public.property_leads;
CREATE TRIGGER trg_property_leads_org BEFORE INSERT OR UPDATE OF property_id, organization_id ON public.property_leads FOR EACH ROW EXECUTE FUNCTION set_org_from_property();
drop trigger if exists trg_validate_property_lead on public.property_leads;
CREATE TRIGGER trg_validate_property_lead BEFORE INSERT ON public.property_leads FOR EACH ROW EXECUTE FUNCTION validate_property_lead();
drop trigger if exists trg_property_media_org on public.property_media;
CREATE TRIGGER trg_property_media_org BEFORE INSERT OR UPDATE OF property_id, organization_id ON public.property_media FOR EACH ROW EXECUTE FUNCTION set_org_from_property();
drop trigger if exists trg_property_media_updated_at on public.property_media;
CREATE TRIGGER trg_property_media_updated_at BEFORE UPDATE ON public.property_media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_proposal_items_org on public.proposal_items;
CREATE TRIGGER trg_proposal_items_org BEFORE INSERT OR UPDATE OF proposal_id, organization_id ON public.proposal_items FOR EACH ROW EXECUTE FUNCTION set_org_from_proposal();
drop trigger if exists validate_parent_org on public.proposal_items;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.proposal_items FOR EACH ROW EXECUTE FUNCTION tg_validate_parent_organization();
drop trigger if exists trg_proposal_versions_org on public.proposal_versions;
CREATE TRIGGER trg_proposal_versions_org BEFORE INSERT ON public.proposal_versions FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_proposal_versions_updated on public.proposal_versions;
CREATE TRIGGER trg_proposal_versions_updated BEFORE UPDATE ON public.proposal_versions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists proposal_sync_opportunity_stage on public.proposals;
CREATE TRIGGER proposal_sync_opportunity_stage AFTER INSERT OR UPDATE OF status ON public.proposals FOR EACH ROW EXECUTE FUNCTION tg_proposal_sync_opportunity_stage();
drop trigger if exists set_org_id on public.proposals;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.proposals FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists set_proposal_number on public.proposals;
CREATE TRIGGER set_proposal_number BEFORE INSERT ON public.proposals FOR EACH ROW EXECUTE FUNCTION tg_set_proposal_number();
drop trigger if exists trg_proposal_interaction on public.proposals;
CREATE TRIGGER trg_proposal_interaction AFTER INSERT OR UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION tg_proposal_interaction();
drop trigger if exists update_proposals_updated_at on public.proposals;
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists set_org_sellout on public.sellout_reports;
CREATE TRIGGER set_org_sellout BEFORE INSERT ON public.sellout_reports FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists set_org_sellout_reports on public.sellout_reports;
CREATE TRIGGER set_org_sellout_reports BEFORE INSERT ON public.sellout_reports FOR EACH ROW EXECUTE FUNCTION tg_set_org_from_membership_default();
drop trigger if exists trg_sponsor_brands_org on public.sponsor_brands;
CREATE TRIGGER trg_sponsor_brands_org BEFORE INSERT ON public.sponsor_brands FOR EACH ROW EXECUTE FUNCTION set_org_from_sponsor();
drop trigger if exists trg_sponsor_brands_updated on public.sponsor_brands;
CREATE TRIGGER trg_sponsor_brands_updated BEFORE UPDATE ON public.sponsor_brands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists update_sponsor_brandtrack_profiles_updated_at on public.sponsor_brandtrack_profiles;
CREATE TRIGGER update_sponsor_brandtrack_profiles_updated_at BEFORE UPDATE ON public.sponsor_brandtrack_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_sponsor_contacts_org on public.sponsor_contacts;
CREATE TRIGGER trg_sponsor_contacts_org BEFORE INSERT OR UPDATE OF sponsor_id, organization_id ON public.sponsor_contacts FOR EACH ROW EXECUTE FUNCTION set_org_from_sponsor();
drop trigger if exists update_sponsor_contract_profiles_updated_at on public.sponsor_contract_profiles;
CREATE TRIGGER update_sponsor_contract_profiles_updated_at BEFORE UPDATE ON public.sponsor_contract_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists update_sponsor_crm_profiles_updated_at on public.sponsor_crm_profiles;
CREATE TRIGGER update_sponsor_crm_profiles_updated_at BEFORE UPDATE ON public.sponsor_crm_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists update_sponsor_delivery_profiles_updated_at on public.sponsor_delivery_profiles;
CREATE TRIGGER update_sponsor_delivery_profiles_updated_at BEFORE UPDATE ON public.sponsor_delivery_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists update_sponsor_documents_updated_at on public.sponsor_documents;
CREATE TRIGGER update_sponsor_documents_updated_at BEFORE UPDATE ON public.sponsor_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists set_org_sponsor_exec_summaries on public.sponsor_executive_summaries;
CREATE TRIGGER set_org_sponsor_exec_summaries BEFORE INSERT ON public.sponsor_executive_summaries FOR EACH ROW EXECUTE FUNCTION tg_set_org_from_membership_default();
drop trigger if exists set_org_summary on public.sponsor_executive_summaries;
CREATE TRIGGER set_org_summary BEFORE INSERT ON public.sponsor_executive_summaries FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists update_sponsor_finance_profiles_updated_at on public.sponsor_finance_profiles;
CREATE TRIGGER update_sponsor_finance_profiles_updated_at BEFORE UPDATE ON public.sponsor_finance_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_sponsor_interactions_org on public.sponsor_interactions;
CREATE TRIGGER trg_sponsor_interactions_org BEFORE INSERT OR UPDATE OF sponsor_id, organization_id ON public.sponsor_interactions FOR EACH ROW EXECUTE FUNCTION set_org_from_sponsor();
drop trigger if exists trg_sponsor_interactions_updated on public.sponsor_interactions;
CREATE TRIGGER trg_sponsor_interactions_updated BEFORE UPDATE ON public.sponsor_interactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_sync_sponsor_last_contact on public.sponsor_interactions;
CREATE TRIGGER trg_sync_sponsor_last_contact AFTER INSERT ON public.sponsor_interactions FOR EACH ROW EXECUTE FUNCTION tg_sync_sponsor_last_contact();
drop trigger if exists trg_update_sponsor_last_contact on public.sponsor_interactions;
CREATE TRIGGER trg_update_sponsor_last_contact AFTER INSERT ON public.sponsor_interactions FOR EACH ROW EXECUTE FUNCTION tg_update_sponsor_last_contact();
drop trigger if exists trg_sponsor_invites_org on public.sponsor_invites;
CREATE TRIGGER trg_sponsor_invites_org BEFORE INSERT OR UPDATE OF sponsor_id, organization_id ON public.sponsor_invites FOR EACH ROW EXECUTE FUNCTION set_org_from_sponsor();
drop trigger if exists trg_sponsor_portal_access_org on public.sponsor_portal_access;
CREATE TRIGGER trg_sponsor_portal_access_org BEFORE INSERT OR UPDATE OF sponsor_id, organization_id ON public.sponsor_portal_access FOR EACH ROW EXECUTE FUNCTION set_org_from_sponsor();
drop trigger if exists trg_sponsor_portal_access_updated on public.sponsor_portal_access;
CREATE TRIGGER trg_sponsor_portal_access_updated BEFORE UPDATE ON public.sponsor_portal_access FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists update_sponsor_portal_profiles_updated_at on public.sponsor_portal_profiles;
CREATE TRIGGER update_sponsor_portal_profiles_updated_at BEFORE UPDATE ON public.sponsor_portal_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists update_sponsor_proposal_profiles_updated_at on public.sponsor_proposal_profiles;
CREATE TRIGGER update_sponsor_proposal_profiles_updated_at BEFORE UPDATE ON public.sponsor_proposal_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists set_org_id on public.sponsors;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.sponsors FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists trg_sponsor_audit_ins on public.sponsors;
CREATE TRIGGER trg_sponsor_audit_ins AFTER INSERT ON public.sponsors FOR EACH ROW EXECUTE FUNCTION tg_sponsor_audit();
drop trigger if exists trg_sponsor_audit_upd on public.sponsors;
CREATE TRIGGER trg_sponsor_audit_upd AFTER UPDATE ON public.sponsors FOR EACH ROW EXECUTE FUNCTION tg_sponsor_audit();
drop trigger if exists update_sponsors_updated_at on public.sponsors;
CREATE TRIGGER update_sponsors_updated_at BEFORE UPDATE ON public.sponsors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists set_org_id on public.sponsorship_tiers;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.sponsorship_tiers FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists update_sponsorship_tiers_updated_at on public.sponsorship_tiers;
CREATE TRIGGER update_sponsorship_tiers_updated_at BEFORE UPDATE ON public.sponsorship_tiers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists set_org_id on public.sports_properties;
CREATE TRIGGER set_org_id BEFORE INSERT ON public.sports_properties FOR EACH ROW EXECUTE FUNCTION tg_set_organization_id();
drop trigger if exists sports_properties_updated_at on public.sports_properties;
CREATE TRIGGER sports_properties_updated_at BEFORE UPDATE ON public.sports_properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_tier_assets_org on public.tier_assets;
CREATE TRIGGER trg_tier_assets_org BEFORE INSERT OR UPDATE OF tier_id, organization_id ON public.tier_assets FOR EACH ROW EXECUTE FUNCTION set_org_from_tier();
drop trigger if exists validate_parent_org on public.tier_assets;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.tier_assets FOR EACH ROW EXECUTE FUNCTION tg_validate_parent_organization();
drop trigger if exists trg_tier_sales_org on public.tier_sales;
CREATE TRIGGER trg_tier_sales_org BEFORE INSERT OR UPDATE OF tier_id, organization_id ON public.tier_sales FOR EACH ROW EXECUTE FUNCTION set_org_from_tier();
drop trigger if exists trg_user_dashboard_preferences_org on public.user_dashboard_preferences;
CREATE TRIGGER trg_user_dashboard_preferences_org BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.user_dashboard_preferences FOR EACH ROW EXECUTE FUNCTION set_org_from_user_membership();
drop trigger if exists update_user_dashboard_preferences_updated_at on public.user_dashboard_preferences;
CREATE TRIGGER update_user_dashboard_preferences_updated_at BEFORE UPDATE ON public.user_dashboard_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_user_stage_probabilities_org on public.user_stage_probabilities;
CREATE TRIGGER trg_user_stage_probabilities_org BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.user_stage_probabilities FOR EACH ROW EXECUTE FUNCTION set_org_from_user_membership();
