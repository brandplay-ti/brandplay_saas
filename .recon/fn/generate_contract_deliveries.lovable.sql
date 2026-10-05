CREATE OR REPLACE FUNCTION public.generate_contract_deliveries(_contract_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record;
  ca record;
  exists_count integer;
  total_assets integer;
  idx integer := 0;
  base_date date;
  end_date date;
  span_days integer;
  proportional_due date;
begin
  select * into c from public.contracts where id = _contract_id;
  if not found then return; end if;

  base_date := coalesce(c.start_date, current_date);
  end_date := coalesce(c.end_date, base_date);
  span_days := greatest(end_date - base_date, 0);

  select count(*) into total_assets from public.contract_assets where contract_id = _contract_id;

  for ca in select * from public.contract_assets where contract_id = _contract_id order by created_at, id loop
    -- evita duplicar: pula se já existe entrega vinculada a este contrato com mesmo título e oportunidade
    select count(*) into exists_count
      from public.deliveries
      where opportunity_id is not distinct from c.opportunity_id
        and contract_id is not distinct from c.id
        and title = ca.name;

    if exists_count = 0 then
      if total_assets > 1 then
        proportional_due := base_date + ((span_days * idx) / (total_assets - 1))::integer;
      else
        proportional_due := end_date;
      end if;

      insert into public.deliveries (
        owner_id, organization_id, brand, property_id, opportunity_id, contract_id,
        title, description, asset_type, quantity,
        due_date, status, approval, position
      ) values (
        c.owner_id, c.organization_id, c.brand, c.property_id, c.opportunity_id, c.id,
        ca.name, ca.notes, 'ativo_contratado', greatest(coalesce(ca.quantity, 1), 1),
        proportional_due, 'pendente'::delivery_status, 'pendente'::delivery_approval, idx
      );
    end if;
    idx := idx + 1;
  end loop;
end;
$function$

