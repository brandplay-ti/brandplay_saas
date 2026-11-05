-- 0040_relatorio_landing_page.sql
--
-- Relatório de resultados em formato de landing page (ADR-0011,
-- docs/business/relatorios.md). Uma página por propriedade, opcionalmente
-- recortada para um patrocinador, montada com dados do banco a cada visita
-- (relatório "vivo", sem snapshot).
--
-- O que entra:
--   1. property_posts       postagens, vídeos e matérias cadastradas por link,
--                           com métrica manual ou buscada pela API (YouTube).
--   2. property_indicators  números de fora da plataforma (TNT, Google
--                           Analytics, demografia do Instagram), com fonte.
--   3. property_media       ganha momento, patrocinador, etiquetas e a marca
--                           "contém menores" (decisão D10).
--   4. reports              a página: propriedade, patrocinador e contrato
--                           opcionais, estilo, modo de acesso, status.
--   5. report_landing_*     funções SECURITY DEFINER, só service_role, que a
--                           Edge Function `report-view` usa para decidir o
--                           acesso e montar a página. A lista de campos mora
--                           aqui e não inclui valor de contrato, parcela nem
--                           cota (decisão D7).
--
-- Sem leitura por `anon` em nenhuma tabela: quem não é membro só chega à
-- página pela `report-view`. Sem DELETE físico de relatório: excluir é
-- `status = 'excluido'`, e o endereço passa a mostrar a mensagem de
-- indisponível (o slug nunca é reaproveitado).

-- ─── 1. Organização herdada da propriedade e vínculos da mesma organização ──
-- A organização das tabelas novas vem sempre da propriedade, nunca do cliente.
-- Patrocinador, momento e contrato referenciados precisam ser dessa mesma
-- organização (e o momento, da mesma propriedade): nenhuma linha liga duas
-- organizações (CLAUDE.md, seção 6).
create or replace function public.tg_relatorio_vinculos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _linha    jsonb := to_jsonb(new);
  _org      uuid;
  _sponsor  uuid := nullif(_linha->>'sponsor_id', '')::uuid;
  _evento   uuid := nullif(_linha->>'event_id', '')::uuid;
  _contrato uuid := nullif(_linha->>'contract_id', '')::uuid;
begin
  select p.organization_id into _org
    from public.sports_properties p
   where p.id = new.property_id;
  if _org is null then
    raise exception 'Propriedade não encontrada ou sem organização' using errcode = '23503';
  end if;

  if tg_table_name <> 'property_media' then
    new.organization_id := _org;
  elsif new.organization_id is distinct from _org then
    raise exception 'A mídia não é da organização da propriedade' using errcode = '23503';
  end if;

  if _sponsor is not null and not exists (
    select 1 from public.sponsors s where s.id = _sponsor and s.organization_id = _org
  ) then
    raise exception 'Patrocinador de outra organização' using errcode = '23503';
  end if;

  if _evento is not null and not exists (
    select 1 from public.property_events e where e.id = _evento and e.property_id = new.property_id
  ) then
    raise exception 'Momento de outra propriedade' using errcode = '23503';
  end if;

  if _contrato is not null and not exists (
    select 1 from public.contracts c
     where c.id = _contrato
       and c.organization_id = _org
       and c.sponsor_id is not distinct from _sponsor
  ) then
    raise exception 'Contrato de outra organização ou de outro patrocinador' using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_relatorio_vinculos() from public, anon, authenticated;
grant execute on function public.tg_relatorio_vinculos() to service_role;

comment on function public.tg_relatorio_vinculos() is
  'Relatório (0040): organization_id vem da propriedade; patrocinador, momento e contrato precisam ser da mesma organização.';

