CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  sponsor_brand_id uuid REFERENCES public.sponsor_brands(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'followup',
  assignee_id uuid,
  due_date date,
  priority text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'aberta',
  source public.crm_audit_source NOT NULL DEFAULT 'manual',
  completed_at timestamptz,
  completed_by uuid,
  completion_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated;
GRANT ALL ON public.crm_tasks TO service_role;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view crm tasks" ON public.crm_tasks
  FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users manage crm tasks" ON public.crm_tasks
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), organization_id, 'crm', true))
  WITH CHECK (can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_sponsor ON public.crm_tasks (organization_id, sponsor_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due ON public.crm_tasks (organization_id, status, due_date);

CREATE TRIGGER trg_crm_tasks_org BEFORE INSERT ON public.crm_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_sponsor();
CREATE TRIGGER trg_crm_tasks_updated BEFORE UPDATE ON public.crm_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Conclusão gera interação e atualiza a próxima ação da conta
CREATE OR REPLACE FUNCTION public.tg_crm_task_effects()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END $$;

CREATE TRIGGER trg_crm_task_effects BEFORE UPDATE ON public.crm_tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_crm_task_effects();

CREATE OR REPLACE FUNCTION public.tg_crm_task_sync_next_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END $$;

CREATE TRIGGER trg_crm_task_next_action
AFTER INSERT OR UPDATE OR DELETE ON public.crm_tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_crm_task_sync_next_action();