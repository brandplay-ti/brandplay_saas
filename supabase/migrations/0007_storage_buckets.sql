-- 0007_storage_buckets.sql
-- Recria os 11 buckets de Storage identificados em supabase/migrations/SCHEMA_NOTES.md
-- (seção "Buckets de Storage"), confirmados via grep em src/ e supabase/functions/
-- (não são suposição de nome — todo `supabase.storage.from("...")` do projeto foi
-- localizado antes de escrever esta migration). RLS em storage.objects segue o
-- MESMO padrão de 0005_rls_policies.sql: nunca confiar no path por si só sem
-- confirmar, contra a tabela de negócio dona do recurso, que o usuário é membro
-- da organização dona daquele recurso.
--
-- Convenção de path observada por bucket (a policy só existe porque isso foi
-- confirmado lendo o código, não adivinhado):
--   asset-photos        {user_id}/{asset_id}/{arquivo}              (Assets.tsx)
--   property-media      {user_id}/{property_id}/{arquivo}           (PropertyMediaGallery.tsx)
--   sponsor-logos       {user_id}/brandtrack-expected/{brand_id}-{uuid}.{ext} (BrandTrackExpectedBrands.tsx)
--   org-logos           {org_id}/logo-{ts}.{ext}                    (OrganizationForm.tsx)
--   delivery-evidence   {org_id}/checklist-{item_id}/{ts}.jpg        (FieldEventChecklist.tsx)
--   contracts           {user_id}/{contract_id}-{ts}.{ext}          (Contracts.tsx, upload manual)
--                        {user_id}/{contract_id}/contrato-{ts}.pdf   (generate-contract-pdf, gerado)
--   proposals           {user_id}/{proposal_id}/proposta-{ts}.pdf   (generate-proposal-pdf, gerado)
--   opportunity-comments {org_id}/{opp_id}/{comment_id}/{arquivo}   (OpportunityDrawer.tsx)
--   sponsor-documents   {org_id}/{sponsor_id}/{arquivo}             (SponsorDocumentsPanel.tsx)
--   sponsor-interactions {sponsor_id}/{arquivo}                     (SponsorTimeline.tsx)
--   brandtrack-media    {user_id}/{arquivo}                          (BrandTrackUploads.tsx — SEM id de recurso no path)
--
-- Público (bucket public=true, leitura de anon feita pelo storage-api sem
-- passar por RLS - não precisa de policy de SELECT): asset-photos,
-- property-media, sponsor-logos, org-logos. Confirmado pelo uso de
-- getPublicUrl() no código (nunca createSignedUrl para estes 4).
-- Privados (createSignedUrl no código): os outros 7.
--
-- ATENCAO (aprendido validando contra o stack self-hosted de verdade, não é
-- estilo): toda referência à coluna de path usa `storage.objects.name`
-- TOTALMENTE QUALIFICADA, nunca só `name`. Dentro de um `exists (select ...
-- from public.assets a where ...)`, um `name` desqualificado é resolvido para
-- `a.name` (assets/sports_properties/brandtrack_brands/sponsors TÊM coluna
-- `name`) em vez do `storage.objects.name` da linha sendo avaliada pela
-- policy - sombreamento de escopo silencioso do Postgres, sem erro nenhum,
-- que faz a policy negar 100% dos uploads legítimos. Custou depurar via teste
-- real (curl direto no storage-api) até aparecer no log do Postgres.

-- =========================================================================
-- Helper: cast de uuid que nunca lança exceção (path de storage é texto
-- arbitrário; um objeto com nome fora do padrão esperado não pode derrubar a
-- avaliação da policy para os demais).
-- =========================================================================

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

comment on function public.safe_uuid(text) is
  'Cast text->uuid tolerante a erro, usado pelas policies de storage.objects para extrair ids de recurso do path sem lançar exceção em nomes de arquivo fora do padrão esperado.';

