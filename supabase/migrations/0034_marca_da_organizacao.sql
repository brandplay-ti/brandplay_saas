-- Kit de marca da organização: cores e logos que entram nos relatórios.
--
-- Sem linha em organization_brand_kits, o gerador usa a paleta BrandPlay
-- (#6206C8 e #2962FF) e, para o logo, organizations.logo_path.
-- As seis peças são incentivadas na tela e opcionais no banco: dá para
-- publicar relatório com um arquivo só. A ordem de escolha fica no gerador
-- (horizontal, depois a versão do fundo, depois o logo único).
--
-- Escrita só de owner/admin. Leitura de qualquer membro ativo. Quem não é
-- membro não vê a linha (RLS). O arquivo mora em org-logos/{org_id}/marca/,
-- no mesmo bucket do logo único, cujo prefixo já é a organização.

create table public.organization_brand_kits (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  primary_hex text not null default '#6206C8',
  secondary_hex text not null default '#2962FF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_brand_kits_primary_hex_check check (primary_hex ~ '^#[0-9A-Fa-f]{6}$'),
  constraint organization_brand_kits_secondary_hex_check check (secondary_hex ~ '^#[0-9A-Fa-f]{6}$')
);

comment on table public.organization_brand_kits is
  'Cores da organização para relatórios e para o acento do painel. Ausência da linha = paleta BrandPlay.';

create table public.organization_brand_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_brand_assets_kind_check check (
    kind in ('horizontal', 'vertical', 'icone', 'sem_fundo', 'clara', 'escura')
  ),
  constraint organization_brand_assets_org_kind_unique unique (organization_id, kind)
);

comment on table public.organization_brand_assets is
  'Peças de logo da organização. kind: horizontal, vertical, icone, sem_fundo, clara, escura.';

create trigger organization_brand_kits_updated_at
  before update on public.organization_brand_kits
  for each row execute function public.update_updated_at_column();

create trigger organization_brand_assets_updated_at
  before update on public.organization_brand_assets
  for each row execute function public.update_updated_at_column();

alter table public.organization_brand_kits enable row level security;
alter table public.organization_brand_assets enable row level security;

create policy organization_brand_kits_select on public.organization_brand_kits
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy organization_brand_kits_write on public.organization_brand_kits
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy organization_brand_assets_select on public.organization_brand_assets
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy organization_brand_assets_write on public.organization_brand_assets
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

revoke all on public.organization_brand_kits, public.organization_brand_assets from anon, authenticated;
grant select, insert, update, delete on public.organization_brand_kits, public.organization_brand_assets to authenticated;
grant all on public.organization_brand_kits, public.organization_brand_assets to service_role;
