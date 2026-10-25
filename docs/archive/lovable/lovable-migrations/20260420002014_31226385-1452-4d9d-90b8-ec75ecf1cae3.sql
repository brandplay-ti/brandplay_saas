-- 1) Adiciona colunas em opportunities
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS tier_id uuid REFERENCES public.sponsorship_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_stage_change_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS lost_comment text,
  ADD COLUMN IF NOT EXISTS converted_proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

-- 2) Trigger para atualizar last_stage_change_at quando stage mudar
CREATE OR REPLACE FUNCTION public.handle_opportunity_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.last_stage_change_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_stage_change ON public.opportunities;
CREATE TRIGGER trg_opportunity_stage_change
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_opportunity_stage_change();

-- 3) Probabilidades por etapa (por usuário)
CREATE TABLE IF NOT EXISTS public.user_stage_probabilities (
  user_id uuid NOT NULL,
  stage public.opportunity_stage NOT NULL,
  probability integer NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stage)
);

ALTER TABLE public.user_stage_probabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own probabilities"
  ON public.user_stage_probabilities FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own probabilities"
  ON public.user_stage_probabilities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own probabilities"
  ON public.user_stage_probabilities FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own probabilities"
  ON public.user_stage_probabilities FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4) Atividades de oportunidade
CREATE TABLE IF NOT EXISTS public.opportunity_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  activity_type text NOT NULL DEFAULT 'nota', -- nota, ligacao, email, reuniao, tarefa
  title text NOT NULL,
  description text,
  due_date timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pendente', -- pendente, concluido
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_activities_opp ON public.opportunity_activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_activities_due ON public.opportunity_activities(due_date) WHERE status = 'pendente';

ALTER TABLE public.opportunity_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners or admins view activities"
  ON public.opportunity_activities FOR SELECT
  TO authenticated
  USING ((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users create own activities"
  ON public.opportunity_activities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners or admins update activities"
  ON public.opportunity_activities FOR UPDATE
  TO authenticated
  USING ((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners or admins delete activities"
  ON public.opportunity_activities FOR DELETE
  TO authenticated
  USING ((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_opportunity_activities_updated
  BEFORE UPDATE ON public.opportunity_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Trigger: ao mover oportunidade para "fechado" e ela tiver tier_id, criar tier_sale
CREATE OR REPLACE FUNCTION public.handle_opportunity_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_opportunity_won ON public.opportunities;
CREATE TRIGGER trg_opportunity_won
  AFTER INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_opportunity_won();