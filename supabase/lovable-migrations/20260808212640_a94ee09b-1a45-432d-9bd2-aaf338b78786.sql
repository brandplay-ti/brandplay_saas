-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.sponsor_lifecycle AS ENUM ('prospect','em_abordagem','qualificado','em_negociacao','cliente_ativo','cliente_inativo','perdido','arquivado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sponsor_priority AS ENUM ('A','B','C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sponsor_health AS ENUM ('saudavel','atencao','risco','nao_aplicavel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_audit_source AS ENUM ('manual','automatico','ia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ 1.1 SPONSORS COMO FONTE ÚNICA ============
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS lifecycle public.sponsor_lifecycle NOT NULL DEFAULT 'prospect',
  ADD COLUMN IF NOT EXISTS priority public.sponsor_priority NOT NULL DEFAULT 'B',
  ADD COLUMN IF NOT EXISTS health public.sponsor_health NOT NULL DEFAULT 'nao_aplicavel',
  ADD COLUMN IF NOT EXISTS account_owner_id uuid,
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS merged_into_sponsor_id uuid REFERENCES public.sponsors(id);

-- Backfill: perfil CRM -> cadastro-mestre (nunca sobrescreve valor preenchido com vazio)
UPDATE public.sponsors s
SET segment = COALESCE(NULLIF(btrim(s.segment), ''), NULLIF(btrim(c.segment), '')),
    notes = COALESCE(NULLIF(btrim(s.notes), ''), NULLIF(btrim(c.notes), '')),
    tags = CASE WHEN coalesce(array_length(s.tags,1),0) > 0 THEN s.tags ELSE coalesce(c.tags, s.tags) END,
    last_contact_at = GREATEST(COALESCE(s.last_contact_at, '1900-01-01'::date), COALESCE(c.last_contact_at, '1900-01-01'::date)),
    score = COALESCE(c.score, s.score),
    account_owner_id = COALESCE(s.account_owner_id, s.owner_id)
FROM public.sponsor_crm_profiles c
WHERE c.sponsor_id = s.id;

UPDATE public.sponsors SET last_contact_at = NULL WHERE last_contact_at = '1900-01-01'::date;
UPDATE public.sponsors SET account_owner_id = owner_id WHERE account_owner_id IS NULL;

-- Ciclo de vida derivado de contratos ativos comprovados (sem suposição por nome)
UPDATE public.sponsors s
SET lifecycle = 'cliente_ativo'
WHERE s.lifecycle = 'prospect'
  AND EXISTS (SELECT 1 FROM public.contracts ct WHERE ct.sponsor_id = s.id AND ct.status = 'ativo');

CREATE INDEX IF NOT EXISTS idx_sponsors_org_lifecycle ON public.sponsors (organization_id, lifecycle);
CREATE INDEX IF NOT EXISTS idx_sponsors_org_archived ON public.sponsors (organization_id, archived_at);

-- última interação derivada das interações reais
CREATE OR REPLACE FUNCTION public.tg_sync_sponsor_last_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.sponsors
     SET last_contact_at = GREATEST(COALESCE(last_contact_at, NEW.occurred_at::date), NEW.occurred_at::date)
   WHERE id = NEW.sponsor_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_sponsor_last_contact ON public.sponsor_interactions;
CREATE TRIGGER trg_sync_sponsor_last_contact
AFTER INSERT ON public.sponsor_interactions
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_sponsor_last_contact();

-- ============ 1.3 MARCAS DA CONTA ============
CREATE TABLE IF NOT EXISTS public.sponsor_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  logo_path text,
  website text,
  is_active boolean NOT NULL DEFAULT true,
  brandtrack_brand_id uuid REFERENCES public.brandtrack_brands(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_brands TO authenticated;
GRANT ALL ON public.sponsor_brands TO service_role;
ALTER TABLE public.sponsor_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view sponsor brands" ON public.sponsor_brands
  FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users manage sponsor brands" ON public.sponsor_brands
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), organization_id, 'crm', true))
  WITH CHECK (can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE INDEX IF NOT EXISTS idx_sponsor_brands_org_sponsor ON public.sponsor_brands (organization_id, sponsor_id);

CREATE TRIGGER trg_sponsor_brands_org BEFORE INSERT ON public.sponsor_brands
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_sponsor();
CREATE TRIGGER trg_sponsor_brands_updated BEFORE UPDATE ON public.sponsor_brands
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AUDITORIA DO CRM ============
CREATE TABLE IF NOT EXISTS public.sponsor_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sponsor_id uuid,
  actor_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  source public.crm_audit_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.sponsor_audit_logs TO authenticated;
GRANT ALL ON public.sponsor_audit_logs TO service_role;
ALTER TABLE public.sponsor_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view sponsor audit logs" ON public.sponsor_audit_logs
  FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org members insert sponsor audit logs" ON public.sponsor_audit_logs
  FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS idx_sponsor_audit_org_sponsor ON public.sponsor_audit_logs (organization_id, sponsor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_sponsor_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_sponsor_audit_ins ON public.sponsors;
CREATE TRIGGER trg_sponsor_audit_ins AFTER INSERT ON public.sponsors
FOR EACH ROW EXECUTE FUNCTION public.tg_sponsor_audit();
DROP TRIGGER IF EXISTS trg_sponsor_audit_upd ON public.sponsors;
CREATE TRIGGER trg_sponsor_audit_upd AFTER UPDATE ON public.sponsors
FOR EACH ROW EXECUTE FUNCTION public.tg_sponsor_audit();

-- ============ 1.2 RELACIONAMENTOS POR ID ============
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES public.sponsors(id);
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES public.sponsors(id);
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS organization_id uuid;

-- backfill somente com vínculo comprovado
UPDATE public.deliveries d SET sponsor_id = c.sponsor_id
FROM public.contracts c
WHERE d.contract_id = c.id AND c.sponsor_id IS NOT NULL AND d.sponsor_id IS NULL
  AND d.organization_id IS NOT DISTINCT FROM c.organization_id;

UPDATE public.deliveries d SET sponsor_id = o.sponsor_id
FROM public.opportunities o
WHERE d.opportunity_id = o.id AND o.sponsor_id IS NOT NULL AND d.sponsor_id IS NULL
  AND d.organization_id IS NOT DISTINCT FROM o.organization_id;

UPDATE public.installments i SET sponsor_id = c.sponsor_id, organization_id = COALESCE(i.organization_id, c.organization_id)
FROM public.contracts c
WHERE i.contract_id = c.id AND i.sponsor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_sponsor ON public.deliveries (organization_id, sponsor_id);
CREATE INDEX IF NOT EXISTS idx_installments_sponsor ON public.installments (sponsor_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_sponsor ON public.opportunities (organization_id, sponsor_id);
CREATE INDEX IF NOT EXISTS idx_proposals_sponsor ON public.proposals (organization_id, sponsor_id);
CREATE INDEX IF NOT EXISTS idx_contracts_sponsor ON public.contracts (organization_id, sponsor_id);

-- mantém sponsor_id de entregas/parcelas coerente com o contrato
CREATE OR REPLACE FUNCTION public.tg_set_child_sponsor_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.sponsor_id IS NULL AND NEW.contract_id IS NOT NULL THEN
    SELECT sponsor_id INTO NEW.sponsor_id FROM public.contracts WHERE id = NEW.contract_id;
  END IF;
  IF NEW.sponsor_id IS NULL AND TG_TABLE_NAME = 'deliveries' AND NEW.opportunity_id IS NOT NULL THEN
    SELECT sponsor_id INTO NEW.sponsor_id FROM public.opportunities WHERE id = NEW.opportunity_id;
  END IF;
  IF TG_TABLE_NAME = 'installments' AND NEW.organization_id IS NULL AND NEW.contract_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.contracts WHERE id = NEW.contract_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deliveries_sponsor ON public.deliveries;
CREATE TRIGGER trg_deliveries_sponsor BEFORE INSERT OR UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.tg_set_child_sponsor_id();
DROP TRIGGER IF EXISTS trg_installments_sponsor ON public.installments;
CREATE TRIGGER trg_installments_sponsor BEFORE INSERT OR UPDATE ON public.installments
FOR EACH ROW EXECUTE FUNCTION public.tg_set_child_sponsor_id();

-- lista administrativa de pendências de associação
CREATE OR REPLACE VIEW public.crm_unlinked_records
WITH (security_invoker = on) AS
  SELECT 'opportunity'::text AS entity_type, o.id AS entity_id, o.organization_id, o.brand AS label, o.created_at
    FROM public.opportunities o WHERE o.sponsor_id IS NULL
  UNION ALL
  SELECT 'proposal', p.id, p.organization_id, p.brand, p.created_at
    FROM public.proposals p WHERE p.sponsor_id IS NULL
  UNION ALL
  SELECT 'contract', c.id, c.organization_id, c.brand, c.created_at
    FROM public.contracts c WHERE c.sponsor_id IS NULL
  UNION ALL
  SELECT 'delivery', d.id, d.organization_id, d.brand, d.created_at
    FROM public.deliveries d WHERE d.sponsor_id IS NULL;

GRANT SELECT ON public.crm_unlinked_records TO authenticated;

-- ============ 1.4 PORTAL: SEM AUTORIZAÇÃO POR TEXTO ============
DROP POLICY IF EXISTS "Sponsor portal user views own deliveries" ON public.deliveries;
CREATE POLICY "Sponsor portal user views own deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (sponsor_id IS NOT NULL AND has_sponsor_access(auth.uid(), sponsor_id));

DROP POLICY IF EXISTS "Sponsor portal user updates approval" ON public.deliveries;
CREATE POLICY "Sponsor portal user updates approval" ON public.deliveries
  FOR UPDATE TO authenticated
  USING (sponsor_id IS NOT NULL AND has_sponsor_access(auth.uid(), sponsor_id))
  WITH CHECK (sponsor_id IS NOT NULL AND has_sponsor_access(auth.uid(), sponsor_id));

DROP POLICY IF EXISTS "Sponsor portal user views own installments" ON public.installments;
CREATE POLICY "Sponsor portal user views own installments" ON public.installments
  FOR SELECT TO authenticated
  USING (sponsor_id IS NOT NULL AND has_sponsor_access(auth.uid(), sponsor_id));

-- função exclusiva do portal: somente campos liberados
CREATE OR REPLACE FUNCTION public.get_portal_sponsor_overview(_sponsor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _s record; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF NOT public.has_sponsor_access(auth.uid(), _sponsor_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado a este patrocinador';
  END IF;

  SELECT s.id, s.name, s.logo_path, s.website,
         COALESCE(pp.portal_display_name, s.name) AS display_name
    INTO _s
    FROM public.sponsors s
    LEFT JOIN public.sponsor_portal_profiles pp ON pp.sponsor_id = s.id
   WHERE s.id = _sponsor_id;

  IF _s IS NULL THEN RAISE EXCEPTION 'Patrocinador não encontrado'; END IF;

  SELECT jsonb_build_object(
    'sponsor', jsonb_build_object('id', _s.id, 'name', _s.display_name, 'logo_path', _s.logo_path, 'website', _s.website),
    'contracts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status,
        'start_date', c.start_date, 'end_date', c.end_date) ORDER BY c.created_at DESC)
      FROM public.contracts c WHERE c.sponsor_id = _sponsor_id), '[]'::jsonb),
    'deliveries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'due_date', d.due_date,
        'status', d.status, 'approval', d.approval) ORDER BY d.due_date NULLS LAST)
      FROM public.deliveries d WHERE d.sponsor_id = _sponsor_id), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END $$;

