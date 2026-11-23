-- 0049_midia_da_edicao.sql
--
-- Mídia da edição (BP-7, subtarefa BP-7.03): modelo de dados das pastas, dos
-- arquivos de vídeo e foto da edição e dos objetos guardados no Cloudflare R2.
-- O upload, a assinatura das URLs e o processamento vêm nas subtarefas
-- seguintes; aqui só o que elas vão gravar e quem pode ler e escrever.
--
--   1. edition_folders        pastas e subpastas criadas pelo usuário (D12).
--   2. edition_media          um arquivo enviado (vídeo ou foto) da edição.
--   3. edition_media_objects  cada objeto no R2 de um arquivo (original,
--                             versão de análise, miniatura, versão de
--                             relatório...), com o tamanho REAL do objeto.
--   4. edition_storage_usage  bytes guardados por organização e projeto (D3).
--
-- Decisões:
--
--   1. O material pertence à edição (D1): `property_id` aponta para a linha
--      de `sports_properties` da edição. A tabela aceita também um projeto
--      raiz (sem edições), porque o relatório já é por `sports_properties`
--      e nada no modelo exige a edição; a tela abre pela edição.
--   2. Pastas ficam só no banco (D10): mover ou renomear não toca no R2. O
--      caminho do objeto é montado aqui, com identificadores, nunca nomes:
--      <organizacao_id>/<projeto_raiz_id>/<edicao_id>/<midia_id>/<variante>.
--      Quando a mídia é do próprio projeto raiz, raiz e edição se repetem.
--      O caminho é fixado na criação e não muda, nem se a edição mudar de
--      projeto-mãe depois.
--   3. A organização vem sempre do projeto, por gatilho; a pasta e a
--      pasta-mãe precisam ser do MESMO projeto (chave estrangeira composta
--      com `property_id`). Nenhuma linha liga duas organizações.
--   4. Escrita por módulo (padrão 7, crm ou operacional, como as demais
--      tabelas do projeto). Sem DELETE físico: pasta e mídia se arquivam
--      (`archived_at`). Pasta só se arquiva vazia (sem subpasta nem mídia
--      ativa), para nada ficar escondido sem dono; a tela arquiva o conteúdo
--      antes.
--   5. O que o servidor decide o cliente não escreve: status do envio,
--      mensagem de erro e caminho. Sem `auth.uid()` (service role da Edge
--      Function, migration, psql) o gatilho deixa gravar.
--      `declared_size_bytes` é o tamanho que o navegador informou: serve para
--      a tela (progresso, teste de capacidade) e NUNCA para cobrança (RNF2).
--   6. Os objetos do R2 só são escritos pelo servidor (service role): o
--      tamanho é o do objeto lido no R2 ao concluir o envio, não o do
--      navegador. Membros leem; o uso em bytes é a soma deles.
--   7. Nome de pasta não se repete entre as pastas ativas do mesmo nível.
--   8. Sem leitura pelo portal do patrocinador (D11): ele vê o material só
--      pelo relatório publicado, que a `report-view` monta com service role.
--   9. Segmentos do corte inteligente ficam para a BP-7.12, porque dependem
--      das categorias em aberto (D6).

-- ─── 1. Tabelas ─────────────────────────────────────────────────────────────
create table public.edition_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null,
  parent_folder_id uuid,
  name text not null,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edition_folders_property_id_id_key unique (property_id, id),
  constraint edition_folders_property_fkey foreign key (organization_id, property_id)
    references public.sports_properties (organization_id, id) on delete cascade,
  constraint edition_folders_parent_fkey foreign key (property_id, parent_folder_id)
    references public.edition_folders (property_id, id),
  constraint edition_folders_not_self_parent check (parent_folder_id is distinct from id),
  constraint edition_folders_name_check check (
    name = btrim(name) and length(name) between 1 and 120 and name !~ '[[:cntrl:]]'
  )
);

comment on table public.edition_folders is
  'Pastas e subpastas da mídia de uma edição (BP-7, D12). Só no banco: mover ou renomear não toca no R2. Sem DELETE; arquivar exige pasta vazia.';