-- ─── 2. Postagens, vídeos e matérias ────────────────────────────────────────
-- Cadastradas por link. `external_id` é o id do vídeo (YouTube, TikTok) ou o
-- código da publicação (Instagram): o embed é montado a partir dele, nunca da
-- URL crua, e o formato restrito impede injetar algo no endereço do iframe.
create table public.property_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.sports_properties (id) on delete cascade,
  sponsor_id uuid references public.sponsors (id) on delete set null,
  event_id uuid references public.property_events (id) on delete set null,
  network text not null,
  kind text not null default 'post',
  url text not null,
  external_id text,
  title text,
  source_name text,
  published_at date,
  is_highlight boolean not null default false,
  position integer not null default 0,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  metrics_source text not null default 'manual',
  metrics_updated_at timestamptz,
  -- Última tentativa de busca pela API, com ou sem sucesso: segura a próxima
  -- busca pelo intervalo de cache mesmo quando a rede falha.
  metrics_checked_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_posts_network_check check (
    network in ('instagram', 'youtube', 'tiktok', 'facebook', 'x', 'linkedin', 'site')
  ),
  constraint property_posts_kind_check check (
    kind in ('post', 'reel', 'video', 'story', 'live', 'materia', 'link')
  ),
  constraint property_posts_url_check check (url ~ '^https://[^\s]+$' and length(url) <= 2048),
  constraint property_posts_external_id_check check (
    external_id is null or external_id ~ '^[A-Za-z0-9_-]{1,64}$'
  ),
  constraint property_posts_title_check check (title is null or length(title) <= 200),
  constraint property_posts_source_name_check check (source_name is null or length(source_name) <= 120),
  constraint property_posts_metrics_check check (
    coalesce(views, 0) >= 0 and coalesce(likes, 0) >= 0
    and coalesce(comments, 0) >= 0 and coalesce(shares, 0) >= 0
  ),
  constraint property_posts_metrics_source_check check (metrics_source in ('manual', 'api'))
);

comment on table public.property_posts is
  'Postagens, vídeos e matérias da propriedade, cadastrados por link, para o relatório (0040). Métrica manual ou da API.';

create index property_posts_property_idx on public.property_posts (property_id, position);
create index property_posts_organization_idx on public.property_posts (organization_id);
create index property_posts_sponsor_idx on public.property_posts (sponsor_id) where sponsor_id is not null;

-- ─── 3. Indicadores com fonte ───────────────────────────────────────────────
-- Números que não nascem na plataforma. `category`:
--   numeros     a dimensão da competição (capa e faixa de números);
--   digital     resultados digitais (geral ou do patrocinador);
--   transmissao audiência de transmissão;
--   publico     distribuições do público, agrupadas por `group_name`
--               (faixa etária, gênero, cidade), em geral em percentual.
-- Zero conta como em branco, a menos que `show_zero` (decisão D8).
create table public.property_indicators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.sports_properties (id) on delete cascade,
  sponsor_id uuid references public.sponsors (id) on delete set null,
  category text not null default 'numeros',
  group_name text,
  label text not null,
  value numeric(20, 4) not null,
  format text not null default 'inteiro',
  prefix text,
  suffix text,
  source text,
  reference_date date,
  show_zero boolean not null default false,
  position integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_indicators_category_check check (
    category in ('numeros', 'digital', 'transmissao', 'publico')
  ),
  constraint property_indicators_format_check check (
    format in ('inteiro', 'compacto', 'decimal', 'percentual')
  ),
  constraint property_indicators_label_check check (length(btrim(label)) between 1 and 80),
  constraint property_indicators_group_check check (group_name is null or length(group_name) <= 60),
  constraint property_indicators_prefix_check check (prefix is null or length(prefix) <= 8),
  constraint property_indicators_suffix_check check (suffix is null or length(suffix) <= 16),
  constraint property_indicators_source_check check (source is null or length(source) <= 160)
);

comment on table public.property_indicators is
  'Indicadores da propriedade vindos de fora da plataforma, com fonte e data, para o relatório (0040).';

create index property_indicators_property_idx on public.property_indicators (property_id, category, position);
create index property_indicators_organization_idx on public.property_indicators (organization_id);

-- ─── 4. Fotos ligadas a momento e patrocinador ──────────────────────────────
alter table public.property_media
  add column event_id uuid references public.property_events (id) on delete set null,
  add column sponsor_id uuid references public.sponsors (id) on delete set null,
  add column tags text[] not null default '{}'::text[],
  add column contains_minors boolean not null default false;

alter table public.property_media
  add constraint property_media_tags_check check (cardinality(tags) <= 12);

comment on column public.property_media.contains_minors is
  'Foto com menores de idade: nunca sai em relatório público (decisão D10, 0040).';

-- Só valida quando há vínculo: linha antiga sem organização continua como era.
create trigger trg_property_media_vinculos
  before insert or update of event_id, sponsor_id, property_id on public.property_media
  for each row
  when (new.event_id is not null or new.sponsor_id is not null)
  execute function public.tg_relatorio_vinculos();

