CREATE OR REPLACE FUNCTION public.mark_overdue_installments(_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND _owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed to update installments for another user';
  END IF;

  UPDATE public.installments
    SET status = 'atrasado'
    WHERE owner_id = _owner
      AND status = 'pendente'
      AND due_date < current_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_overdue_installments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_overdue_installments(uuid) TO authenticated, service_role;