create unique index edition_folders_nome_unico_idx
  on public.edition_folders (
    property_id,
    coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  where archived_at is null;
create index edition_folders_organization_id_idx on public.edition_folders (organization_id);
create index edition_folders_parent_folder_id_idx on public.edition_folders (parent_folder_id);

create table public.edition_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null,
  folder_id uuid,
  kind text not null,
  file_name text not null,
  mime_type text,
  declared_size_bytes bigint,
  status text not null default 'aguardando_envio',
  error_message text,
  -- O default vazio só existe para o insert do cliente não precisar mandar o
  -- campo: o gatilho sempre o substitui pelo caminho montado no banco.
  storage_prefix text not null default '',
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edition_media_property_fkey foreign key (organization_id, property_id)
    references public.sports_properties (organization_id, id) on delete cascade,
  constraint edition_media_folder_fkey foreign key (property_id, folder_id)
    references public.edition_folders (property_id, id),
  constraint edition_media_kind_check check (kind in ('video', 'foto')),
  constraint edition_media_file_name_check check (
    length(file_name) between 1 and 255 and file_name !~ '[[:cntrl:]]'
  ),
  constraint edition_media_mime_type_check check (
    mime_type is null or mime_type ~ '^[a-z]+/[a-z0-9.+-]{1,100}$'
  ),
  constraint edition_media_declared_size_check check (
    declared_size_bytes is null or declared_size_bytes >= 0
  ),
  constraint edition_media_status_check check (
    status in ('aguardando_envio', 'enviando', 'enviado', 'processando', 'pronto', 'erro')
  ),
  constraint edition_media_error_message_check check (
    error_message is null or length(error_message) <= 500
  ),
  constraint edition_media_storage_prefix_check check (
    storage_prefix ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  )
);

comment on table public.edition_media is
  'Arquivo de vídeo ou foto da edição (BP-7). Status, erro e caminho são do servidor; declared_size_bytes vem do navegador e nunca serve para cobrança (RNF2). Sem DELETE.';
comment on column public.edition_media.storage_prefix is
  'Prefixo do objeto no R2: <organizacao>/<projeto raiz>/<edicao>/<midia>, montado pelo gatilho na criação e fixo.';
comment on column public.edition_media.declared_size_bytes is
  'Tamanho informado pelo navegador: só para a tela. O tamanho real está em edition_media_objects.size_bytes.';

create index edition_media_organization_id_idx on public.edition_media (organization_id);
create index edition_media_property_id_idx on public.edition_media (property_id);
create index edition_media_folder_id_idx on public.edition_media (folder_id);

create table public.edition_media_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  media_id uuid not null references public.edition_media (id) on delete cascade,
  variant text not null,
  object_key text not null,
  status text not null default 'enviando',
  mime_type text,
  size_bytes bigint,
  upload_id text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edition_media_objects_media_variant_key unique (media_id, variant),
  constraint edition_media_objects_object_key_key unique (object_key),
  constraint edition_media_objects_variant_check check (variant ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  constraint edition_media_objects_status_check check (status in ('enviando', 'enviado', 'erro')),
  constraint edition_media_objects_mime_type_check check (
    mime_type is null or mime_type ~ '^[a-z]+/[a-z0-9.+-]{1,100}$'
  ),
  constraint edition_media_objects_size_check check (size_bytes is null or size_bytes >= 0),
  constraint edition_media_objects_enviado_check check (
    status <> 'enviado' or (size_bytes is not null and completed_at is not null)
  ),
  constraint edition_media_objects_upload_id_check check (
    upload_id is null or length(upload_id) <= 1024
  )
);

comment on table public.edition_media_objects is
  'Objetos no R2 de uma mídia da edição (BP-7, D10). Só o servidor grava; size_bytes é o tamanho lido no R2 ao concluir o envio (RNF2).';
comment on column public.edition_media_objects.object_key is
  'Chave do objeto no R2: storage_prefix da mídia + /variante, montada pelo gatilho.';

create index edition_media_objects_organization_id_idx on public.edition_media_objects (organization_id);

-- ─── 2. Gatilhos ────────────────────────────────────────────────────────────
-- Pastas e mídia: organização vem do projeto; projeto não muda; pasta-mãe ou
-- pasta de destino ativa; pasta sem ciclo; campos do servidor protegidos;
-- arquivamento com data e autor do próprio banco.
create or replace function public.tg_midia_edicao_regras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid     uuid := auth.uid();
  _org     uuid;
  _raiz    uuid;
  _destino uuid;
  _destino_antigo uuid;
  _passo   uuid;
  _nivel   integer := 0;
  _novo    jsonb;
  _velho   jsonb := '{}'::jsonb;