REVOKE ALL ON FUNCTION public.get_portal_sponsor_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_portal_sponsor_overview(uuid) TO authenticated;

-- ============ 1.5 ARQUIVAR / DESARQUIVAR / MESCLAR ============
CREATE OR REPLACE FUNCTION public.archive_sponsor(_sponsor_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.sponsors WHERE id = _sponsor_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'Patrocinador não encontrado'; END IF;
  IF NOT public.has_org_role(auth.uid(), _org, ARRAY['owner','admin']::org_role[]) THEN
    RAISE EXCEPTION 'Somente Owner ou Admin podem arquivar contas';
  END IF;
  UPDATE public.sponsors
     SET archived_at = now(), archived_by = auth.uid(),
         archive_reason = NULLIF(btrim(coalesce(_reason,'')), ''), lifecycle = 'arquivado'
   WHERE id = _sponsor_id;
END $$;

CREATE OR REPLACE FUNCTION public.unarchive_sponsor(_sponsor_id uuid, _lifecycle public.sponsor_lifecycle DEFAULT 'prospect')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.sponsors WHERE id = _sponsor_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'Patrocinador não encontrado'; END IF;
  IF NOT public.has_org_role(auth.uid(), _org, ARRAY['owner','admin']::org_role[]) THEN
    RAISE EXCEPTION 'Somente Owner ou Admin podem desarquivar contas';
  END IF;
  UPDATE public.sponsors
     SET archived_at = NULL, archived_by = NULL, archive_reason = NULL,
         lifecycle = CASE WHEN _lifecycle = 'arquivado' THEN 'prospect'::sponsor_lifecycle ELSE _lifecycle END
   WHERE id = _sponsor_id;
END $$;

CREATE OR REPLACE FUNCTION public.merge_sponsors(_target_id uuid, _duplicate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _org uuid; _dup_org uuid; _moved jsonb := '{}'::jsonb; _n int;
BEGIN
  IF _target_id = _duplicate_id THEN RAISE EXCEPTION 'Selecione contas diferentes'; END IF;
  SELECT organization_id INTO _org FROM public.sponsors WHERE id = _target_id;
  SELECT organization_id INTO _dup_org FROM public.sponsors WHERE id = _duplicate_id;
  IF _org IS NULL OR _dup_org IS NULL THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;
  IF _org IS DISTINCT FROM _dup_org THEN RAISE EXCEPTION 'As contas pertencem a organizações diferentes'; END IF;
  IF NOT public.has_org_role(auth.uid(), _org, ARRAY['owner','admin']::org_role[]) THEN
    RAISE EXCEPTION 'Somente Owner ou Admin podem mesclar contas';
  END IF;

  UPDATE public.opportunities SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('opportunities', _n);
  UPDATE public.proposals SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('proposals', _n);
  UPDATE public.contracts SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('contracts', _n);
  UPDATE public.deliveries SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('deliveries', _n);
  UPDATE public.installments SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('installments', _n);
  UPDATE public.sponsor_interactions SET sponsor_id = _target_id WHERE sponsor_id = _duplicate_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('interactions', _n);

  -- contatos sem duplicar (mesmo e-mail ou mesmo nome)
  UPDATE public.sponsor_contacts sc SET sponsor_id = _target_id
   WHERE sc.sponsor_id = _duplicate_id
     AND NOT EXISTS (
       SELECT 1 FROM public.sponsor_contacts t
        WHERE t.sponsor_id = _target_id
          AND (lower(coalesce(t.email,'')) = lower(coalesce(sc.email,'')) AND coalesce(sc.email,'') <> ''
               OR lower(t.name) = lower(sc.name)));
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('contacts', _n);

  UPDATE public.sponsor_brands sb SET sponsor_id = _target_id
   WHERE sb.sponsor_id = _duplicate_id
     AND NOT EXISTS (SELECT 1 FROM public.sponsor_brands t WHERE t.sponsor_id = _target_id AND lower(t.name) = lower(sb.name));
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('brands', _n);

  UPDATE public.sponsor_portal_access spa SET sponsor_id = _target_id
   WHERE spa.sponsor_id = _duplicate_id
     AND NOT EXISTS (SELECT 1 FROM public.sponsor_portal_access t WHERE t.sponsor_id = _target_id AND t.user_id = spa.user_id);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('portal_access', _n);

  UPDATE public.sponsors
     SET archived_at = now(), archived_by = auth.uid(), lifecycle = 'arquivado',
         archive_reason = 'Mesclado em outra conta', merged_into_sponsor_id = _target_id
   WHERE id = _duplicate_id;

  INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, old_value, new_value, source)
  VALUES (_org, _target_id, auth.uid(), 'sponsor', _duplicate_id, 'merged',
          jsonb_build_object('duplicate_id', _duplicate_id), _moved, 'manual');

  RETURN _moved;
END $$;

REVOKE ALL ON FUNCTION public.archive_sponsor(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unarchive_sponsor(uuid, public.sponsor_lifecycle) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_sponsors(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_sponsor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_sponsor(uuid, public.sponsor_lifecycle) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_sponsors(uuid, uuid) TO authenticated;