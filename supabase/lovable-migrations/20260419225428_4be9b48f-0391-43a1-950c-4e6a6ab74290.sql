-- Enum status da parcela
create type public.installment_status as enum ('pendente', 'pago', 'atrasado', 'cancelado');

-- Tabela de parcelas
create table public.installments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  owner_id uuid not null,
  installment_number integer not null,
  total_installments integer not null default 1,
  amount numeric not null default 0,
  due_date date not null,
  paid_at date,
  paid_amount numeric,
  status public.installment_status not null default 'pendente',
  payment_method public.payment_method,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_installments_contract on public.installments(contract_id);
create index idx_installments_owner on public.installments(owner_id);
create index idx_installments_due_date on public.installments(due_date);
create index idx_installments_status on public.installments(status);

alter table public.installments enable row level security;

create policy "Owners or admins view installments"
  on public.installments for select to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));

create policy "Users create own installments"
  on public.installments for insert to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners or admins update installments"
  on public.installments for update to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));

create policy "Owners or admins delete installments"
  on public.installments for delete to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));

create trigger update_installments_updated_at
  before update on public.installments
  for each row execute function public.update_updated_at_column();

-- Função para gerar parcelas a partir de um contrato
create or replace function public.generate_contract_installments(_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  i integer;
  n_installments integer;
  base_date date;
  due_d integer;
  next_due date;
  per_value numeric;
  months_span integer;
begin
  select * into c from public.contracts where id = _contract_id;
  if not found then return; end if;

  -- Limpa parcelas pendentes existentes (mantém pagas)
  delete from public.installments where contract_id = _contract_id and status <> 'pago';

  base_date := coalesce(c.start_date, current_date);
  due_d := coalesce(c.due_day, extract(day from base_date)::int);

  if c.payment_method = 'a_vista' then
    n_installments := 1;
    per_value := c.total_value;
  elsif c.payment_method = 'parcelado' then
    n_installments := greatest(c.installments, 1);
    per_value := round(c.total_value / n_installments, 2);
  elsif c.payment_method = 'mensal' then
    if c.end_date is not null then
      months_span := greatest(
        (extract(year from c.end_date)::int - extract(year from base_date)::int) * 12
        + (extract(month from c.end_date)::int - extract(month from base_date)::int) + 1,
        1
      );
    else
      months_span := greatest(c.installments, 12);
    end if;
    n_installments := months_span;
    per_value := round(c.total_value / n_installments, 2);
  else
    -- personalizado: cria apenas 1 entrada inicial; usuário ajusta manualmente
    n_installments := 1;
    per_value := c.total_value;
  end if;

  for i in 1..n_installments loop
    if c.payment_method = 'a_vista' then
      next_due := base_date;
    else
      -- mês base + (i-1), aplicando dia de vencimento
      next_due := (date_trunc('month', base_date) + ((i - 1) || ' month')::interval)::date;
      -- ajusta para o dia de vencimento (limita ao último dia do mês)
      next_due := least(
        (next_due + ((due_d - 1) || ' day')::interval)::date,
        (date_trunc('month', next_due) + interval '1 month - 1 day')::date
      );
    end if;

    insert into public.installments (
      contract_id, owner_id, installment_number, total_installments,
      amount, due_date, payment_method,
      status
    ) values (
      c.id, c.owner_id, i, n_installments,
      per_value, next_due, c.payment_method,
      case when next_due < current_date then 'atrasado'::installment_status else 'pendente'::installment_status end
    );
  end loop;
end;
$$;

-- Trigger no contrato: ao virar 'ativo' (ou mudar dados financeiros estando ativo), regenera parcelas
create or replace function public.handle_contract_installments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'ativo') then
    perform public.generate_contract_installments(new.id);
  elsif (tg_op = 'UPDATE') then
    if (new.status = 'ativo' and old.status <> 'ativo') then
      perform public.generate_contract_installments(new.id);
    elsif (new.status = 'ativo' and (
      new.total_value <> old.total_value
      or new.installments <> old.installments
      or new.payment_method <> old.payment_method
      or coalesce(new.start_date, '1900-01-01') <> coalesce(old.start_date, '1900-01-01')
      or coalesce(new.end_date, '1900-01-01') <> coalesce(old.end_date, '1900-01-01')
      or coalesce(new.due_day, -1) <> coalesce(old.due_day, -1)
    )) then
      perform public.generate_contract_installments(new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_contracts_generate_installments
  after insert or update on public.contracts
  for each row execute function public.handle_contract_installments();

-- Função utilitária para marcar parcelas vencidas (chamada pela UI)
create or replace function public.mark_overdue_installments(_owner uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.installments
    set status = 'atrasado'
    where owner_id = _owner
      and status = 'pendente'
      and due_date < current_date;
$$;