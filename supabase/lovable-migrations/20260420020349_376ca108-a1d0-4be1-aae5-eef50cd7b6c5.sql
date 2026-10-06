
-- =========================================================
-- 1. Tabela: sponsor_portal_access
-- =========================================================
create table public.sponsor_portal_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  status text not null default 'ativo' check (status in ('convidado','ativo','bloqueado')),
  granted_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sponsor_id)
);

create index idx_sponsor_portal_access_user on public.sponsor_portal_access(user_id);
create index idx_sponsor_portal_access_sponsor on public.sponsor_portal_access(sponsor_id);

alter table public.sponsor_portal_access enable row level security;

create trigger trg_sponsor_portal_access_updated
before update on public.sponsor_portal_access
for each row execute function public.update_updated_at_column();

-- Função security definer para evitar recursão em RLS
create or replace function public.has_sponsor_access(_user_id uuid, _sponsor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sponsor_portal_access
    where user_id = _user_id
      and sponsor_id = _sponsor_id
      and status = 'ativo'
  )
$$;

-- Função para listar sponsors que o usuário tem acesso (usada em RLS)
create or replace function public.user_sponsor_ids(_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select sponsor_id from public.sponsor_portal_access
  where user_id = _user_id and status = 'ativo'
$$;

-- RLS: dono comercial gerencia; patrocinador vê o próprio acesso
create policy "Owner manages portal access"
on public.sponsor_portal_access for all
to authenticated
using (
  exists (
    select 1 from public.sponsors s
    where s.id = sponsor_portal_access.sponsor_id
      and (s.owner_id = auth.uid() or has_role(auth.uid(),'admin'::app_role))
  )
)
with check (
  exists (
    select 1 from public.sponsors s
    where s.id = sponsor_portal_access.sponsor_id
      and (s.owner_id = auth.uid() or has_role(auth.uid(),'admin'::app_role))
  )
);

create policy "Sponsor sees own access"
on public.sponsor_portal_access for select
to authenticated
using (user_id = auth.uid());

-- =========================================================
-- 2. Tabela: sponsor_invites
-- =========================================================
create table public.sponsor_invites (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  email text not null,
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  status text not null default 'pendente' check (status in ('pendente','aceito','expirado','cancelado')),
  invited_by uuid not null,
  accepted_user_id uuid,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create index idx_sponsor_invites_token on public.sponsor_invites(token);
create index idx_sponsor_invites_email on public.sponsor_invites(email);

alter table public.sponsor_invites enable row level security;

create policy "Owner manages invites"
on public.sponsor_invites for all
to authenticated
using (
  exists (
    select 1 from public.sponsors s
    where s.id = sponsor_invites.sponsor_id
      and (s.owner_id = auth.uid() or has_role(auth.uid(),'admin'::app_role))
  )
)
with check (
  exists (
    select 1 from public.sponsors s
    where s.id = sponsor_invites.sponsor_id
      and (s.owner_id = auth.uid() or has_role(auth.uid(),'admin'::app_role))
  )
);

-- Permite buscar convite pelo token (usado em /portal/aceitar) — sem auth
create policy "Public can read invite by token"
on public.sponsor_invites for select
to anon, authenticated
using (true);

-- =========================================================
-- 3. Tabela: delivery_approval_log
-- =========================================================
create table public.delivery_approval_log (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  decided_by uuid not null,
  decided_by_role text not null check (decided_by_role in ('comercial','patrocinador')),
  decision public.delivery_approval not null,
  comment text,
  created_at timestamptz not null default now()
);

create index idx_delivery_approval_log_delivery on public.delivery_approval_log(delivery_id);

alter table public.delivery_approval_log enable row level security;

create policy "Owner views approval log"
on public.delivery_approval_log for select
to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_approval_log.delivery_id
      and (d.owner_id = auth.uid() or has_role(auth.uid(),'admin'::app_role))
  )
);