-- ─── 5. Relatórios ──────────────────────────────────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.sports_properties (id) on delete cascade,
  -- Sem ação, como em deliveries e installments: patrocinador com relatório
  -- não é apagado, é arquivado. Com `set null`, o relatório do patrocinador
  -- viraria em silêncio o relatório da propriedade inteira.
  sponsor_id uuid references public.sponsors (id),
  contract_id uuid references public.contracts (id) on delete set null,
  slug text not null,
  title text not null,
  subtitle text,
  summary text,
  style text not null default 'escuro',
  access_mode text not null default 'organizacao',
  status text not null default 'rascunho',
  hidden_blocks text[] not null default '{}'::text[],
  cta_label text,
  cta_url text,
  download_url text,
  published_at timestamptz,
  published_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_slug_unique unique (slug),
  constraint reports_slug_check check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80
  ),
  constraint reports_title_check check (length(btrim(title)) between 1 and 120),
  constraint reports_subtitle_check check (subtitle is null or length(subtitle) <= 300),
  constraint reports_summary_check check (summary is null or length(summary) <= 3000),
  constraint reports_style_check check (style in ('escuro', 'claro')),
  constraint reports_access_mode_check check (access_mode in ('organizacao', 'publico')),
  constraint reports_status_check check (status in ('rascunho', 'publicado', 'excluido')),
  constraint reports_hidden_blocks_check check (cardinality(hidden_blocks) <= 30),
  constraint reports_cta_label_check check (cta_label is null or length(cta_label) <= 40),
  constraint reports_cta_url_check check (
    cta_url is null or (cta_url ~ '^(https://|mailto:)[^\s]+$' and length(cta_url) <= 500)
  ),
  constraint reports_download_url_check check (
    download_url is null or (download_url ~ '^https://[^\s]+$' and length(download_url) <= 500)
  ),
  constraint reports_contract_sponsor_check check (contract_id is null or sponsor_id is not null)
);

comment on table public.reports is
  'Relatório de resultados em landing page (0040). Exclusão lógica (status = excluido); o slug nunca é reaproveitado.';

create index reports_organization_idx on public.reports (organization_id, created_at desc);
create index reports_sponsor_idx on public.reports (sponsor_id) where sponsor_id is not null;

