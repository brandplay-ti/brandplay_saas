-- ============================================================
-- FASE 2 — Timeline de Intera\u00e7\u00f5es do Patrocinador
-- ============================================================

-- Enum tipo de intera\u00e7\u00e3o
DO $$ BEGIN
  CREATE TYPE public.sponsor_interaction_type AS ENUM (
    'reuniao','ligacao','email','whatsapp','nota',
    'proposta','contrato','oportunidade','entrega','parcela','sistema'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sponsor_interaction_source AS ENUM ('manual','auto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.sponsor_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  type public.sponsor_interaction_type NOT NULL DEFAULT 'nota',
  source public.sponsor_interaction_source NOT NULL DEFAULT 'manual',
  title text NOT NULL,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  attachment_url text,
  next_action text,
  next_action_at timestamptz,
  next_action_done boolean NOT NULL DEFAULT false,
  related_opportunity_id uuid,
  related_contract_id uuid,
  related_proposal_id uuid,
  related_delivery_id uuid,
  related_installment_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_interactions_sponsor ON public.sponsor_interactions(sponsor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sponsor_interactions_owner ON public.sponsor_interactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_interactions_next_action ON public.sponsor_interactions(owner_id, next_action_at) WHERE next_action_at IS NOT NULL AND next_action_done = false;

ALTER TABLE public.sponsor_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages sponsor interactions"
  ON public.sponsor_interactions FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sponsors s
            WHERE s.id = sponsor_interactions.sponsor_id
              AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.sponsors s
            WHERE s.id = sponsor_interactions.sponsor_id
              AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Sponsor portal user views own interactions"
  ON public.sponsor_interactions FOR SELECT
  TO authenticated
  USING (public.has_sponsor_access(auth.uid(), sponsor_id));

-- Trigger updated_at
CREATE TRIGGER trg_sponsor_interactions_updated
  BEFORE UPDATE ON public.sponsor_interactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- AUTO-POPULA\u00c7\u00c3O via triggers
-- ============================================================

-- Helper: insere se sponsor_id n\u00e3o for null
CREATE OR REPLACE FUNCTION public.log_sponsor_interaction(
  _sponsor_id uuid, _owner_id uuid, _type sponsor_interaction_type,
  _title text, _description text, _metadata jsonb,
  _opportunity_id uuid, _contract_id uuid, _proposal_id uuid,
  _delivery_id uuid, _installment_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
END $$;

-- ===== Oportunidades =====
CREATE OR REPLACE FUNCTION public.tg_opportunity_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_opportunity_interaction ON public.opportunities;
CREATE TRIGGER trg_opportunity_interaction
  AFTER INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.tg_opportunity_interaction();

-- ===== Propostas =====
CREATE OR REPLACE FUNCTION public.tg_proposal_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_proposal_interaction ON public.proposals;
CREATE TRIGGER trg_proposal_interaction
  AFTER INSERT OR UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_interaction();

-- ===== Contratos =====
CREATE OR REPLACE FUNCTION public.tg_contract_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_contract_interaction ON public.contracts;
CREATE TRIGGER trg_contract_interaction
  AFTER INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_contract_interaction();

-- ===== Entregas (resolvendo sponsor pelo contrato vinculado) =====
CREATE OR REPLACE FUNCTION public.tg_delivery_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_delivery_interaction ON public.deliveries;
CREATE TRIGGER trg_delivery_interaction
  AFTER UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_interaction();

-- ===== Parcelas =====
CREATE OR REPLACE FUNCTION public.tg_installment_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_installment_interaction ON public.installments;
CREATE TRIGGER trg_installment_interaction
  AFTER UPDATE ON public.installments
  FOR EACH ROW EXECUTE FUNCTION public.tg_installment_interaction();

-- ============================================================
-- Atualiza last_contact_at do patrocinador automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_update_sponsor_last_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source = 'manual' AND NEW.type IN ('reuniao','ligacao','email','whatsapp') THEN
    UPDATE public.sponsors SET last_contact_at = NEW.occurred_at::date
      WHERE id = NEW.sponsor_id
        AND (last_contact_at IS NULL OR last_contact_at < NEW.occurred_at::date);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_update_sponsor_last_contact ON public.sponsor_interactions;
CREATE TRIGGER trg_update_sponsor_last_contact
  AFTER INSERT ON public.sponsor_interactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_sponsor_last_contact();