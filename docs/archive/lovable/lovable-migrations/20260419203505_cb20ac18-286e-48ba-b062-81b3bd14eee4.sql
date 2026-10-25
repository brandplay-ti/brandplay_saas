-- Enum de papéis
create type public.app_role as enum ('admin', 'comercial', 'patrocinador');

-- Tabela de perfis
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Tabela de papéis (separada por segurança)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- Função security definer (evita recursão de RLS)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users view own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins manage roles"
  on public.user_roles for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Função updated_at genérica
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger handle_new_user: cria profile + papel padrão "comercial"
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, company)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company', '')
  );
  insert into public.user_roles (user_id, role)
  values (new.id, 'comercial');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- Tabela de Propriedades Esportivas
create table public.sports_properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text not null,
  status text not null default 'ativo',
  start_date date,
  end_date date,
  audience_estimate integer,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sports_properties enable row level security;

create policy "Owners or admins view properties"
  on public.sports_properties for select
  to authenticated
  using (auth.uid() = owner_id or public.has_role(auth.uid(), 'admin'));

create policy "Users create own properties"
  on public.sports_properties for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners or admins update properties"
  on public.sports_properties for update
  to authenticated
  using (auth.uid() = owner_id or public.has_role(auth.uid(), 'admin'));

create policy "Owners or admins delete properties"
  on public.sports_properties for delete
  to authenticated
  using (auth.uid() = owner_id or public.has_role(auth.uid(), 'admin'));

create trigger sports_properties_updated_at
  before update on public.sports_properties
  for each row execute function public.update_updated_at_column();

create index idx_sports_properties_owner on public.sports_properties(owner_id);
create index idx_user_roles_user on public.user_roles(user_id);