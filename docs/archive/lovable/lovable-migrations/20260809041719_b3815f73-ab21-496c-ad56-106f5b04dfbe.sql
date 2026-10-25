ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'quinzenal';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'bimestral';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'trimestral';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'semestral';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'anual';

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS custom_due_dates date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS due_days integer;

CREATE OR REPLACE FUNCTION public.generate_contract_installments(_contract_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record;
  i integer;
  n_installments integer;
  base_date date;
  due_d integer;
  next_due date;
  per_value numeric;
  months_span integer;
  step_months integer;
  step_days integer;
  dates date[];
begin
  select * into c from public.contracts where id = _contract_id;
  if not found then return; end if;

  delete from public.installments where contract_id = _contract_id and status <> 'pago';

  base_date := coalesce(c.start_date, current_date);
  if c.due_days is not null and c.due_days > 0 then
    base_date := base_date + (c.due_days || ' day')::interval;
  end if;
  due_d := coalesce(c.due_day, extract(day from base_date)::int);

  dates := coalesce(c.custom_due_dates, '{}'::date[]);

  -- Datas manuais têm prioridade
  if array_length(dates, 1) is not null and array_length(dates, 1) > 0 then
    n_installments := array_length(dates, 1);
    per_value := round(c.total_value / n_installments, 2);
    for i in 1..n_installments loop
      insert into public.installments (
        contract_id, owner_id, installment_number, total_installments,
        amount, due_date, payment_method, status
      ) values (
        c.id, c.owner_id, i, n_installments,
        per_value, dates[i], c.payment_method,
        case when dates[i] < current_date then 'atrasado'::installment_status else 'pendente'::installment_status end
      );
    end loop;
    return;
  end if;

  step_months := 1;
  step_days := 0;

  if c.payment_method = 'a_vista' then
    n_installments := 1;
    per_value := c.total_value;
  elsif c.payment_method = 'parcelado' then
    n_installments := greatest(c.installments, 1);
    per_value := round(c.total_value / n_installments, 2);
  elsif c.payment_method in ('mensal','bimestral','trimestral','semestral','anual') then
    step_months := case c.payment_method
      when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3
      when 'semestral' then 6 else 12 end;
    if c.end_date is not null then
      months_span := greatest(
        (extract(year from c.end_date)::int - extract(year from base_date)::int) * 12
        + (extract(month from c.end_date)::int - extract(month from base_date)::int) + 1,
        1
      );
      n_installments := greatest(ceil(months_span::numeric / step_months)::int, 1);
    else
      n_installments := greatest(c.installments, 1);
    end if;
    per_value := round(c.total_value / n_installments, 2);
  elsif c.payment_method = 'quinzenal' then
    step_days := 15;
    n_installments := greatest(c.installments, 1);
    if c.end_date is not null then
      n_installments := greatest(((c.end_date - base_date) / 15) + 1, 1);
    end if;
    per_value := round(c.total_value / n_installments, 2);
  else
    n_installments := 1;
    per_value := c.total_value;
  end if;

  for i in 1..n_installments loop
    if c.payment_method = 'a_vista' then
      next_due := base_date;
    elsif step_days > 0 then
      next_due := base_date + ((i - 1) * step_days || ' day')::interval;
    else
      next_due := (date_trunc('month', base_date) + (((i - 1) * step_months) || ' month')::interval)::date;
      next_due := least(
        (next_due + ((due_d - 1) || ' day')::interval)::date,
        (date_trunc('month', next_due) + interval '1 month - 1 day')::date
      );
    end if;

    insert into public.installments (
      contract_id, owner_id, installment_number, total_installments,
      amount, due_date, payment_method, status
    ) values (
      c.id, c.owner_id, i, n_installments,
      per_value, next_due, c.payment_method,
      case when next_due < current_date then 'atrasado'::installment_status else 'pendente'::installment_status end
    );
  end loop;
end;
$function$;