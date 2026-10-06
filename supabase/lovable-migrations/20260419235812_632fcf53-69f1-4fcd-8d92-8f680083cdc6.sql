-- Colunas para média kit público
ALTER TABLE public.sports_properties
  ADD COLUMN public_slug text UNIQUE,
  ADD COLUMN is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN public_headline text,
  ADD COLUMN public_about text,
  ADD COLUMN public_cover_path text;

CREATE INDEX idx_sports_properties_slug ON public.sports_properties(public_slug) WHERE public_slug IS NOT NULL;

-- Tabela de leads
CREATE TABLE public.property_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.sports_properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  tier_id uuid REFERENCES public.sponsorship_tiers(id) ON DELETE SET NULL,
  contact_name text NOT NULL,
  company text,
  email text NOT NULL,
  phone text,
  message text,
  budget_range text,
  status text NOT NULL DEFAULT 'novo',
  created_opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_leads ENABLE ROW LEVEL SECURITY;

-- Dono vê e gerencia seus leads
CREATE POLICY "Owners or admins view leads" ON public.property_leads
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins update leads" ON public.property_leads
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins delete leads" ON public.property_leads
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

-- Qualquer visitante (anônimo ou logado) pode inserir lead se a propriedade estiver publicada
CREATE POLICY "Anyone can submit lead to published property" ON public.property_leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sports_properties p
    WHERE p.id = property_leads.property_id AND p.is_published = true
  ));

-- ===== POLÍTICAS DE LEITURA PÚBLICA =====
-- Propriedades publicadas: qualquer um vê (campos limitados via select específico no front)
CREATE POLICY "Public can view published properties" ON public.sports_properties
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Cotas de propriedades publicadas
CREATE POLICY "Public can view tiers of published properties" ON public.sponsorship_tiers
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sports_properties p
    WHERE p.id = sponsorship_tiers.property_id AND p.is_published = true
  ));

-- tier_assets: público pode ler de cotas publicadas
CREATE POLICY "Public can view tier_assets of published" ON public.tier_assets
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.sponsorship_tiers t
    JOIN public.sports_properties p ON p.id = t.property_id
    WHERE t.id = tier_assets.tier_id AND p.is_published = true
  ));

-- tier_sales: público pode contar (sem dados sensíveis) — somente status/tier_id
CREATE POLICY "Public can view tier_sales of published" ON public.tier_sales
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.sponsorship_tiers t
    JOIN public.sports_properties p ON p.id = t.property_id
    WHERE t.id = tier_sales.tier_id AND p.is_published = true
  ));

-- Ativos vinculados a propriedade publicada (via asset_allocations)
CREATE POLICY "Public can view assets of published properties" ON public.assets
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.asset_allocations aa
    JOIN public.sports_properties p ON p.id = aa.property_id
    WHERE aa.asset_id = assets.id AND p.is_published = true
  ));

CREATE POLICY "Public can view asset_allocations of published" ON public.asset_allocations
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sports_properties p
    WHERE p.id = asset_allocations.property_id AND p.is_published = true
  ));

CREATE POLICY "Public can view asset_photos of published" ON public.asset_photos
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.asset_allocations aa
    JOIN public.sports_properties p ON p.id = aa.property_id
    WHERE aa.asset_id = asset_photos.asset_id AND p.is_published = true
  ));

-- Eventos da agenda também visíveis publicamente
CREATE POLICY "Public can view events of published properties" ON public.property_events
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sports_properties p
    WHERE p.id = property_events.property_id AND p.is_published = true
  ));

-- ===== TRIGGER: lead -> oportunidade =====
CREATE OR REPLACE FUNCTION public.handle_lead_to_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE TRIGGER trg_lead_to_opportunity
  BEFORE INSERT ON public.property_leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_lead_to_opportunity();