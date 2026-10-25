-- Enums
create type public.sponsor_score as enum ('quente', 'morno', 'frio');
create type public.proposal_status as enum ('rascunho', 'enviada', 'aceita', 'recusada', 'expirada');

-- Patrocinadores (CRM avançado)
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  segment text,
  logo_path text,
  website text,
  score public.sponsor_score not null default 'morno',
  tags text[] not null default '{}',
  last_contact_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sponsors_owner on public.sponsors(owner_id);
alter table public.sponsors enable row level security;
create policy "Owners or admins view sponsors" on public.sponsors for select to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));
create policy "Users create own sponsors" on public.sponsors for insert to authenticated
  with check (auth.uid() = owner_id);
create policy "Owners or admins update sponsors" on public.sponsors for update to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));
create policy "Owners or admins delete sponsors" on public.sponsors for delete to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));
create trigger update_sponsors_updated_at before update on public.sponsors
  for each row execute function public.update_updated_at_column();

-- Contatos do patrocinador
create table public.sponsor_contacts (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_sponsor_contacts_sponsor on public.sponsor_contacts(sponsor_id);
alter table public.sponsor_contacts enable row level security;
create policy "Manage contacts of own sponsors" on public.sponsor_contacts for all to authenticated
  using (exists (select 1 from public.sponsors s where s.id = sponsor_contacts.sponsor_id and (s.owner_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))))
  with check (exists (select 1 from public.sponsors s where s.id = sponsor_contacts.sponsor_id and (s.owner_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))));

-- Propostas
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  sponsor_id uuid references public.sponsors(id) on delete set null,
  property_id uuid references public.sports_properties(id) on delete set null,
  brand text,
  proposal_number text,
  title text not null,
  message text,
  total_value numeric not null default 0,
  status public.proposal_status not null default 'rascunho',
  valid_until date,
  pdf_path text,
  sent_at timestamptz,
  decided_at timestamptz,
  converted_opportunity_id uuid references public.opportunities(id) on delete set null,
  converted_contract_id uuid references public.contracts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_proposals_owner on public.proposals(owner_id);
create index idx_proposals_sponsor on public.proposals(sponsor_id);
create index idx_proposals_status on public.proposals(status);
alter table public.proposals enable row level security;
create policy "Owners or admins view proposals" on public.proposals for select to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));
create policy "Users create own proposals" on public.proposals for insert to authenticated
  with check (auth.uid() = owner_id);
create policy "Owners or admins update proposals" on public.proposals for update to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));
create policy "Owners or admins delete proposals" on public.proposals for delete to authenticated
  using ((auth.uid() = owner_id) or has_role(auth.uid(), 'admin'::app_role));
create trigger update_proposals_updated_at before update on public.proposals
  for each row execute function public.update_updated_at_column();

-- Itens da proposta
create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  name text not null,
  description text,
  quantity integer not null default 1,
  unit_value numeric not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_proposal_items_proposal on public.proposal_items(proposal_id);
alter table public.proposal_items enable row level security;
create policy "Manage items of own proposals" on public.proposal_items for all to authenticated
  using (exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and (p.owner_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))))
  with check (exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and (p.owner_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))));

-- Vincular sponsor em opportunities e contracts (opcional)
alter table public.opportunities add column if not exists sponsor_id uuid references public.sponsors(id) on delete set null;
alter table public.contracts add column if not exists sponsor_id uuid references public.sponsors(id) on delete set null;

-- Buckets
insert into storage.buckets (id, name, public) values ('sponsor-logos', 'sponsor-logos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('proposals', 'proposals', false) on conflict (id) do nothing;

-- Storage policies sponsor-logos (público leitura, upload pelo dono)
create policy "Public read sponsor logos" on storage.objects for select
  using (bucket_id = 'sponsor-logos');
create policy "Users upload own sponsor logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'sponsor-logos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users update own sponsor logos" on storage.objects for update to authenticated
  using (bucket_id = 'sponsor-logos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users delete own sponsor logos" on storage.objects for delete to authenticated
  using (bucket_id = 'sponsor-logos' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies proposals (privado, só o dono)
create policy "Users read own proposal pdfs" on storage.objects for select to authenticated
  using (bucket_id = 'proposals' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users upload own proposal pdfs" on storage.objects for insert to authenticated
  with check (bucket_id = 'proposals' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users update own proposal pdfs" on storage.objects for update to authenticated
  using (bucket_id = 'proposals' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users delete own proposal pdfs" on storage.objects for delete to authenticated
  using (bucket_id = 'proposals' and auth.uid()::text = (storage.foldername(name))[1]);