create policy "Sponsor views own approval log"
on public.delivery_approval_log for select
to authenticated
using (
  exists (
    select 1 from public.deliveries d
    join public.contracts c on c.opportunity_id = d.opportunity_id or c.id = d.opportunity_id
    where d.id = delivery_approval_log.delivery_id
      and c.sponsor_id is not null
      and public.has_sponsor_access(auth.uid(), c.sponsor_id)
  )
);

create policy "Authenticated insert approval log"
on public.delivery_approval_log for insert
to authenticated
with check (decided_by = auth.uid());

-- =========================================================
-- 4. Adicionar policies de leitura para patrocinador
-- =========================================================

-- Sponsors: patrocinador vê o próprio cadastro
create policy "Sponsor portal user views own sponsor"
on public.sponsors for select
to authenticated
using (public.has_sponsor_access(auth.uid(), id));

-- Contracts: patrocinador vê contratos do seu sponsor
create policy "Sponsor portal user views own contracts"
on public.contracts for select
to authenticated
using (
  sponsor_id is not null
  and public.has_sponsor_access(auth.uid(), sponsor_id)
);

-- Installments: patrocinador vê parcelas dos contratos do seu sponsor
create policy "Sponsor portal user views own installments"
on public.installments for select
to authenticated
using (
  exists (
    select 1 from public.contracts c
    where c.id = installments.contract_id
      and c.sponsor_id is not null
      and public.has_sponsor_access(auth.uid(), c.sponsor_id)
  )
);

-- Deliveries: patrocinador vê entregas dos contratos do seu sponsor
create policy "Sponsor portal user views own deliveries"
on public.deliveries for select
to authenticated
using (
  exists (
    select 1 from public.contracts c
    where c.sponsor_id is not null
      and public.has_sponsor_access(auth.uid(), c.sponsor_id)
      and (c.opportunity_id = deliveries.opportunity_id or c.brand = deliveries.brand)
  )
);

-- Deliveries UPDATE: patrocinador atualiza somente aprovação/comentário
create policy "Sponsor portal user updates approval"
on public.deliveries for update
to authenticated
using (
  exists (
    select 1 from public.contracts c
    where c.sponsor_id is not null
      and public.has_sponsor_access(auth.uid(), c.sponsor_id)
      and (c.opportunity_id = deliveries.opportunity_id or c.brand = deliveries.brand)
  )
)
with check (
  exists (
    select 1 from public.contracts c
    where c.sponsor_id is not null
      and public.has_sponsor_access(auth.uid(), c.sponsor_id)
      and (c.opportunity_id = deliveries.opportunity_id or c.brand = deliveries.brand)
  )
);

-- Sports properties: patrocinador vê propriedades vinculadas via contratos
create policy "Sponsor portal user views linked properties"
on public.sports_properties for select
to authenticated
using (
  exists (
    select 1 from public.contracts c
    where c.property_id = sports_properties.id
      and c.sponsor_id is not null
      and public.has_sponsor_access(auth.uid(), c.sponsor_id)
  )
);

-- Property media: patrocinador vê mídias das propriedades vinculadas
create policy "Sponsor portal user views linked media"
on public.property_media for select
to authenticated
using (
  exists (
    select 1 from public.contracts c
    where c.property_id = property_media.property_id
      and c.sponsor_id is not null
      and public.has_sponsor_access(auth.uid(), c.sponsor_id)
  )
);

-- Contract clauses (patrocinador vê)
create policy "Sponsor portal user views contract clauses"
on public.contract_clauses for select
to authenticated
using (
  exists (
    select 1 from public.contracts c
    where c.id = contract_clauses.contract_id
      and c.sponsor_id is not null
      and public.has_sponsor_access(auth.uid(), c.sponsor_id)
  )
);

-- Contract assets (patrocinador vê)
create policy "Sponsor portal user views contract assets"
on public.contract_assets for select
to authenticated
using (
  exists (
    select 1 from public.contracts c
    where c.id = contract_assets.contract_id
      and c.sponsor_id is not null
      and public.has_sponsor_access(auth.uid(), c.sponsor_id)
  )
);
