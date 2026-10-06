-- Cotas de patrocínio por propriedade
CREATE TABLE public.sponsorship_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.sports_properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  level text NOT NULL DEFAULT 'custom',
  value numeric NOT NULL DEFAULT 0,
  total_slots integer NOT NULL DEFAULT 1,
  description text,
  benefits text,
  color text DEFAULT '#64748b',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sponsorship_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners or admins view tiers" ON public.sponsorship_tiers
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users create own tiers" ON public.sponsorship_tiers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners or admins update tiers" ON public.sponsorship_tiers
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins delete tiers" ON public.sponsorship_tiers
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sponsorship_tiers_updated_at
  BEFORE UPDATE ON public.sponsorship_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ativos inclusos em cada cota
CREATE TABLE public.tier_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.sponsorship_tiers(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_id, asset_id)
);

ALTER TABLE public.tier_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage assets of own tiers" ON public.tier_assets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sponsorship_tiers t WHERE t.id = tier_assets.tier_id AND (t.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sponsorship_tiers t WHERE t.id = tier_assets.tier_id AND (t.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- Vendas de cotas (vínculo cota -> patrocinador/contrato)
CREATE TABLE public.tier_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.sponsorship_tiers(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  sponsor_id uuid REFERENCES public.sponsors(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  brand text,
  status text NOT NULL DEFAULT 'reservada',
  sold_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tier_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners or admins view tier sales" ON public.tier_sales
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users create own tier sales" ON public.tier_sales
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners or admins update tier sales" ON public.tier_sales
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins delete tier sales" ON public.tier_sales
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

-- Eventos / agenda da propriedade
CREATE TABLE public.property_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.sports_properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'jogo',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text,
  status text NOT NULL DEFAULT 'agendado',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners or admins view events" ON public.property_events
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users create own events" ON public.property_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners or admins update events" ON public.property_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins delete events" ON public.property_events
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_property_events_updated_at
  BEFORE UPDATE ON public.property_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Coluna opcional para vincular propriedades em "edições" (histórico de temporadas)
ALTER TABLE public.sports_properties
  ADD COLUMN parent_property_id uuid REFERENCES public.sports_properties(id) ON DELETE SET NULL,
  ADD COLUMN season_year integer;

CREATE INDEX idx_sports_properties_parent ON public.sports_properties(parent_property_id);
CREATE INDEX idx_sponsorship_tiers_property ON public.sponsorship_tiers(property_id);
CREATE INDEX idx_tier_assets_tier ON public.tier_assets(tier_id);
CREATE INDEX idx_tier_sales_tier ON public.tier_sales(tier_id);
CREATE INDEX idx_property_events_property ON public.property_events(property_id);
CREATE INDEX idx_property_events_starts ON public.property_events(starts_at);