-- =========================================================================
-- Buckets
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('asset-photos', 'asset-photos', true, 10485760),
  ('property-media', 'property-media', true, 104857600),
  ('sponsor-logos', 'sponsor-logos', true, 5242880),
  ('org-logos', 'org-logos', true, 5242880),
  ('delivery-evidence', 'delivery-evidence', false, 20971520),
  ('contracts', 'contracts', false, 52428800),
  ('proposals', 'proposals', false, 52428800),
  ('opportunity-comments', 'opportunity-comments', false, 20971520),
  ('sponsor-documents', 'sponsor-documents', false, 20971520),
  ('sponsor-interactions', 'sponsor-interactions', false, 10485760),
  ('brandtrack-media', 'brandtrack-media', false, 524288000)
on conflict (id) do nothing;

-- =========================================================================
-- Policies em storage.objects (RLS já vem habilitado por padrão no schema
-- storage do Supabase self-hosted). Nunca `anon` em nenhuma - leitura pública
-- dos 4 buckets públicos é feita pelo storage-api direto, sem consultar RLS,
-- por causa do `public = true` acima.
-- =========================================================================

-- asset-photos: segs[1]=user_id (namespace, não é fronteira de segurança),
-- segs[2]=asset_id -> resolve organização via assets.
create policy asset_photos_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'asset-photos'
    and exists (
      select 1 from public.assets a
      where a.id = public.safe_uuid((string_to_array(storage.objects.name, '/'))[2])
        and public.is_org_member(a.organization_id)
    )
  )
  with check (
    bucket_id = 'asset-photos'
    and exists (
      select 1 from public.assets a
      where a.id = public.safe_uuid((string_to_array(storage.objects.name, '/'))[2])
        and public.is_org_member(a.organization_id)
    )
  );

-- property-media: segs[2]=property_id -> sports_properties.
create policy property_media_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'property-media'
    and exists (
      select 1 from public.sports_properties p
      where p.id = public.safe_uuid((string_to_array(storage.objects.name, '/'))[2])
        and public.is_org_member(p.organization_id)
    )
  )
  with check (
    bucket_id = 'property-media'
    and exists (
      select 1 from public.sports_properties p
      where p.id = public.safe_uuid((string_to_array(storage.objects.name, '/'))[2])
        and public.is_org_member(p.organization_id)
    )
  );

-- sponsor-logos: único uso real hoje é BrandTrackExpectedBrands.tsx, com path
-- {user_id}/brandtrack-expected/{brand_id}-{uuid}.{ext} -> segs[3] comeca com
-- o uuid da marca (36 chars), resolvido via brandtrack_brands.
create policy sponsor_logos_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'sponsor-logos'
    and exists (
      select 1 from public.brandtrack_brands b
      where b.id = public.safe_uuid(left((string_to_array(storage.objects.name, '/'))[3], 36))
        and public.is_org_member(b.organization_id)
    )
  )
  with check (
    bucket_id = 'sponsor-logos'
    and exists (
      select 1 from public.brandtrack_brands b
      where b.id = public.safe_uuid(left((string_to_array(storage.objects.name, '/'))[3], 36))
        and public.is_org_member(b.organization_id)
    )
  );

-- org-logos: segs[1]=org_id diretamente.
create policy org_logos_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'org-logos'
    and public.is_org_member(public.safe_uuid((string_to_array(storage.objects.name, '/'))[1]))
  )
  with check (
    bucket_id = 'org-logos'
    and public.is_org_member(public.safe_uuid((string_to_array(storage.objects.name, '/'))[1]))
  );

-- delivery-evidence: segs[1]=org_id diretamente.
create policy delivery_evidence_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'delivery-evidence'
    and public.is_org_member(public.safe_uuid((string_to_array(storage.objects.name, '/'))[1]))
  )
  with check (
    bucket_id = 'delivery-evidence'
    and public.is_org_member(public.safe_uuid((string_to_array(storage.objects.name, '/'))[1]))
  );

-- contracts: duas formas de path convivem no mesmo bucket (upload manual via
-- Contracts.tsx e geração via generate-contract-pdf), mas em ambas segs[2]
-- COMEÇA com o uuid do contrato (com ou sem sufixo depois) - left(...,36)
-- funciona igual para as duas. contracts não tem coluna `name` (tem
-- title/brand), mas qualificamos mesmo assim por consistência e para não
-- depender disso continuar verdade no futuro.
create policy contracts_bucket_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'contracts'
    and exists (
      select 1 from public.contracts c
      where c.id = public.safe_uuid(left((string_to_array(storage.objects.name, '/'))[2], 36))
        and public.is_org_member(c.organization_id)
    )
  )
  with check (
    bucket_id = 'contracts'
    and exists (
      select 1 from public.contracts c
      where c.id = public.safe_uuid(left((string_to_array(storage.objects.name, '/'))[2], 36))
        and public.is_org_member(c.organization_id)
    )
  );

