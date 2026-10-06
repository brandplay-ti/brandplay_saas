ALTER TABLE public.property_checklist_items
  ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES public.sponsors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pci_sponsor ON public.property_checklist_items(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_pci_opportunity ON public.property_checklist_items(opportunity_id);