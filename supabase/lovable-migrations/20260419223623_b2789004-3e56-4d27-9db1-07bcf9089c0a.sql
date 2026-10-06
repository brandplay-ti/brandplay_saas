-- Enum status de entrega
CREATE TYPE public.delivery_status AS ENUM (
  'pendente',
  'em_producao',
  'entregue',
  'aprovada',
  'atrasada'
);

-- Enum aprovação
CREATE TYPE public.delivery_approval AS ENUM (
  'pendente',
  'aprovada',
  'reprovada'
);

CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  property_id UUID REFERENCES public.sports_properties(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  brand TEXT NOT NULL,
  asset_type TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  due_date DATE,
  delivered_at DATE,
  evidence_url TEXT,
  notes TEXT,
  status public.delivery_status NOT NULL DEFAULT 'pendente',
  approval public.delivery_approval NOT NULL DEFAULT 'pendente',
  approval_comment TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners or admins view deliveries"
ON public.deliveries FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own deliveries"
ON public.deliveries FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners or admins update deliveries"
ON public.deliveries FOR UPDATE TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners or admins delete deliveries"
ON public.deliveries FOR DELETE TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER deliveries_updated_at
BEFORE UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_deliveries_owner ON public.deliveries(owner_id);
CREATE INDEX idx_deliveries_status ON public.deliveries(status);
CREATE INDEX idx_deliveries_property ON public.deliveries(property_id);