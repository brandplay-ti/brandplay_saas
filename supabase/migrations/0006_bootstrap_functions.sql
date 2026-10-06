-- 0006_bootstrap_functions.sql
-- Fecha dois gaps conhecidos e documentados em supabase/migrations/SCHEMA_NOTES.md
-- e em supabase/functions/create-organization/index.ts, encontrados ao validar o
-- schema reconstruído contra um Supabase self-hosted real (signup -> setup de
-- organização): sem estas duas funções, nenhum usuário consegue concluir o
-- onboarding.
--
-- 1. Trigger que popula public.profiles a partir de auth.users no signup.
--    Padrão idiomático do Supabase (não documentado no types.ts, mas confirmado
--    pelo comportamento real de src/pages/Auth.tsx, que envia
--    `data: { full_name, company }` como metadata do signUp).
-- 2. RPC create_organization_with_owner, chamada pela Edge Function
--    create-organization com service_role (não existe policy de INSERT em
--    organizations para authenticated de propósito - ver 0005_rls_policies.sql
--    seção 7).

-- =========================================================================
-- 1. profiles a partir de auth.users
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, company)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Popula public.profiles no signup, a partir de raw_user_meta_data (full_name/company enviados por src/pages/Auth.tsx). on conflict do nothing para nao falhar em reprocessamento.';

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- 2. Criação de organização (RPC chamada com service_role, nunca por
--    authenticated direto - por isso não há policy de INSERT em organizations)
-- =========================================================================

create or replace function public.create_organization_with_owner(
  _owner_id uuid,
  _name text,
  _cnpj text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _org_id uuid;
begin
  if _owner_id is null then
    raise exception 'create_organization_with_owner: _owner_id não pode ser nulo';
  end if;
  if _name is null or btrim(_name) = '' then
    raise exception 'create_organization_with_owner: _name não pode ser vazio';
  end if;

  insert into public.organizations (owner_id, name, cnpj)
  values (_owner_id, btrim(_name), nullif(btrim(coalesce(_cnpj, '')), ''))
  returning id into _org_id;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (_org_id, _owner_id, 'owner', 'ativo');

  return _org_id;
end;
$$;

comment on function public.create_organization_with_owner(uuid, text, text) is
  'Cria uma organização e o vínculo de owner do dono numa única transação. security definer porque organizations não tem policy de INSERT para authenticated (criação de conta não é operação de uso) - chamada pela Edge Function create-organization com service_role, nunca diretamente pelo client.';
