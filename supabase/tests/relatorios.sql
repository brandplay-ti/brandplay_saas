-- Relatório em landing page (0040). Transação revertida no fim.
--
-- (a) organização vem da propriedade, nunca do cliente
-- (b) vínculo com patrocinador, momento ou contrato de outra organização é recusado
-- (c) endereço gerado, válido e fixo
-- (d) papéis (D4): módulo cria; só owner/admin publica no modo público e exclui
-- (e) excluído não muda
-- (f) isolamento entre organizações e nenhum acesso de anon
-- (g) funções da página só para service_role
-- (h) página sem valores financeiros (D7)
-- (i) modo público sem foto de menores nem evidência privada (D10)
-- (j) relatório de patrocinador sem conteúdo de outro patrocinador
-- (k) portal do patrocinador lê só o relatório publicado do próprio patrocinador

\echo '=== Testes do relatório em landing page ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'rel.owner.a@teste.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', '7b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'rel.owner.b@teste.local', '{"full_name":"Owner B"}'),
  ('00000000-0000-0000-0000-000000000000', '7c000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'rel.comercial.a@teste.local', '{"full_name":"Comercial A"}'),
  ('00000000-0000-0000-0000-000000000000', '7d000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'rel.financeiro.a@teste.local', '{"full_name":"Financeiro A"}'),
  ('00000000-0000-0000-0000-000000000000', '7e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'rel.patrocinador@teste.local', '{"full_name":"Patrocinador"}');

insert into public.organizations (id, owner_id, name) values
  ('a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'Org A relatório'),
  ('b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Org B relatório');

insert into public.organization_members (organization_id, user_id, role, status) values
  ('a7000000-0000-4000-8000-000000000001', '7c000000-0000-4000-8000-00000000000c', 'comercial', 'ativo'),
  ('a7000000-0000-4000-8000-000000000001', '7d000000-0000-4000-8000-00000000000d', 'financeiro', 'ativo');

insert into public.sports_properties (id, organization_id, owner_id, name, category, about) values
  ('97000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'Copa A', 'campeonato', 'NOTA INTERNA DA PROPRIEDADE'),
  ('97000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Copa B', 'campeonato', null);

insert into public.sponsors (id, organization_id, owner_id, name) values
  ('57000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'Marca A1'),
  ('57000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'Marca A2 concorrente'),
  ('57000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Marca B');

insert into public.property_events (id, organization_id, owner_id, property_id, title, starts_at) values
  ('e7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', '97000000-0000-4000-8000-000000000001', 'Abertura', now()),
  ('e7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', '97000000-0000-4000-8000-000000000002', 'Abertura B', now());

-- Valores sentinela: nenhum deles pode aparecer na página (D7).
insert into public.sponsorship_tiers (id, organization_id, owner_id, property_id, name, level, value) values
  ('d7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', '97000000-0000-4000-8000-000000000001', 'Master', 'master', 777111.11);
insert into public.tier_sales (organization_id, owner_id, tier_id, sponsor_id, status) values
  ('a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'd7000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', 'vendida');
insert into public.contracts (id, organization_id, owner_id, sponsor_id, property_id, title, brand, status,
                              payment_method, installments, total_value, start_date, notes) values
  ('c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a',
   '57000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001', 'Contrato A1', 'Marca A1', 'ativo',
   'parcelado', 3, 888222.22, current_date, 'NOTA INTERNA DO CONTRATO');
insert into public.deliveries (id, organization_id, owner_id, contract_id, sponsor_id, property_id, title, brand,
                               status, description, notes) values
  ('de700000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a',
   'c7000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001',
   'Placa de campo', 'Marca A1', 'entregue', 'DESCRICAO INTERNA DA ENTREGA', 'NOTA INTERNA DA ENTREGA');
insert into public.delivery_attachments (delivery_id, organization_id, owner_id, uploaded_by, storage_path, mime_type) values
  ('de700000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a',
   '7a000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-000000000001/evidencia-privada.jpg', 'image/jpeg');

insert into public.property_media (id, organization_id, owner_id, property_id, media_type, storage_path, caption, contains_minors, sponsor_id) values
  ('f7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', '97000000-0000-4000-8000-000000000001', 'photo', 'x/foto-geral.jpg', 'Geral', false, null),
  ('f7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', '97000000-0000-4000-8000-000000000001', 'photo', 'x/foto-criancas.jpg', 'Crianças', true, null),
  ('f7000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', '97000000-0000-4000-8000-000000000001', 'photo', 'x/foto-concorrente.jpg', 'Concorrente', false, '57000000-0000-4000-8000-000000000002');

insert into public.sponsor_portal_access (organization_id, sponsor_id, user_id, granted_by, status) values
  ('a7000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-00000000000e', '7a000000-0000-4000-8000-00000000000a', 'ativo');

-- (a) e (b) ----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

do $$
declare _org uuid;
begin
  -- O cliente manda a organização B; a linha fica na organização da propriedade.
  insert into public.property_posts (id, organization_id, property_id, network, kind, url, external_id, title, views, sponsor_id)
  values ('17000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001',
          'youtube', 'video', 'https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk', 'Final', 1000, null);
  select organization_id into _org from public.property_posts where id = '17000000-0000-4000-8000-000000000001';
  if _org <> 'a7000000-0000-4000-8000-000000000001' then
    raise exception 'FALHA (a): post ficou na organização enviada pelo cliente';
  end if;

  insert into public.property_posts (organization_id, property_id, network, kind, url, title, sponsor_id)
  values ('a7000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001', 'instagram', 'post',
          'https://www.instagram.com/p/ConcorrenteX/', 'Post do concorrente', '57000000-0000-4000-8000-000000000002');

  insert into public.property_indicators (organization_id, property_id, category, label, value)
  values ('b7000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001', 'numeros', 'Jogos', 198);
  insert into public.property_indicators (property_id, category, label, value)
  values ('97000000-0000-4000-8000-000000000001', 'numeros', 'Indicador zerado', 0);
  insert into public.property_indicators (property_id, category, label, value, sponsor_id)
  values ('97000000-0000-4000-8000-000000000001', 'digital', 'Views do concorrente', 5, '57000000-0000-4000-8000-000000000002');
  if exists (select 1 from public.property_indicators
              where property_id = '97000000-0000-4000-8000-000000000001'
                and organization_id <> 'a7000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (a): indicador ficou fora da organização da propriedade';
  end if;

  begin
    insert into public.property_posts (property_id, network, kind, url, sponsor_id)
    values ('97000000-0000-4000-8000-000000000001', 'instagram', 'post', 'https://www.instagram.com/p/abc/',
            '57000000-0000-4000-8000-000000000003');
    raise exception 'FALHA (b): post ligado a patrocinador de outra organização';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.property_posts (property_id, network, kind, url, event_id)
    values ('97000000-0000-4000-8000-000000000001', 'instagram', 'post', 'https://www.instagram.com/p/abc/',
            'e7000000-0000-4000-8000-000000000002');
    raise exception 'FALHA (b): post ligado a momento de outra propriedade';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.property_posts (property_id, network, kind, url, external_id)
    values ('97000000-0000-4000-8000-000000000001', 'youtube', 'video', 'https://youtu.be/x', 'x"><script>');
    raise exception 'FALHA (b): id externo fora do formato foi aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.property_posts (property_id, network, kind, url)
    values ('97000000-0000-4000-8000-000000000001', 'site', 'materia', 'javascript:alert(1)');
    raise exception 'FALHA (b): URL sem https foi aceita';
  exception when check_violation then null;
  end;
  begin
    insert into public.reports (property_id, sponsor_id, contract_id, title)
    values ('97000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002',
            'c7000000-0000-4000-8000-000000000001', 'Contrato trocado');
    raise exception 'FALHA (b): relatório ligado a contrato de outro patrocinador';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.property_media set sponsor_id = '57000000-0000-4000-8000-000000000003'
     where id = 'f7000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (b): foto ligada a patrocinador de outra organização';
  exception when foreign_key_violation then null;
  end;
  raise notice 'OK (a/b): organização vem da propriedade e vínculos cruzados são recusados';
end $$;

-- (c) e (d): comercial cria no modo da organização, não publica no modo público
do $$
declare _slug text;
begin
  insert into public.reports (id, organization_id, property_id, sponsor_id, contract_id, title, status)
  values ('a7a00000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002',
          '97000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001',
          'c7000000-0000-4000-8000-000000000001', 'Copa A × Marca Ação 2026', 'publicado');
  select slug into _slug from public.reports where id = 'a7a00000-0000-4000-8000-000000000001';
  if _slug !~ '^copa-a-marca-acao-2026-[0-9a-f]{6}$' then
    raise exception 'FALHA (c): endereço fora do formato: %', _slug;
  end if;
  if (select organization_id from public.reports where id = 'a7a00000-0000-4000-8000-000000000001')
     <> 'a7000000-0000-4000-8000-000000000001' then
    raise exception 'FALHA (a): relatório ficou na organização enviada pelo cliente';
  end if;
  if (select published_by from public.reports where id = 'a7a00000-0000-4000-8000-000000000001')
     is distinct from '7c000000-0000-4000-8000-00000000000c'::uuid then
    raise exception 'FALHA (c): publicação sem autor';
  end if;
  begin
    update public.reports set slug = 'outro-endereco' where id = 'a7a00000-0000-4000-8000-000000000001';
    raise exception 'FALHA (c): endereço mudou';
  exception when check_violation then null;
  end;
  begin
    update public.reports set access_mode = 'publico' where id = 'a7a00000-0000-4000-8000-000000000001';
    raise exception 'FALHA (d): comercial passou o relatório para público';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.reports (property_id, title, access_mode)
    values ('97000000-0000-4000-8000-000000000001', 'Público direto', 'publico');
    raise exception 'FALHA (d): comercial criou relatório público';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.reports set status = 'excluido' where id = 'a7a00000-0000-4000-8000-000000000001';
    raise exception 'FALHA (d): comercial excluiu relatório';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.reports where id = 'a7a00000-0000-4000-8000-000000000001';
    raise exception 'FALHA (d): DELETE físico de relatório foi aceito';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (c/d): endereço fixo; comercial não publica no modo público nem exclui';
end $$;

-- Financeiro só lê o módulo: não cria relatório.
select set_config('request.jwt.claims', '{"sub":"7d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.reports where id = 'a7a00000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALHA (d): membro financeiro não lê o relatório da organização';
  end if;
  begin
    insert into public.reports (property_id, title) values ('97000000-0000-4000-8000-000000000001', 'Do financeiro');
    raise exception 'FALHA (d): financeiro criou relatório';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (d): financeiro lê e não cria';
end $$;

-- Owner passa para público.
select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
update public.reports set access_mode = 'publico' where id = 'a7a00000-0000-4000-8000-000000000001';

-- Comercial não mexe mais nele.
select set_config('request.jwt.claims', '{"sub":"7c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  begin
    update public.reports set title = 'Título trocado' where id = 'a7a00000-0000-4000-8000-000000000001';
    raise exception 'FALHA (d): comercial editou relatório público';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (d): relatório público só com owner e admin';
end $$;

-- (f) isolamento -------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"7b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.reports where organization_id = 'a7000000-0000-4000-8000-000000000001') <> 0
     or (select count(*) from public.property_posts where organization_id = 'a7000000-0000-4000-8000-000000000001') <> 0
     or (select count(*) from public.property_indicators where organization_id = 'a7000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALHA (f): owner B leu conteúdo do relatório da org A';
  end if;
  update public.property_posts set title = 'invadido' where property_id = '97000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA (f): owner B alterou post da org A'; end if;
  begin
    insert into public.property_posts (property_id, network, kind, url)
    values ('97000000-0000-4000-8000-000000000001', 'site', 'materia', 'https://exemplo.com/a');
    raise exception 'FALHA (f): owner B inseriu post na propriedade da org A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.reports (property_id, title) values ('97000000-0000-4000-8000-000000000001', 'Intruso');
    raise exception 'FALHA (f): owner B criou relatório na propriedade da org A';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (f): relatório, posts e indicadores isolados entre organizações';
end $$;

-- (k) portal do patrocinador
select set_config('request.jwt.claims', '{"sub":"7e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.reports where id = 'a7a00000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALHA (k): patrocinador não lê o relatório publicado dele';
  end if;
  if (select count(*) from public.property_posts) <> 0 then
    raise exception 'FALHA (k): patrocinador leu posts direto na tabela';
  end if;
  raise notice 'OK (k): portal do patrocinador lê o relatório publicado do próprio patrocinador';
end $$;
reset role;

-- Rascunho do mesmo patrocinador não aparece no portal.
insert into public.reports (id, property_id, sponsor_id, title)
values ('a7a00000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001',
        '57000000-0000-4000-8000-000000000001', 'Rascunho');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.reports where id = 'a7a00000-0000-4000-8000-000000000002') then
    raise exception 'FALHA (k): patrocinador leu rascunho';
  end if;
end $$;
reset role;

-- anon e authenticated fora das tabelas e funções
set local role anon;
do $$
begin
  begin
    perform 1 from public.reports limit 1;
    raise exception 'FALHA (f): anon leu reports';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.property_posts limit 1;
    raise exception 'FALHA (f): anon leu property_posts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.report_landing_data('a7a00000-0000-4000-8000-000000000001', true);
    raise exception 'FALHA (g): anon executou report_landing_data';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (f/g): anon sem acesso às tabelas e à função da página';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.report_landing_data('a7a00000-0000-4000-8000-000000000001', false);
    raise exception 'FALHA (g): authenticated executou report_landing_data';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.report_landing_acesso('qualquer');
    raise exception 'FALHA (g): authenticated executou report_landing_acesso';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (g): funções da página só para service_role';
end $$;
reset role;

-- (h), (i), (j): conteúdo da página ----------------------------------------
do $$
declare
  _priv jsonb := public.report_landing_data('a7a00000-0000-4000-8000-000000000001', false);
  _pub  jsonb := public.report_landing_data('a7a00000-0000-4000-8000-000000000001', true);
  _txt  text  := _priv::text;
begin
  if _priv is null or _pub is null then
    raise exception 'FALHA (h): página sem dados';
  end if;
  if _txt like '%777111%' or _txt like '%888222%' or _txt like '%total_value%' then
    raise exception 'FALHA (h): valor de cota ou de contrato na página';
  end if;
  if _txt like '%NOTA INTERNA%' or _txt like '%DESCRICAO INTERNA%' then
    raise exception 'FALHA (h): nota ou descrição interna na página';
  end if;
  if exists (select 1 from public.installments i
              where i.contract_id = 'c7000000-0000-4000-8000-000000000001'
                and position(i.amount::text in _txt) > 0) then
    raise exception 'FALHA (h): valor de parcela na página';
  end if;

  if jsonb_array_length(_priv->'patrocinadores') <> 1
     or _priv->'patrocinadores'->0->>'nome' <> 'Marca A1'
     or _priv->'patrocinadores'->0->>'cota' <> 'Master' then
    raise exception 'FALHA (h): patrocinadores por cota: %', _priv->'patrocinadores';
  end if;

  -- D8: indicador zerado sem "exibir zero" não sai.
  if _txt like '%Indicador zerado%' then
    raise exception 'FALHA (h): indicador zerado apareceu';
  end if;

  -- D10: modo público sem menores e sem evidência privada.
  if (_pub->'fotos')::text like '%foto-criancas%' then
    raise exception 'FALHA (i): foto com menores no modo público';
  end if;
  if (_priv->'fotos')::text not like '%foto-criancas%' then
    raise exception 'FALHA (i): foto com menores sumiu do modo da organização';
  end if;
  if (_pub->'contrapartidas')::text like '%evidencia-privada%' then
    raise exception 'FALHA (i): evidência privada no modo público';
  end if;
  if (_priv->'contrapartidas')::text not like '%evidencia-privada%' then
    raise exception 'FALHA (i): evidência sumiu do modo da organização';
  end if;
  if jsonb_array_length(_pub->'contrapartidas') <> 1 then
    raise exception 'FALHA (i): contrapartidas: %', _pub->'contrapartidas';
  end if;

  if exists (
    select 1 from jsonb_array_elements(_priv->'fotos' || _priv->'posts' || _priv->'indicadores') x
     where jsonb_typeof(x->'do_patrocinador') <> 'boolean'
  ) then
    raise exception 'FALHA (j): do_patrocinador nulo no conteúdo geral';
  end if;

  -- (j) nada do concorrente no relatório da Marca A1.
  if _txt like '%concorrente%' or _txt like '%Concorrente%' then
    raise exception 'FALHA (j): conteúdo de outro patrocinador no relatório';
  end if;
  raise notice 'OK (h/i/j): página sem valor financeiro, sem menores no público e sem concorrente';
end $$;

-- (e) exclusão lógica, final
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
update public.reports set status = 'excluido' where id = 'a7a00000-0000-4000-8000-000000000001';
do $$
begin
  if (select deleted_by from public.reports where id = 'a7a00000-0000-4000-8000-000000000001')
     is distinct from '7a000000-0000-4000-8000-00000000000a'::uuid then
    raise exception 'FALHA (e): exclusão sem autor';
  end if;
  begin
    update public.reports set status = 'publicado' where id = 'a7a00000-0000-4000-8000-000000000001';
    raise exception 'FALHA (e): relatório excluído voltou';
  exception when check_violation then null;
  end;
  raise notice 'OK (e): exclusão lógica e definitiva';
end $$;
reset role;

do $$
begin
  if public.report_landing_data('a7a00000-0000-4000-8000-000000000001', true) is not null then
    raise exception 'FALHA (e): página de relatório excluído ainda tem dados';
  end if;
  if (select status from public.report_landing_acesso(
        (select slug from public.reports where id = 'a7a00000-0000-4000-8000-000000000001'))) <> 'excluido' then
    raise exception 'FALHA (e): o acesso não informa que o relatório foi excluído';
  end if;
end $$;

rollback;

\echo '=== Fim dos testes do relatório ==='
