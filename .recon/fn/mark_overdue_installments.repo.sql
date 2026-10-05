CREATE OR REPLACE FUNCTION public.mark_overdue_installments(_owner uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if _owner is distinct from auth.uid() then
    raise exception 'mark_overdue_installments: _owner deve corresponder ao usuário autenticado (auth.uid())';
  end if;

  update public.installments
  set status = 'atrasado', updated_at = now()
  where status = 'pendente'
    and due_date < current_date;
end;
$function$