-- proposals: gerado por generate-proposal-pdf, segs[2]=proposal_id exato.
create policy proposals_bucket_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'proposals'
    and exists (
      select 1 from public.proposals pr
      where pr.id = public.safe_uuid(left((string_to_array(storage.objects.name, '/'))[2], 36))
        and public.is_org_member(pr.organization_id)
    )
  )
  with check (
    bucket_id = 'proposals'
    and exists (
      select 1 from public.proposals pr
      where pr.id = public.safe_uuid(left((string_to_array(storage.objects.name, '/'))[2], 36))
        and public.is_org_member(pr.organization_id)
    )
  );

-- opportunity-comments: segs[1]=org_id diretamente.
create policy opportunity_comments_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'opportunity-comments'
    and public.is_org_member(public.safe_uuid((string_to_array(storage.objects.name, '/'))[1]))
  )
  with check (
    bucket_id = 'opportunity-comments'
    and public.is_org_member(public.safe_uuid((string_to_array(storage.objects.name, '/'))[1]))
  );

-- sponsor-documents: segs[1]=org_id diretamente.
create policy sponsor_documents_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'sponsor-documents'
    and public.is_org_member(public.safe_uuid((string_to_array(storage.objects.name, '/'))[1]))
  )
  with check (
    bucket_id = 'sponsor-documents'
    and public.is_org_member(public.safe_uuid((string_to_array(storage.objects.name, '/'))[1]))
  );

-- sponsor-interactions: segs[1]=sponsor_id (não é organization_id direto) ->
-- resolve via sponsors.
create policy sponsor_interactions_org on storage.objects
  for all to authenticated
  using (
    bucket_id = 'sponsor-interactions'
    and exists (
      select 1 from public.sponsors s
      where s.id = public.safe_uuid((string_to_array(storage.objects.name, '/'))[1])
        and public.is_org_member(s.organization_id)
    )
  )
  with check (
    bucket_id = 'sponsor-interactions'
    and exists (
      select 1 from public.sponsors s
      where s.id = public.safe_uuid((string_to_array(storage.objects.name, '/'))[1])
        and public.is_org_member(s.organization_id)
    )
  );

-- brandtrack-media: ÚNICO bucket sem nenhum id de recurso no path
-- ({user_id}/{uuid}.{ext} apenas) - o event_id só existe na linha de
-- brandtrack_media, criada DEPOIS do upload. Sem sinal melhor no momento da
-- escrita, a escrita fica restrita ao próprio usuário (least privilege,
-- reflete exatamente o que o código já faz - não concede mais do que o path
-- já pressupõe). A LEITURA (visualizar evidência de um colega de equipe) usa
-- a linha correspondente, que já existe nesse momento.
create policy brandtrack_media_write_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brandtrack-media'
    and auth.uid() = public.safe_uuid((string_to_array(storage.objects.name, '/'))[1])
  );

create policy brandtrack_media_update_delete_own on storage.objects
  for all to authenticated
  using (
    bucket_id = 'brandtrack-media'
    and auth.uid() = public.safe_uuid((string_to_array(storage.objects.name, '/'))[1])
  )
  with check (
    bucket_id = 'brandtrack-media'
    and auth.uid() = public.safe_uuid((string_to_array(storage.objects.name, '/'))[1])
  );

create policy brandtrack_media_read_org on storage.objects
  for select to authenticated
  using (
    bucket_id = 'brandtrack-media'
    and (
      exists (
        select 1 from public.brandtrack_media m
        where m.storage_path = storage.objects.name and public.is_org_member(m.organization_id)
      )
      or exists (
        select 1 from public.brandtrack_detections d
        where d.evidence_path = storage.objects.name and public.is_org_member(d.organization_id)
      )
    )
  );
