-- Enum status do contrato
CREATE TYPE public.contract_status AS ENUM (
  'rascunho',
  'em_assinatura',
  'ativo',
  'vencendo',
  'encerrado',
  'cancelado'
);

CREATE TYPE public.payment_method AS ENUM (
  'a_vista',
  'parcelado',
  'mensal',
  'personalizado'
);

CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  property_id UUID REFERENCES public.sports_properties(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  contract_number TEXT,
  brand TEXT NOT NULL,
  title TEXT NOT NULL,
  total_value NUMERIC NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status public.contract_status NOT NULL DEFAULT 'rascunho',
  payment_method public.payment_method NOT NULL DEFAULT 'a_vista',
  installments INTEGER NOT NULL DEFAULT 1,
  due_day INTEGER,
  signatories TEXT,
  notes TEXT,
  file_path TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners or admins view contracts"
ON public.contracts FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own contracts"
ON public.contracts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners or admins update contracts"
ON public.contracts FOR UPDATE TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners or admins delete contracts"
ON public.contracts FOR DELETE TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER contracts_updated_at
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_contracts_owner ON public.contracts(owner_id);
CREATE INDEX idx_contracts_status ON public.contracts(status);

-- Cláusulas
CREATE TABLE public.contract_clauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_clauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View clauses of accessible contracts"
ON public.contract_clauses FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = contract_clauses.contract_id
    AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
));

CREATE POLICY "Manage clauses of own contracts"
ON public.contract_clauses FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = contract_clauses.contract_id
    AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = contract_clauses.contract_id
    AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
));

-- Ativos contratados
CREATE TABLE public.contract_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View assets of accessible contracts"
ON public.contract_assets FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = contract_assets.contract_id
    AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
));

CREATE POLICY "Manage assets of own contracts"
ON public.contract_assets FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = contract_assets.contract_id
    AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = contract_assets.contract_id
    AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
));

-- Bucket privado para arquivos de contratos
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false);

CREATE POLICY "Users view own contract files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contracts'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Users upload own contract files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contracts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own contract files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'contracts'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Users delete own contract files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'contracts'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
);