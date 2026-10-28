-- organization_brand_kits e organization_brand_assets nasceram em 0034,
-- depois do laço da 0026 que cria billing_access_restrictive. Sem a policy,
-- o teste (m) de cobranca.sql acusa as duas tabelas. O kit é dado da
-- organização: organização sem acesso não lê nem grava.

create policy billing_access_restrictive on public.organization_brand_kits
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));

create policy billing_access_restrictive on public.organization_brand_assets
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));
