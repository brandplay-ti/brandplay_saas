-- Isolamento do kit de marca (0034). Transação revertida no fim.

\echo '=== Testes da marca da organização ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'marca.a@teste.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', '4b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'marca.b@teste.local', '{"full_name":"Owner B"}'),
  ('00000000-0000-0000-0000-000000000000', '4c000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'marca.c@teste.local', '{"full_name":"Comercial A"}');

insert into public.organizations (id, owner_id, name) values
  ('a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a', 'Org A marca'),
  ('b4000000-0000-4000-8000-000000000002', '4b000000-0000-4000-8000-00000000000b', 'Org B marca');

insert into public.organization_members (organization_id, user_id, role, status) values
  ('a4000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-00000000000c', 'comercial', 'ativo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

insert into public.organization_brand_kits (organization_id, primary_hex, secondary_hex)
values ('a4000000-0000-4000-8000-000000000001', '#112233', '#AABBCC');

insert into public.organization_brand_assets (organization_id, kind, storage_path)
values ('a4000000-0000-4000-8000-000000000001', 'horizontal', 'a4000000-0000-4000-8000-000000000001/marca/horizontal.png');

do $$
begin
  begin
    update public.organization_brand_kits
       set primary_hex = '#GGGGGG'
     where organization_id = 'a4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA: hex inválido foi gravado';
  exception when check_violation then null;
  end;
  begin
    insert into public.organization_brand_assets (organization_id, kind, storage_path)
    values ('a4000000-0000-4000-8000-000000000001', 'banner', 'x.png');
    raise exception 'FALHA: tipo de logo desconhecido foi gravado';
  exception when check_violation then null;
  end;
  raise notice 'OK: cor e tipo de logo inválidos recusados';
end $$;

-- Comercial lê e não grava.
select set_config('request.jwt.claims', '{"sub":"4c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.organization_brand_kits
      where organization_id = 'a4000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALHA: comercial não lê o kit da própria organização';
  end if;
  update public.organization_brand_kits set primary_hex = '#000000'
   where organization_id = 'a4000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: comercial alterou a cor'; end if;
  raise notice 'OK: comercial lê e não edita';
end $$;

-- Outra organização não vê.
select set_config('request.jwt.claims', '{"sub":"4b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.organization_brand_kits
      where organization_id = 'a4000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALHA: owner B leu o kit da org A';
  end if;
  if (select count(*) from public.organization_brand_assets
      where organization_id = 'a4000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALHA: owner B leu o logo da org A';
  end if;
  update public.organization_brand_kits set primary_hex = '#000000'
   where organization_id = 'a4000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: owner B alterou o kit da org A'; end if;
  begin
    insert into public.organization_brand_kits (organization_id, primary_hex, secondary_hex)
    values ('a4000000-0000-4000-8000-000000000001', '#000000', '#111111');
    raise exception 'FALHA: owner B inseriu kit na org A';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK: kit isolado entre organizações';
end $$;

reset role;
rollback;

\echo '=== Fim dos testes da marca ==='
