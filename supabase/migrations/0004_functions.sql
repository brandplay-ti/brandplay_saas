-- 0004_functions.sql
-- Funções de suporte às políticas de RLS (0005_rls_policies.sql).
--
-- Modelo multi-tenant do BrandPlay (ver SCHEMA_NOTES.md e o corpo da tarefa
-- original para o raciocínio completo): um usuário pode pertencer a VÁRIAS
-- organizations (organization_members), e a organização "ativa" é apenas
-- estado de UI no frontend (localStorage / OrganizationSwitcher), não um
-- claim do JWT. Portanto as políticas de RLS não podem assumir "1 org ativa"
-- - elas devem permitir acesso a QUALQUER organização da qual o usuário seja
-- membro ativo. O filtro de "qual organização estou vendo agora" continua
-- sendo feito pelo frontend (`.eq('organization_id', activeOrgId)`).
--
-- IMPORTANTE - divergência documentada: o types.ts do projeto remoto lista
-- funções `is_org_member(_org_id, _user_id)` e
-- `has_org_role(_org_id, _roles org_role[], _user_id)` com _user_id como
-- parâmetro explícito (prováveis chamadas a partir de Edge Functions com
-- service role, passando o id do usuário manualmente). Neste schema
-- reconstruído, as funções usadas pelas POLICIES de RLS usam `auth.uid()`
-- internamente (padrão do projeto de referência indicado na tarefa), com
-- assinatura simplificada (apenas o org_id / roles como parâmetro). Isso é
-- proposital e mais seguro para uso em `USING`/`WITH CHECK` de RLS. Ver
-- SCHEMA_NOTES.md.

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'ativo'
  );
$$;

comment on function public.is_org_member(uuid) is
  'Retorna true se o usuário autenticado (auth.uid()) é membro ativo da organização informada. Usada como base de quase todas as policies de RLS (padrão "tenant por linha própria").';

create or replace function public.has_org_role(target_org_id uuid, allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'ativo'
      and om.role::text = any(allowed_roles)
  );
$$;

comment on function public.has_org_role(uuid, text[]) is
  'Retorna true se o usuário autenticado é membro ativo da organização informada E possui um dos papéis (org_role) listados em allowed_roles. Usada para restringir ações administrativas (ex.: convidar membros, editar dados da organização) a roles como owner/admin.';

-- ---------------------------------------------------------------------
-- Funções BÔNUS (não pedidas explicitamente no Passo 3, mas necessárias
-- para reproduzir o comportamento real da página pública "Media Kit"
-- (src/pages/PublicMediaKit.tsx), que faz leituras via client anônimo
-- (sem sessão) em sports_properties/property_media/sponsorship_tiers/
-- tier_sales/tier_assets/asset_allocations/assets/asset_photos/contracts/
-- sponsors filtrando por propriedade publicada). Ver SCHEMA_NOTES.md.
-- ---------------------------------------------------------------------

create or replace function public.is_property_published(target_property_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sports_properties p
    where p.id = target_property_id
      and p.is_published = true
  );
$$;

comment on function public.is_property_published(uuid) is
  'Bônus (media kit público): true se a propriedade esportiva está publicada (is_published). Usada em policies de SELECT para o público anônimo (role anon).';

create or replace function public.is_asset_publicly_visible(target_asset_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.asset_allocations aa
    where aa.asset_id = target_asset_id
      and public.is_property_published(aa.property_id)
  );
$$;

comment on function public.is_asset_publicly_visible(uuid) is
  'Bônus (media kit público): true se o asset está alocado a pelo menos uma propriedade publicada. Espelha o nome já usado internamente pelo projeto original (visto em Functions do types.ts).';

create or replace function public.is_tier_publicly_visible(target_tier_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sponsorship_tiers t
    where t.id = target_tier_id
      and public.is_property_published(t.property_id)
  );
$$;

comment on function public.is_tier_publicly_visible(uuid) is
  'Bônus (media kit público): true se o tier de patrocínio pertence a uma propriedade publicada. Usada para liberar leitura anônima de tier_sales/tier_assets/property_leads(insert).';

create or replace function public.is_sponsor_publicly_visible(target_sponsor_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contracts c
    where c.sponsor_id = target_sponsor_id
      and c.status in ('ativo', 'vencendo')
      and public.is_property_published(c.property_id)
  )
  or exists (
    select 1
    from public.tier_sales ts
    where ts.sponsor_id = target_sponsor_id
      and public.is_tier_publicly_visible(ts.tier_id)
  );
$$;

comment on function public.is_sponsor_publicly_visible(uuid) is
  'Bônus (media kit público): true se o patrocinador aparece em um contrato ativo/vencendo ou em uma venda de tier de uma propriedade publicada. Usada para liberar leitura anônima limitada (nome/logo) de sponsors.';

create or replace function public.has_sponsor_portal_access(target_sponsor_id uuid)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.sponsor_portal_access spa
    where spa.sponsor_id = target_sponsor_id
      and spa.user_id = auth.uid()
      and spa.status = 'ativo'
  );
$$;

comment on function public.has_sponsor_portal_access(uuid) is
  'Bônus (portal do patrocinador, role app_role=patrocinador): true se o usuário autenticado tem acesso concedido (sponsor_portal_access, status ativo) ao patrocinador informado. Espelha o nome da função has_sponsor_access já referenciada no types.ts original (Functions), usada para liberar leitura de contratos/entregas/parcelas/propostas do próprio patrocinador sem exigir organization_membership.';
