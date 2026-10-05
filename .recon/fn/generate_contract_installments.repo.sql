CREATE OR REPLACE FUNCTION public.generate_contract_installments(_contract_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _c record;
  _n integer;
  _total numeric(14,2);
  _first_due date;
  _step interval;
  _i integer;
  _due date;
  _amount numeric(14,2);
  _sum numeric(14,2) := 0;
  _dates text[];
begin
  select id, organization_id, owner_id, sponsor_id, payment_method, use_flat_value, flat_value,
         total_value, installments, due_day, due_days, custom_due_dates, start_date
  into _c
  from public.contracts
  where id = _contract_id;

  if not found then
    raise exception 'generate_contract_installments: contrato % não encontrado', _contract_id;
  end if;

  if exists (select 1 from public.installments where contract_id = _contract_id) then
    return; -- idempotente: nunca gera parcelas duplicadas para o mesmo contrato.
  end if;

  _total := case when _c.use_flat_value then coalesce(_c.flat_value, 0) else coalesce(_c.total_value, 0) end;
  _dates := array_remove(coalesce(_c.custom_due_dates, '{}'::text[]), null);

  if coalesce(array_length(_dates, 1), 0) > 0 then
    -- Datas manuais substituem o cálculo automático por completo: uma
    -- parcela por data informada (PaymentScheduleFields.tsx).
    _n := array_length(_dates, 1);
    for _i in 1.._n loop
      if _i = _n then
        _amount := _total - _sum;
      else
        _amount := round(_total / _n, 2);
        _sum := _sum + _amount;
      end if;
      insert into public.installments (
        organization_id, owner_id, contract_id, sponsor_id, installment_number,
        total_installments, amount, due_date, status, payment_method
      ) values (
        _c.organization_id, _c.owner_id, _c.id, _c.sponsor_id, _i,
        _n, _amount, _dates[_i]::date, 'pendente', _c.payment_method
      );
    end loop;
    return;
  end if;

  _n := case when _c.payment_method = 'a_vista' then 1 else greatest(coalesce(_c.installments, 1), 1) end;

  if _c.due_day is not null then
    _first_due := date_trunc('month', coalesce(_c.start_date, current_date))::date + (_c.due_day - 1);
    if _c.start_date is not null and _first_due < _c.start_date then
      _first_due := (date_trunc('month', _c.start_date) + interval '1 month')::date + (_c.due_day - 1);
    end if;
  elsif _c.due_days is not null then
    _first_due := coalesce(_c.start_date, current_date) + _c.due_days;
  else
    _first_due := coalesce(_c.start_date, current_date);
  end if;

  _step := case _c.payment_method
    when 'quinzenal' then interval '15 days'
    when 'bimestral' then interval '2 months'
    when 'trimestral' then interval '3 months'
    when 'semestral' then interval '6 months'
    when 'anual' then interval '12 months'
    else interval '1 month' -- mensal, parcelado, personalizado (sem datas manuais)
  end;

  for _i in 1.._n loop
    _due := (_first_due + (_step * (_i - 1)))::date;
    if _i = _n then
      _amount := _total - _sum;
    else
      _amount := round(_total / _n, 2);
      _sum := _sum + _amount;
    end if;
    insert into public.installments (
      organization_id, owner_id, contract_id, sponsor_id, installment_number,
      total_installments, amount, due_date, status, payment_method
    ) values (
      _c.organization_id, _c.owner_id, _c.id, _c.sponsor_id, _i,
      _n, _amount, _due, 'pendente', _c.payment_method
    );
  end loop;
end;
$function$

