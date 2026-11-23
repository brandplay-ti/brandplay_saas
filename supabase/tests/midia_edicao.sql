-- Mídia da edição (0049, BP-7.03). Transação revertida no fim.
--
-- (a) organização e caminho no R2 vêm do banco, nunca do cliente
-- (b) pasta e pasta-mãe precisam ser do mesmo projeto
-- (c) pasta sem ciclo
-- (d) nome de pasta único entre as ativas do mesmo nível
-- (e) arquivamento: só pasta vazia; nada entra em pasta arquivada
-- (f) status, erro e tamanho da mídia e objetos do R2 só pelo servidor
-- (g) papéis: módulo crm/operacional escreve; financeiro só lê
-- (h) sem DELETE físico
-- (i) projeto da mídia e da pasta não muda
-- (j) uso de armazenamento pelo tamanho real dos objetos enviados
-- (k) isolamento entre organizações, patrocinador e anon sem acesso

\echo '=== Testes da mídia da edição ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'midia.owner.a@teste.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', '4b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'midia.owner.b@teste.local', '{"full_name":"Owner B"}'),
  ('00000000-0000-0000-0000-000000000000', '4c000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'midia.comercial.a@teste.local', '{"full_name":"Comercial A"}'),
  ('00000000-0000-0000-0000-000000000000', '4d000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'midia.financeiro.a@teste.local', '{"full_name":"Financeiro A"}'),
  ('00000000-0000-0000-0000-000000000000', '4e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'midia.patrocinador@teste.local', '{"full_name":"Patrocinador"}');

insert into public.organizations (id, owner_id, name) values
  ('a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a', 'Org A mídia'),
  ('b4000000-0000-4000-8000-000000000002', '4b000000-0000-4000-8000-00000000000b', 'Org B mídia');

insert into public.organization_members (organization_id, user_id, role, status) values
  ('a4000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-00000000000c', 'comercial', 'ativo'),
  ('a4000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-00000000000d', 'financeiro', 'ativo');

-- Copa A (raiz) com as edições 2026 e 2030; Copa B na outra organização.
insert into public.sports_properties (id, organization_id, owner_id, name, category) values
  ('94000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a', 'Copa A', 'campeonato'),
  ('94000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000002', '4b000000-0000-4000-8000-00000000000b', 'Copa B', 'campeonato');
insert into public.sports_properties (id, organization_id, owner_id, name, category, parent_property_id, season_year) values
  ('94000000-0000-4000-8000-000000000026', 'a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a', 'Copa A 2026', 'campeonato', '94000000-0000-4000-8000-000000000001', 2026),
  ('94000000-0000-4000-8000-000000000030', 'a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a', 'Copa A 2030', 'campeonato', '94000000-0000-4000-8000-000000000001', 2030);

insert into public.sponsors (id, organization_id, owner_id, name) values
  ('54000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a', 'Marca A1');
insert into public.sponsor_portal_access (organization_id, sponsor_id, user_id, granted_by, status) values
  ('a4000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', '4e000000-0000-4000-8000-00000000000e', '4a000000-0000-4000-8000-00000000000a', 'ativo');

-- (a) a (e), (g) e (i) como Comercial A (módulo crm) ------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

do $$
declare
  _org    uuid;
  _prefix text;
  _status text;
  _autor  uuid;
begin
  -- (a) O cliente manda a organização B, um caminho e um status; nada disso fica.
  insert into public.edition_folders (id, organization_id, property_id, name)
  values ('f4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002',
          '94000000-0000-4000-8000-000000000026', 'Jogo 1');
  select organization_id, created_by into _org, _autor
    from public.edition_folders where id = 'f4000000-0000-4000-8000-000000000001';
  if _org <> 'a4000000-0000-4000-8000-000000000001' then
    raise exception 'FALHA (a): pasta ficou na organização enviada pelo cliente';
  end if;
  if _autor <> '4c000000-0000-4000-8000-00000000000c' then
    raise exception 'FALHA (a): autor da pasta não é quem criou';
  end if;

  insert into public.edition_media (id, organization_id, property_id, folder_id, kind, file_name, mime_type,
                                    declared_size_bytes, status, storage_prefix)
  values ('e4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002',
          '94000000-0000-4000-8000-000000000026', 'f4000000-0000-4000-8000-000000000001',
          'video', 'camera-1.mp4', 'video/mp4', 42000000000, 'pronto', 'outra/coisa');
  select organization_id, storage_prefix, status into _org, _prefix, _status
    from public.edition_media where id = 'e4000000-0000-4000-8000-000000000001';
  if _org <> 'a4000000-0000-4000-8000-000000000001' then
    raise exception 'FALHA (a): mídia ficou na organização enviada pelo cliente';
  end if;
  if _prefix <> 'a4000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/'
                || '94000000-0000-4000-8000-000000000026/e4000000-0000-4000-8000-000000000001' then
    raise exception 'FALHA (a): caminho no R2 não segue organização/projeto/edição/mídia: %', _prefix;
  end if;
  if _status <> 'aguardando_envio' then
    raise exception 'FALHA (a): cliente escolheu o status da mídia nova';
  end if;

  -- Mídia na raiz da edição (sem pasta) e foto direto no projeto raiz.
  insert into public.edition_media (id, property_id, kind, file_name)
  values ('e4000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000026', 'foto', 'capa.jpg');
  insert into public.edition_media (id, property_id, kind, file_name)
  values ('e4000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000001', 'foto', 'logo.png');
  if (select storage_prefix from public.edition_media where id = 'e4000000-0000-4000-8000-000000000003')
     <> 'a4000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/'
        || '94000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000003' then
    raise exception 'FALHA (a): caminho de mídia do projeto raiz';
  end if;
  raise notice 'OK (a): organização, autor, status e caminho vêm do banco';

  -- (b) Pasta da edição 2030 não serve para mídia nem subpasta da 2026.
  insert into public.edition_folders (id, property_id, name)
  values ('f4000000-0000-4000-8000-000000000030', '94000000-0000-4000-8000-000000000030', 'Jogo 1');
  begin
    insert into public.edition_media (property_id, folder_id, kind, file_name)
    values ('94000000-0000-4000-8000-000000000026', 'f4000000-0000-4000-8000-000000000030', 'video', 'x.mp4');
    raise exception 'FALHA (b): mídia numa pasta de outra edição';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.edition_folders (property_id, parent_folder_id, name)
    values ('94000000-0000-4000-8000-000000000026', 'f4000000-0000-4000-8000-000000000030', 'Câmera 1');
    raise exception 'FALHA (b): subpasta dentro de pasta de outra edição';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.edition_media set folder_id = 'f4000000-0000-4000-8000-000000000030'
     where id = 'e4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (b): mídia movida para pasta de outra edição';
  exception when foreign_key_violation then null;
  end;
  raise notice 'OK (b): pasta e pasta-mãe do mesmo projeto';

  -- (c) Jogo 1 › Câmera 1 › Close; Jogo 1 não pode ir para dentro de Close.
  insert into public.edition_folders (id, property_id, parent_folder_id, name) values
    ('f4000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000026', 'f4000000-0000-4000-8000-000000000001', 'Câmera 1');
  insert into public.edition_folders (id, property_id, parent_folder_id, name) values
    ('f4000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000026', 'f4000000-0000-4000-8000-000000000002', 'Close');
  begin
    update public.edition_folders set parent_folder_id = 'f4000000-0000-4000-8000-000000000003'
     where id = 'f4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (c): pasta foi para dentro da própria descendente';
  exception when check_violation then null;
  end;
  begin
    update public.edition_folders set parent_folder_id = id
     where id = 'f4000000-0000-4000-8000-000000000002';
    raise exception 'FALHA (c): pasta dentro dela mesma';
  exception when check_violation then null;
  end;
  -- Mover para outro ramo continua possível.
  update public.edition_folders set parent_folder_id = null
   where id = 'f4000000-0000-4000-8000-000000000003';
  raise notice 'OK (c): pasta sem ciclo';

  -- (d) Nome repetido no mesmo nível (sem diferença de maiúsculas) é recusado.
  begin
    insert into public.edition_folders (property_id, name)
    values ('94000000-0000-4000-8000-000000000026', 'JOGO 1');
    raise exception 'FALHA (d): duas pastas "Jogo 1" no mesmo nível';
  exception when unique_violation then null;
  end;
  -- Em outro nível ou em outra edição, pode.
  insert into public.edition_folders (property_id, parent_folder_id, name)
  values ('94000000-0000-4000-8000-000000000026', 'f4000000-0000-4000-8000-000000000002', 'Jogo 1');
  raise notice 'OK (d): nome único entre as pastas ativas do mesmo nível';

  -- (e) Jogo 1 tem Câmera 1 e uma mídia: não arquiva.
  begin
    update public.edition_folders set archived_at = now()
     where id = 'f4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (e): pasta com conteúdo arquivada';
  exception when check_violation then null;
  end;
  -- Close está vazia (foi para a raiz em (c)): arquiva, com data e autor do banco.
  update public.edition_folders set archived_at = '2000-01-01', archived_by = '4d000000-0000-4000-8000-00000000000d'
   where id = 'f4000000-0000-4000-8000-000000000003';
  select archived_by into _autor from public.edition_folders where id = 'f4000000-0000-4000-8000-000000000003';
  if _autor <> '4c000000-0000-4000-8000-00000000000c'
     or (select archived_at from public.edition_folders where id = 'f4000000-0000-4000-8000-000000000003') < now() - interval '1 minute' then
    raise exception 'FALHA (e): arquivamento com data ou autor do cliente';
  end if;
  begin
    update public.edition_media set folder_id = 'f4000000-0000-4000-8000-000000000003'
     where id = 'e4000000-0000-4000-8000-000000000002';
    raise exception 'FALHA (e): mídia movida para pasta arquivada';
  exception when check_violation then null;
  end;
  begin
    insert into public.edition_folders (property_id, parent_folder_id, name)
    values ('94000000-0000-4000-8000-000000000026', 'f4000000-0000-4000-8000-000000000003', 'Nova');
    raise exception 'FALHA (e): subpasta criada em pasta arquivada';
  exception when check_violation then null;
  end;
  -- Sair do arquivo limpa o autor do arquivamento.
  update public.edition_folders set archived_at = null where id = 'f4000000-0000-4000-8000-000000000003';
  if (select archived_by from public.edition_folders where id = 'f4000000-0000-4000-8000-000000000003') is not null then
    raise exception 'FALHA (e): pasta desarquivada manteve o autor do arquivamento';
  end if;
  update public.edition_folders set archived_at = now() where id = 'f4000000-0000-4000-8000-000000000003';
  -- O nome da pasta arquivada pode ser reaproveitado no mesmo nível.
  insert into public.edition_folders (property_id, name)
  values ('94000000-0000-4000-8000-000000000026', 'Close');
  raise notice 'OK (e): só pasta vazia arquiva; nada entra em pasta arquivada';

  -- (f) Cliente não escreve status, erro nem tamanho, nem objeto do R2.
  begin
    update public.edition_media set status = 'pronto' where id = 'e4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (f): cliente mudou o status da mídia';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.edition_media set declared_size_bytes = 1 where id = 'e4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (f): cliente mudou o tamanho da mídia';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.edition_media set storage_prefix = 'x' where id = 'e4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (f): cliente mudou o caminho da mídia';
  exception when check_violation then null;
  end;
  begin
    insert into public.edition_media_objects (media_id, variant, status, size_bytes, completed_at)
    values ('e4000000-0000-4000-8000-000000000001', 'original', 'enviado', 1, now());
    raise exception 'FALHA (f): cliente gravou objeto do R2';
  exception when insufficient_privilege then null;
  end;
  -- Renomear e mover continua com o cliente.
  update public.edition_media set file_name = 'camera-1-final.mp4', folder_id = null
   where id = 'e4000000-0000-4000-8000-000000000001';
  raise notice 'OK (f): campos do servidor protegidos do cliente';

  -- (i) Projeto não muda.
  begin
    update public.edition_media set property_id = '94000000-0000-4000-8000-000000000030'
     where id = 'e4000000-0000-4000-8000-000000000002';
    raise exception 'FALHA (i): mídia mudou de edição';
  exception when check_violation then null;
  end;
  begin
    update public.edition_folders set property_id = '94000000-0000-4000-8000-000000000030'
     where id = 'f4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (i): pasta mudou de edição';
  exception when check_violation then null;
  end;
  raise notice 'OK (i): projeto da mídia e da pasta não muda';

  -- (h) Sem DELETE físico.
  begin
    delete from public.edition_media where id = 'e4000000-0000-4000-8000-000000000002';
    raise exception 'FALHA (h): mídia apagada';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.edition_folders where id = 'f4000000-0000-4000-8000-000000000003';
    raise exception 'FALHA (h): pasta apagada';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (h): sem DELETE físico';
end $$;
reset role;

-- (f) e (j) como servidor (sem auth.uid(), como a Edge Function) -------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  _org uuid;
  _key text;
begin
  update public.edition_media set status = 'enviando' where id = 'e4000000-0000-4000-8000-000000000001';

  insert into public.edition_media_objects (organization_id, media_id, variant, object_key, status)
  values ('b4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000001', 'original', 'qualquer', 'enviando');
  select organization_id, object_key into _org, _key
    from public.edition_media_objects where media_id = 'e4000000-0000-4000-8000-000000000001' and variant = 'original';
  if _org <> 'a4000000-0000-4000-8000-000000000001' then
    raise exception 'FALHA (f): objeto ficou fora da organização da mídia';
  end if;
  if _key <> (select storage_prefix from public.edition_media where id = 'e4000000-0000-4000-8000-000000000001') || '/original' then
    raise exception 'FALHA (f): chave do objeto não foi montada pelo banco: %', _key;
  end if;

  begin
    update public.edition_media_objects set status = 'enviado'
     where media_id = 'e4000000-0000-4000-8000-000000000001' and variant = 'original';
    raise exception 'FALHA (f): objeto enviado sem tamanho real';
  exception when check_violation then null;
  end;
  begin
    update public.edition_media_objects set variant = 'outra'
     where media_id = 'e4000000-0000-4000-8000-000000000001' and variant = 'original';
    raise exception 'FALHA (f): objeto mudou de variante';
  exception when check_violation then null;
  end;

  update public.edition_media_objects set status = 'enviado', size_bytes = 40000000000, completed_at = now()
   where media_id = 'e4000000-0000-4000-8000-000000000001' and variant = 'original';
  insert into public.edition_media_objects (media_id, variant, status, size_bytes, completed_at)
  values ('e4000000-0000-4000-8000-000000000001', 'analise', 'enviado', 900000000, now());
  -- Objeto ainda subindo não conta no uso.
  insert into public.edition_media_objects (media_id, variant, status)
  values ('e4000000-0000-4000-8000-000000000002', 'original', 'enviando');
  insert into public.edition_media_objects (media_id, variant, status, size_bytes, completed_at)
  values ('e4000000-0000-4000-8000-000000000003', 'original', 'enviado', 5000000, now());
  update public.edition_media set status = 'enviado' where id = 'e4000000-0000-4000-8000-000000000001';
  raise notice 'OK (f): servidor grava status e objetos, com organização e chave do banco';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);

do $$
declare _bytes bigint;
begin
  -- (j) Financeiro lê o uso: 40 GB + 900 MB na edição 2026, 5 MB no projeto raiz.
  select total_bytes into _bytes from public.edition_storage_usage
   where property_id = '94000000-0000-4000-8000-000000000026';
  if _bytes is distinct from 40900000000 then
    raise exception 'FALHA (j): uso da edição 2026 = %, esperado 40900000000', _bytes;
  end if;
  select sum(total_bytes) into _bytes from public.edition_storage_usage
   where organization_id = 'a4000000-0000-4000-8000-000000000001';
  if _bytes is distinct from 40905000000 then
    raise exception 'FALHA (j): uso da organização = %, esperado 40905000000', _bytes;
  end if;
  raise notice 'OK (j): uso pelo tamanho real dos objetos enviados';

  -- (g) Financeiro lê, mas não cria nem altera.
  if (select count(*) from public.edition_media where organization_id = 'a4000000-0000-4000-8000-000000000001') <> 3 then
    raise exception 'FALHA (g): financeiro não lê a mídia da organização';
  end if;
  begin
    insert into public.edition_folders (property_id, name)
    values ('94000000-0000-4000-8000-000000000026', 'Do financeiro');
    raise exception 'FALHA (g): financeiro criou pasta';
  exception when insufficient_privilege then null;
  end;
  update public.edition_media set file_name = 'renomeado-pelo-financeiro.mp4'
   where id = 'e4000000-0000-4000-8000-000000000001';
  if (select file_name from public.edition_media where id = 'e4000000-0000-4000-8000-000000000001') <> 'camera-1-final.mp4' then
    raise exception 'FALHA (g): financeiro renomeou mídia';
  end if;
  raise notice 'OK (g): financeiro só lê';
end $$;

-- (k) Owner B: nada da organização A, e não grava no projeto de A ------------
select set_config('request.jwt.claims', '{"sub":"4b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.edition_folders where organization_id = 'a4000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.edition_media where organization_id = 'a4000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.edition_media_objects where organization_id = 'a4000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.edition_storage_usage where organization_id = 'a4000000-0000-4000-8000-000000000001')
  then
    raise exception 'FALHA (k): owner B vê mídia da organização A';
  end if;
  begin
    insert into public.edition_media (property_id, kind, file_name)
    values ('94000000-0000-4000-8000-000000000026', 'video', 'intruso.mp4');
    raise exception 'FALHA (k): owner B criou mídia no projeto de A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.edition_folders (property_id, name)
    values ('94000000-0000-4000-8000-000000000026', 'Intrusa');
    raise exception 'FALHA (k): owner B criou pasta no projeto de A';
  exception when insufficient_privilege then null;
  end;
  update public.edition_media set file_name = 'invadido.mp4' where id = 'e4000000-0000-4000-8000-000000000001';
end $$;

-- Patrocinador com portal da Marca A1: o material só chega pelo relatório (D11).
select set_config('request.jwt.claims', '{"sub":"4e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.edition_folders)
     or exists (select 1 from public.edition_media)
     or exists (select 1 from public.edition_media_objects)
     or exists (select 1 from public.edition_storage_usage)
  then
    raise exception 'FALHA (k): patrocinador lê mídia da edição direto';
  end if;
end $$;
reset role;

do $$
begin
  if (select file_name from public.edition_media where id = 'e4000000-0000-4000-8000-000000000001') <> 'camera-1-final.mp4' then
    raise exception 'FALHA (k): owner B renomeou mídia de A';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.edition_media limit 1;
    raise exception 'FALHA (k): anon lê edition_media';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.edition_folders limit 1;
    raise exception 'FALHA (k): anon lê edition_folders';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.edition_media_objects limit 1;
    raise exception 'FALHA (k): anon lê edition_media_objects';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.edition_storage_usage limit 1;
    raise exception 'FALHA (k): anon lê edition_storage_usage';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (k): isolamento entre organizações; patrocinador e anon sem acesso';
end $$;
reset role;

rollback;

\echo '=== Fim dos testes da mídia da edição ==='