begin
  -- OLD só é lido dentro de `if tg_op = 'UPDATE'`: numa expressão com AND o
  -- PL/pgSQL não garante curto-circuito.
  if tg_op = 'UPDATE' then
    if new.property_id is distinct from old.property_id then
      raise exception 'A mídia e a pasta não mudam de projeto' using errcode = '23514';
    end if;
  end if;

  select p.organization_id into _org
    from public.sports_properties p
   where p.id = new.property_id;
  if _org is null then
    raise exception 'Projeto não encontrado ou sem organização' using errcode = '23503';
  end if;
  new.organization_id := _org;

  -- Os campos de cada tabela vêm por jsonb: o PL/pgSQL resolve `new.campo` ao
  -- executar, e a mesma função serve às duas tabelas (como a 0040).
  _novo := to_jsonb(new);
  if tg_op = 'UPDATE' then
    _velho := to_jsonb(old);
  end if;
  if tg_table_name = 'edition_folders' then
    _destino := nullif(_novo->>'parent_folder_id', '')::uuid;
    _destino_antigo := nullif(_velho->>'parent_folder_id', '')::uuid;
  else
    _destino := nullif(_novo->>'folder_id', '')::uuid;
    _destino_antigo := nullif(_velho->>'folder_id', '')::uuid;
  end if;

  -- Destino arquivado só é recusado na criação, quando o destino muda ou
  -- quando o item sai do arquivo: mexer em outro campo de algo que já está
  -- numa pasta arquivada continua possível (inclusive arquivar).
  if _destino is not null
     and (
       tg_op = 'INSERT'
       or _destino is distinct from _destino_antigo
       or (_novo->>'archived_at' is null and _velho->>'archived_at' is not null)
     )
     and exists (select 1 from public.edition_folders f where f.id = _destino and f.archived_at is not null)
  then
    raise exception 'A pasta de destino está arquivada' using errcode = '23514';
  end if;

  if tg_table_name = 'edition_folders' then
    if tg_op = 'UPDATE' then
      -- Sem ciclo: subindo a partir da nova pasta-mãe, não se chega à própria pasta.
      if _destino is distinct from _destino_antigo then
        _passo := _destino;
        while _passo is not null loop
          if _passo = new.id then
            raise exception 'Uma pasta não pode ficar dentro dela mesma' using errcode = '23514';
          end if;
          _nivel := _nivel + 1;
          if _nivel > 64 then
            raise exception 'Pastas aninhadas demais' using errcode = '23514';
          end if;
          select f.parent_folder_id into _passo from public.edition_folders f where f.id = _passo;
        end loop;
      end if;

      if new.archived_at is not null and old.archived_at is null and (
           exists (select 1 from public.edition_folders f
                    where f.parent_folder_id = new.id and f.archived_at is null)
           or exists (select 1 from public.edition_media m
                       where m.folder_id = new.id and m.archived_at is null)
         )
      then
        raise exception 'Só dá para arquivar pasta vazia' using errcode = '23514';
      end if;
    end if;
  else
    if tg_op = 'INSERT' then
      -- Projeto raiz: sobe pela cadeia de parent_property_id (com teto, para
      -- não girar em cadeia com ciclo).
      _raiz := new.property_id;
      loop
        select p.parent_property_id into _passo from public.sports_properties p where p.id = _raiz;
        exit when _passo is null;
        _nivel := _nivel + 1;
        if _nivel > 64 then
          raise exception 'Cadeia de projetos longa demais' using errcode = '23514';
        end if;
        _raiz := _passo;
      end loop;
      new.storage_prefix := _org::text || '/' || _raiz::text || '/' || new.property_id::text || '/' || new.id::text;

      if _uid is not null then
        new.status := 'aguardando_envio';
        new.error_message := null;
      end if;
    else
      if new.storage_prefix is distinct from old.storage_prefix then
        raise exception 'O caminho da mídia não muda depois de criado' using errcode = '23514';
      end if;
      if new.kind is distinct from old.kind then
        raise exception 'O tipo da mídia não muda depois de criado' using errcode = '23514';
      end if;
      if _uid is not null and (
           new.status is distinct from old.status
           or new.error_message is distinct from old.error_message
           or new.declared_size_bytes is distinct from old.declared_size_bytes
         )
      then
        raise exception 'Status, erro e tamanho da mídia são gravados pelo servidor' using errcode = '42501';
      end if;
    end if;
  end if;

  -- Autor e arquivamento: data e autor do próprio banco, nunca do cliente.
  if tg_op = 'INSERT' then
    new.created_by := coalesce(_uid, new.created_by);
    if new.archived_at is not null then
      new.archived_at := now();
      new.archived_by := _uid;
    else
      new.archived_by := null;
    end if;
  else
    new.created_by := old.created_by;
    if new.archived_at is null then
      new.archived_by := null;
    elsif old.archived_at is null then
      new.archived_at := now();
      new.archived_by := _uid;
    else
      new.archived_at := old.archived_at;
      new.archived_by := old.archived_by;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_midia_edicao_regras() from public, anon, authenticated;
grant execute on function public.tg_midia_edicao_regras() to service_role;

comment on function public.tg_midia_edicao_regras() is
  'Mídia da edição (0049): organização vem do projeto; pasta do mesmo projeto, ativa e sem ciclo; caminho no R2 montado aqui; status e erro só pelo servidor.';