-- Endereço: título sem acento + 6 caracteres hexadecimais aleatórios. O sufixo evita
-- colisão entre organizações e que alguém adivinhe o endereço de outro
-- relatório pelo nome do projeto.
create or replace function public.relatorio_slug(_titulo text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  _base text;
begin
  _base := lower(public.unaccent(coalesce(_titulo, '')));
  _base := btrim(regexp_replace(_base, '[^a-z0-9]+', '-', 'g'), '-');
  _base := btrim(left(_base, 60), '-');
  if _base = '' then
    _base := 'relatorio';
  end if;
  -- gen_random_uuid é nativo (pg_catalog). gen_random_bytes vem do pgcrypto,
  -- que na imagem do Supabase fica em `extensions`, fora do search_path.
  return _base || '-' || left(gen_random_uuid()::text, 6);
end;
$$;

revoke all on function public.relatorio_slug(text) from public, anon, authenticated;
grant execute on function public.relatorio_slug(text) to service_role;

-- Regras de publicação (decisão D4):
--   - quem edita o módulo (crm ou operacional) cria e edita relatório do modo
--     "só a organização", e publica nesse modo;
--   - passar para público, mexer num relatório público e excluir é de owner
--     ou admin;
--   - endereço e propriedade não mudam depois de criados;
--   - relatório excluído não volta nem muda.
-- Sem auth.uid() (service role, migration, psql) as regras de papel não se
-- aplicam; as de integridade, sim.
create or replace function public.tg_reports_regras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid   uuid := auth.uid();
  _admin boolean := _uid is null or public.has_org_role(new.organization_id, array['owner', 'admin']);
begin
  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.relatorio_slug(new.title);
    end if;
    if new.status = 'excluido' then
      raise exception 'Relatório novo não nasce excluído' using errcode = '23514';
    end if;
    if new.access_mode = 'publico' and not _admin then
      raise exception 'Só owner e admin publicam relatório público' using errcode = '42501';
    end if;
    new.created_by := coalesce(_uid, new.created_by);
    new.deleted_at := null;
    new.deleted_by := null;
    if new.status = 'publicado' then
      new.published_at := now();
      new.published_by := _uid;
    else
      new.published_at := null;
      new.published_by := null;
    end if;
    return new;
  end if;

  if old.status = 'excluido' then
    raise exception 'Relatório excluído não pode ser alterado' using errcode = '23514';
  end if;
  if new.slug is distinct from old.slug then
    raise exception 'O endereço do relatório não muda depois de criado' using errcode = '23514';
  end if;
  if new.property_id is distinct from old.property_id then
    raise exception 'A propriedade do relatório não muda depois de criado' using errcode = '23514';
  end if;
  if (old.access_mode = 'publico' or new.access_mode = 'publico') and not _admin then
    raise exception 'Só owner e admin alteram relatório público' using errcode = '42501';
  end if;
  if new.status = 'excluido' and not _admin then
    raise exception 'Só owner e admin excluem relatório' using errcode = '42501';
  end if;

  new.created_by := old.created_by;
  if new.status = 'publicado' and old.status <> 'publicado' then
    new.published_at := now();
    new.published_by := _uid;
  elsif new.status = 'rascunho' then
    new.published_at := null;
    new.published_by := null;
  else
    new.published_at := old.published_at;
    new.published_by := old.published_by;
  end if;
  if new.status = 'excluido' then
    new.deleted_at := now();
    new.deleted_by := _uid;
  else
    new.deleted_at := null;
    new.deleted_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_reports_regras() from public, anon, authenticated;
grant execute on function public.tg_reports_regras() to service_role;

-- Gatilhos BEFORE do mesmo evento disparam em ordem alfabética: primeiro a
-- organização (10), depois as regras, que dependem dela (20).
create trigger trg_property_posts_10_vinculos
  before insert or update on public.property_posts
  for each row execute function public.tg_relatorio_vinculos();
create trigger trg_property_posts_updated_at
  before update on public.property_posts
  for each row execute function public.update_updated_at_column();

create trigger trg_property_indicators_10_vinculos
  before insert or update on public.property_indicators
  for each row execute function public.tg_relatorio_vinculos();
create trigger trg_property_indicators_updated_at
  before update on public.property_indicators
  for each row execute function public.update_updated_at_column();

create trigger trg_reports_10_vinculos
  before insert or update on public.reports
  for each row execute function public.tg_relatorio_vinculos();
create trigger trg_reports_20_regras
  before insert or update on public.reports
  for each row execute function public.tg_reports_regras();
create trigger trg_reports_updated_at
  before update on public.reports
  for each row execute function public.update_updated_at_column();

-- ─── 6. RLS ─────────────────────────────────────────────────────────────────
-- Posts e indicadores: padrão 7, com os módulos que já escrevem nas tabelas
-- da propriedade (crm ou operacional). Relatórios: leitura por membro e pelo
-- portal do patrocinador (publicado, do próprio patrocinador); escrita pelo
-- módulo; sem DELETE.
alter table public.property_posts enable row level security;
alter table public.property_indicators enable row level security;
alter table public.reports enable row level security;

create policy property_posts_tenant_read on public.property_posts
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy property_posts_module_insert on public.property_posts
  for insert to authenticated
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );
create policy property_posts_module_update on public.property_posts
  for update to authenticated
  using (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  )
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );
create policy property_posts_module_delete on public.property_posts
  for delete to authenticated
  using (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );

create policy property_indicators_tenant_read on public.property_indicators
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy property_indicators_module_insert on public.property_indicators
  for insert to authenticated
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );
create policy property_indicators_module_update on public.property_indicators
  for update to authenticated
  using (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  )
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );
create policy property_indicators_module_delete on public.property_indicators
  for delete to authenticated
  using (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );

create policy reports_tenant_read on public.reports
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy reports_sponsor_portal_read on public.reports
  for select to authenticated
  using (
    status = 'publicado'
    and sponsor_id is not null
    and public.has_sponsor_portal_access(sponsor_id)
  );
create policy reports_module_insert on public.reports
  for insert to authenticated
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );
create policy reports_module_update on public.reports
  for update to authenticated
  using (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  )
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );

-- Bloqueio de cobrança (formato da 0026): organização sem acesso não lê nem
-- grava. Relatório já publicado no modo público continua no ar pela
-- `report-view`, que usa service role (decisão D2).
create policy billing_access_restrictive on public.property_posts
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));
create policy billing_access_restrictive on public.property_indicators
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));
create policy billing_access_restrictive on public.reports
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));

revoke all on public.property_posts, public.property_indicators, public.reports from anon, authenticated;
grant select, insert, update, delete on public.property_posts, public.property_indicators to authenticated;
grant select, insert, update on public.reports to authenticated;
grant all on public.property_posts, public.property_indicators, public.reports to service_role;

