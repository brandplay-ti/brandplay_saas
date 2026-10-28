-- Catálogo global de ativos
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  category text not null,
  unit_value numeric not null default 0,
  quantity integer not null default 1,
  status text not null default 'ativo',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_assets_owner on public.assets(owner_id);
create index idx_assets_category on public.assets(category);

alter table public.assets enable row level security;

create policy "Owners or admins view assets"
  on public.assets for select to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));
create policy "Users create own assets"
  on public.assets for insert to authenticated
  with check (auth.uid() = owner_id);
create policy "Owners or admins update assets"
  on public.assets for update to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));
create policy "Owners or admins delete assets"
  on public.assets for delete to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));

create trigger update_assets_updated_at
  before update on public.assets
  for each row execute function public.update_updated_at_column();

-- Alocação ativo ↔ propriedade
create table public.asset_allocations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  property_id uuid not null references public.sports_properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(asset_id, property_id)
);

create index idx_asset_allocations_asset on public.asset_allocations(asset_id);
create index idx_asset_allocations_property on public.asset_allocations(property_id);

alter table public.asset_allocations enable row level security;

create policy "Manage allocations of own assets"
  on public.asset_allocations for all to authenticated
  using (exists (select 1 from public.assets a where a.id = asset_allocations.asset_id and (a.owner_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))))
  with check (exists (select 1 from public.assets a where a.id = asset_allocations.asset_id and (a.owner_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))));

-- Fotos do ativo (galeria múltipla)
create table public.asset_photos (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  storage_path text not null,
  is_cover boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_asset_photos_asset on public.asset_photos(asset_id);

alter table public.asset_photos enable row level security;

create policy "Manage photos of own assets"
  on public.asset_photos for all to authenticated
  using (exists (select 1 from public.assets a where a.id = asset_photos.asset_id and (a.owner_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))))
  with check (exists (select 1 from public.assets a where a.id = asset_photos.asset_id and (a.owner_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))));

-- Bucket público para fotos de ativos
insert into storage.buckets (id, name, public) values ('asset-photos', 'asset-photos', true)
on conflict (id) do nothing;

create policy "Public read asset photos"
  on storage.objects for select
  using (bucket_id = 'asset-photos');

create policy "Users upload own asset photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'asset-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users update own asset photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'asset-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users delete own asset photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'asset-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- Vincula contract_assets ao catálogo (opcional)
alter table public.contract_assets add column if not exists asset_id uuid references public.assets(id) on delete set null;

-- Geração automática de entregas a partir dos ativos do contrato (ao virar Ativo)
create or replace function public.generate_contract_deliveries(_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  ca record;
  exists_count integer;
begin
  select * into c from public.contracts where id = _contract_id;
  if not found then return; end if;

  for ca in select * from public.contract_assets where contract_id = _contract_id loop
    -- evita duplicar: pula se já existe entrega vinculada a este contrato com mesmo título
    select count(*) into exists_count
      from public.deliveries
      where opportunity_id is not distinct from c.opportunity_id
        and owner_id = c.owner_id
        and brand = c.brand
        and title = ca.name;
    if exists_count = 0 then
      insert into public.deliveries (
        owner_id, brand, property_id, opportunity_id,
        title, description, asset_type, quantity,
        due_date, status, approval, position
      ) values (
        c.owner_id, c.brand, c.property_id, c.opportunity_id,
        ca.name, ca.notes, 'ativo_contratado', greatest(ca.quantity, 1),
        coalesce(c.end_date, c.start_date, current_date),
        'pendente'::delivery_status, 'pendente'::delivery_approval, 0
      );
    end if;
  end loop;
end;
$$;

create or replace function public.handle_contract_deliveries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'ativo') then
    perform public.generate_contract_deliveries(new.id);
  elsif (tg_op = 'UPDATE' and new.status = 'ativo' and old.status <> 'ativo') then
    perform public.generate_contract_deliveries(new.id);
  end if;
  return new;
end;
$$;

create trigger trg_contracts_generate_deliveries
  after insert or update on public.contracts
  for each row execute function public.handle_contract_deliveries();