-- Objetos do R2: organização e chave vêm da mídia; mídia e variante não mudam.
create or replace function public.tg_midia_edicao_objetos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _org    uuid;
  _prefix text;
begin
  if tg_op = 'UPDATE' then
    if new.media_id is distinct from old.media_id or new.variant is distinct from old.variant then
      raise exception 'O objeto não muda de mídia nem de variante' using errcode = '23514';
    end if;
  end if;

  select m.organization_id, m.storage_prefix into _org, _prefix
    from public.edition_media m
   where m.id = new.media_id;
  if _org is null then
    raise exception 'Mídia não encontrada' using errcode = '23503';
  end if;

  new.organization_id := _org;
  new.object_key := _prefix || '/' || new.variant;
  return new;
end;
$$;

revoke all on function public.tg_midia_edicao_objetos() from public, anon, authenticated;
grant execute on function public.tg_midia_edicao_objetos() to service_role;

comment on function public.tg_midia_edicao_objetos() is
  'Mídia da edição (0049): organization_id e object_key do objeto no R2 vêm da mídia, nunca de quem grava.';

-- Gatilhos BEFORE do mesmo evento disparam em ordem alfabética: primeiro as
-- regras (10), depois o updated_at.
create trigger trg_edition_folders_10_regras
  before insert or update on public.edition_folders
  for each row execute function public.tg_midia_edicao_regras();
create trigger trg_edition_folders_updated_at
  before update on public.edition_folders
  for each row execute function public.update_updated_at_column();

create trigger trg_edition_media_10_regras
  before insert or update on public.edition_media
  for each row execute function public.tg_midia_edicao_regras();
create trigger trg_edition_media_updated_at
  before update on public.edition_media
  for each row execute function public.update_updated_at_column();

create trigger trg_edition_media_objects_10_vinculos
  before insert or update on public.edition_media_objects
  for each row execute function public.tg_midia_edicao_objetos();
create trigger trg_edition_media_objects_updated_at
  before update on public.edition_media_objects
  for each row execute function public.update_updated_at_column();

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
-- Pastas e mídia: padrão 7 (leitura por membro; criar e alterar por crm ou
-- operacional), sem DELETE. Objetos: leitura por membro, escrita só pelo
-- servidor (nenhuma policy de escrita e nenhum grant de escrita).
alter table public.edition_folders enable row level security;
alter table public.edition_media enable row level security;
alter table public.edition_media_objects enable row level security;

create policy edition_folders_tenant_read on public.edition_folders
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy edition_folders_module_insert on public.edition_folders
  for insert to authenticated
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );
create policy edition_folders_module_update on public.edition_folders
  for update to authenticated
  using (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  )
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );

create policy edition_media_tenant_read on public.edition_media
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy edition_media_module_insert on public.edition_media
  for insert to authenticated
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );
create policy edition_media_module_update on public.edition_media
  for update to authenticated
  using (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  )
  with check (
    public.can_access_module(auth.uid(), organization_id, 'crm', true)
    or public.can_access_module(auth.uid(), organization_id, 'operacional', true)
  );

create policy edition_media_objects_tenant_read on public.edition_media_objects
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Bloqueio de cobrança (formato da 0026).
create policy billing_access_restrictive on public.edition_folders
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));
create policy billing_access_restrictive on public.edition_media
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));
create policy billing_access_restrictive on public.edition_media_objects
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));

revoke all on public.edition_folders, public.edition_media, public.edition_media_objects from anon, authenticated;
grant select, insert, update on public.edition_folders, public.edition_media to authenticated;
grant select on public.edition_media_objects to authenticated;
grant all on public.edition_folders, public.edition_media, public.edition_media_objects to service_role;

-- ─── 4. Uso de armazenamento (D3, RF12) ─────────────────────────────────────
-- Soma dos objetos já enviados, pelo tamanho lido no R2. `security_invoker`
-- faz a view respeitar a RLS de quem consulta: cada um vê só as organizações
-- de que é membro. Sem limite por plano por enquanto (revisão futura).
create view public.edition_storage_usage
with (security_invoker = true) as
select
  o.organization_id,
  m.property_id,
  sum(o.size_bytes)::bigint as total_bytes,
  count(*)::bigint as object_count
from public.edition_media_objects o
join public.edition_media m on m.id = o.media_id
where o.status = 'enviado'
group by o.organization_id, m.property_id;

comment on view public.edition_storage_usage is
  'Bytes guardados no R2 por organização e projeto/edição (BP-7, D3): soma de edition_media_objects enviados. Respeita a RLS de quem consulta.';

revoke all on public.edition_storage_usage from anon, authenticated;
grant select on public.edition_storage_usage to authenticated, service_role;

insert into migrations.schema_migrations (version)
values ('0049_midia_da_edicao');