-- ─── 7. Dados da página (só service_role, pela `report-view`) ───────────────
-- Acesso: a Edge Function lê o mínimo para decidir quem entra.
create or replace function public.report_landing_acesso(_slug text)
returns table (id uuid, organization_id uuid, property_id uuid, sponsor_id uuid, access_mode text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.organization_id, r.property_id, r.sponsor_id, r.access_mode, r.status
    from public.reports r
   where r.slug = _slug;
$$;

revoke all on function public.report_landing_acesso(text) from public, anon, authenticated;
grant execute on function public.report_landing_acesso(text) to service_role;

-- Conteúdo: lista explícita de campos. Nunca: valor de contrato, parcela,
-- cota ou oportunidade (D7); notas internas, descrição de entrega, comentário
-- de aprovação, descrição de momento; contato ou documento de patrocinador.
-- `_publico`: o visitante não tem login e o relatório é público. Aí some a
-- foto marcada com menores (D10) e a evidência de entrega, que mora em bucket
-- privado e não passa pela curadoria da galeria.
-- Relatório de patrocinador: entra o conteúdo do patrocinador e o geral (sem
-- patrocinador), nunca o de outro patrocinador.
create or replace function public.report_landing_data(_report_id uuid, _publico boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.reports;
begin
  select * into r from public.reports where id = _report_id;
  if not found or r.status = 'excluido' then
    return null;
  end if;

  return jsonb_build_object(
    'relatorio', jsonb_build_object(
      'titulo', r.title,
      'subtitulo', r.subtitle,
      'resumo', r.summary,
      'estilo', r.style,
      'modo', r.access_mode,
      'status', r.status,
      'blocos_ocultos', to_jsonb(r.hidden_blocks),
      'cta_rotulo', r.cta_label,
      'cta_url', r.cta_url,
      'download_url', r.download_url,
      'publicado_em', r.published_at,
      'atualizado_em', greatest(
        r.updated_at,
        (select max(greatest(pp.updated_at, coalesce(pp.metrics_updated_at, pp.updated_at)))
           from public.property_posts pp where pp.property_id = r.property_id),
        (select max(pi.updated_at) from public.property_indicators pi where pi.property_id = r.property_id)
      )
    ),
    'organizacao', (
      select jsonb_build_object(
        'nome', o.name,
        'logo_path', o.logo_path,
        'primaria', k.primary_hex,
        'secundaria', k.secondary_hex,
        'logos', coalesce((
          select jsonb_object_agg(a.kind, a.storage_path)
            from public.organization_brand_assets a
           where a.organization_id = o.id
        ), '{}'::jsonb)
      )
        from public.organizations o
        left join public.organization_brand_kits k on k.organization_id = o.id
       where o.id = r.organization_id
    ),
    'propriedade', (
      select jsonb_build_object(
        'nome', p.name,
        'categoria', p.category,
        'chamada', p.public_headline,
        'sobre', p.public_about,
        'capa_path', p.public_cover_path,
        'temporada', p.season_year,
        'inicio', p.start_date,
        'fim', p.end_date,
        'locais', to_jsonb(p.locations),
        'local_final', p.final_location,
        'publico_estimado', p.audience_estimate,
        'torcedores', p.fans_count,
        'participantes', p.participants_count,
        'times', p.teams_count,
        'premiacao', p.prize_pool,
        'redes', p.social_links,
        'redes_numeros', p.social_stats
      )
        from public.sports_properties p
       where p.id = r.property_id
    ),
    'patrocinador', (
      select jsonb_build_object('id', s.id, 'nome', s.name, 'logo_path', s.logo_path)
        from public.sponsors s
       where s.id = r.sponsor_id
    ),
    'patrocinadores', coalesce((
      select jsonb_agg(x order by x.ordem, x.nome)
        from (
          select distinct on (s.id)
                 s.id, s.name as nome, s.logo_path, t.name as cota, t.level as nivel,
                 coalesce(t.position, 999) as ordem
            from public.sponsors s
            left join public.tier_sales ts
              on ts.sponsor_id = s.id
             and ts.status not in ('cancelada', 'cancelado')
            left join public.sponsorship_tiers t
              on t.id = ts.tier_id
             and t.property_id = r.property_id
           where s.organization_id = r.organization_id
             and (
               t.id is not null
               or exists (
                 select 1 from public.contracts c
                  where c.sponsor_id = s.id
                    and c.property_id = r.property_id
                    and c.status in ('ativo', 'vencendo', 'encerrado')
               )
             )
           order by s.id, coalesce(t.position, 999)
        ) x
    ), '[]'::jsonb),
    'momentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'titulo', e.title,
               'tipo', e.event_type,
               'local', e.location,
               'inicio', e.starts_at
             ) order by e.starts_at)
        from public.property_events e
       where e.property_id = r.property_id
    ), '[]'::jsonb),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'path', m.storage_path,
               'legenda', m.caption,
               'momento_id', m.event_id,
               'etiquetas', to_jsonb(m.tags),
               'capa', m.is_cover,
               'do_patrocinador', coalesce(m.sponsor_id = r.sponsor_id, false)
             ) order by coalesce(m.sponsor_id = r.sponsor_id, false) desc, m.position, m.created_at)
        from public.property_media m
       where m.property_id = r.property_id
         and m.storage_path is not null
         and m.media_type in ('photo', 'foto')
         and (not _publico or not m.contains_minors)
         and (m.sponsor_id is null or r.sponsor_id is null or m.sponsor_id = r.sponsor_id)
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pp.id,
               'rede', pp.network,
               'tipo', pp.kind,
               'url', pp.url,
               'id_externo', pp.external_id,
               'titulo', pp.title,
               'fonte', pp.source_name,
               'publicado_em', pp.published_at,
               'destaque', pp.is_highlight,
               'momento_id', pp.event_id,
               'views', pp.views,
               'likes', pp.likes,
               'comentarios', pp.comments,
               'compartilhamentos', pp.shares,
               'metricas_origem', pp.metrics_source,
               'metricas_em', pp.metrics_updated_at,
               'do_patrocinador', coalesce(pp.sponsor_id = r.sponsor_id, false)
             ) order by pp.is_highlight desc, pp.position, pp.published_at desc nulls last)
        from public.property_posts pp
       where pp.property_id = r.property_id
         and (pp.sponsor_id is null or r.sponsor_id is null or pp.sponsor_id = r.sponsor_id)
    ), '[]'::jsonb),
    'indicadores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pi.id,
               'categoria', pi.category,
               'grupo', pi.group_name,
               'rotulo', pi.label,
               'valor', pi.value,
               'formato', pi.format,
               'prefixo', pi.prefix,
               'sufixo', pi.suffix,
               'fonte', pi.source,
               'data_referencia', pi.reference_date,
               'do_patrocinador', coalesce(pi.sponsor_id = r.sponsor_id, false)
             ) order by pi.category, pi.group_name nulls first, pi.position, pi.created_at)
        from public.property_indicators pi
       where pi.property_id = r.property_id
         and (pi.value <> 0 or pi.show_zero)
         and (pi.sponsor_id is null or r.sponsor_id is null or pi.sponsor_id = r.sponsor_id)
    ), '[]'::jsonb),
    'contrapartidas', case when r.sponsor_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id,
               'titulo', d.title,
               'categoria', d.asset_type,
               'quantidade', d.quantity,
               'status', d.status,
               'aprovacao', d.approval,
               'vencimento', d.due_date,
               'entregue_em', d.delivered_at,
               'evidencias', case when _publico then '[]'::jsonb else coalesce((
                 select jsonb_agg(jsonb_build_object('path', a.storage_path, 'registrado_em', a.taken_at)
                                  order by a.position, a.created_at)
                   from (
                     select da.storage_path, da.taken_at, da.position, da.created_at
                       from public.delivery_attachments da
                      where da.delivery_id = d.id
                        and da.organization_id = r.organization_id
                        and coalesce(da.mime_type, 'image/') like 'image/%'
                      order by da.position, da.created_at
                      limit 6
                   ) a
               ), '[]'::jsonb) end
             ) order by d.position, d.due_date nulls last, d.title)
        from public.deliveries d
       where d.organization_id = r.organization_id
         and d.sponsor_id = r.sponsor_id
         and (
           (r.contract_id is not null and d.contract_id = r.contract_id)
           or (r.contract_id is null and d.property_id = r.property_id)
         )
    ), '[]'::jsonb) end
  );
end;
$$;

revoke all on function public.report_landing_data(uuid, boolean) from public, anon, authenticated;
grant execute on function public.report_landing_data(uuid, boolean) to service_role;

comment on function public.report_landing_data(uuid, boolean) is
  'Dados da landing page do relatório (0040), só para a Edge Function report-view. Sem valores financeiros (D7); sem menores nem evidência privada no modo público (D10).';
