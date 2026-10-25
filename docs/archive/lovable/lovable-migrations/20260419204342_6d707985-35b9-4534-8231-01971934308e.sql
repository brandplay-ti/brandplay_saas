-- Enum for pipeline stages
create type public.opportunity_stage as enum (
  'prospect',
  'reuniao',
  'proposta_enviada',
  'negociacao',
  'fechado',
  'perdido'
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  property_id uuid references public.sports_properties(id) on delete set null,
  brand text not null,
  value numeric(14,2) not null default 0,
  stage public.opportunity_stage not null default 'prospect',
  expected_close_date date,
  notes text,
  position integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.opportunities enable row level security;

create policy "Owners or admins view opportunities"
  on public.opportunities for select
  to authenticated
  using (auth.uid() = owner_id or public.has_role(auth.uid(), 'admin'));

create policy "Users create own opportunities"
  on public.opportunities for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners or admins update opportunities"
  on public.opportunities for update
  to authenticated
  using (auth.uid() = owner_id or public.has_role(auth.uid(), 'admin'));

create policy "Owners or admins delete opportunities"
  on public.opportunities for delete
  to authenticated
  using (auth.uid() = owner_id or public.has_role(auth.uid(), 'admin'));

create trigger update_opportunities_updated_at
  before update on public.opportunities
  for each row execute function public.update_updated_at_column();

create index idx_opportunities_owner_stage on public.opportunities(owner_id, stage, position);
create index idx_opportunities_property on public.opportunities(property_id);