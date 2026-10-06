CREATE OR REPLACE FUNCTION public.tg_set_proposal_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS set_proposal_number ON public.proposals;
CREATE TRIGGER set_proposal_number
BEFORE INSERT ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.tg_set_proposal_number();

WITH missing AS (
  SELECT p.id,
         to_char(p.created_at, 'YYYY') AS yr,
         p.organization_id,
         row_number() OVER (PARTITION BY p.organization_id, to_char(p.created_at, 'YYYY') ORDER BY p.created_at) AS rn
  FROM public.proposals p
  WHERE p.proposal_number IS NULL OR btrim(p.proposal_number) = ''
), base AS (
  SELECT organization_id, to_char(created_at, 'YYYY') AS yr,
         COALESCE(MAX((split_part(proposal_number, '-', 2))::int), 0) AS maxseq
  FROM public.proposals
  WHERE proposal_number ~ '^[0-9]{4}-[0-9]+$'
  GROUP BY organization_id, to_char(created_at, 'YYYY')
)
UPDATE public.proposals p
SET proposal_number = m.yr || '-' || lpad((COALESCE(b.maxseq, 0) + m.rn)::text, 4, '0')
FROM missing m
LEFT JOIN base b ON b.organization_id IS NOT DISTINCT FROM m.organization_id AND b.yr = m.yr
WHERE p.id = m.id;