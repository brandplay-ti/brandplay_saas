-- Usuário e organização de exemplo do ambiente local, com login conhecido.
--
-- Exige o stack no ar: o schema `auth` só existe depois que o GoTrue aplica as
-- próprias migrations (rode depois de `npm run supabase:up` + `npm run
-- supabase:migrate`).
--
-- É idempotente: pode rodar quantas vezes quiser.
--
-- ATENÇÃO: uso exclusivo local. A senha abaixo é pública e este arquivo nunca
-- deve ser executado em homologação ou produção.

begin;

set local search_path = public, extensions, auth;

do $$
declare
  v_user_id    uuid := '00000000-0000-4000-a000-000000000001';
  v_email      text := 'owner@brandplay.local';
  v_password   text := 'brandplay-dev';
  v_nome       text := 'Owner de Testes';
  v_empresa    text := 'Brandplay Demo';
  v_org_id     uuid;
begin
  if to_regclass('auth.users') is null then
    raise exception
      'schema auth ausente. Suba o stack (npm run supabase:up) e aguarde o servico auth antes de rodar o seed.';
  end if;

  -- Recria do zero para manter o seed idempotente.
  -- auth.identities tem FK on delete cascade para auth.users; profiles e
  -- organization_members não têm FK formal para auth.users neste schema
  -- reconstruído (ver SCHEMA_NOTES.md), então são limpos explicitamente
  -- abaixo para não deixar linhas órfãs de execuções anteriores.
  delete from public.organization_members where user_id = v_user_id;
  delete from public.organizations where owner_id = v_user_id;
  delete from public.profiles where id = v_user_id;
  delete from auth.users where email = v_email;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_nome, 'company', v_empresa),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  );

  raise notice 'usuario de teste criado: % / %', v_email, v_password;

  -- O trigger on_auth_user_created (0006_bootstrap_functions.sql) já teria
  -- criado public.profiles automaticamente a partir de raw_user_meta_data,
  -- mas o insert acima não passa por uma sessão de signUp normal — confirma
  -- aqui mesmo, idempotente.
  insert into public.profiles (id, full_name, company)
  values (v_user_id, v_nome, v_empresa)
  on conflict (id) do update set full_name = excluded.full_name, company = excluded.company;

  -- Organização de exemplo. Desde 0015/0018, handle_new_user (trigger em
  -- auth.users) cria a organização pessoal do usuário com o nome de
  -- raw_user_meta_data->>'company' (v_empresa) e o adiciona como owner, como
  -- no cadastro real. Reaproveita essa organização; a chamada explícita só
  -- acontece se o trigger não a tiver criado.
  select o.id into v_org_id
  from public.organizations o
  where o.owner_id = v_user_id
  order by o.created_at
  limit 1;

  if v_org_id is null then
    select public.create_organization_with_owner(v_user_id, v_empresa, null) into v_org_id;
  end if;

  raise notice 'organizacao de teste criada: % (id: %)', v_empresa, v_org_id;
end $$;

commit;
