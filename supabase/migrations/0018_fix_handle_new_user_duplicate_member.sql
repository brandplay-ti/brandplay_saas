-- 0018_fix_handle_new_user_duplicate_member.sql
-- Corrige o cadastro de usuário sem convite, que falhava com
--   duplicate key value violates unique constraint "organization_members_org_user_unique"
--
-- Causa (herdada do Lovable, portada em 0015/0016): handle_new_user() cria a
-- organização pessoal e em seguida insere o usuário como owner em
-- organization_members; mas o insert em organizations já dispara
-- on_organization_created -> handle_new_organization(), que insere esse mesmo
-- membro. O segundo insert não tinha ON CONFLICT e abortava o signup inteiro.
-- Reproduzido também aplicando as migrations reais do Lovable num banco limpo
-- (supabase/lovable-migrations): a versão vigente de handle_new_user é de
-- 20260429002953 e o trigger da organização entrou em seguida, sem
-- conciliação. Ver docs/architecture/reconciliacao-schema-2026-10-02.md.
--
-- Única mudança em relação ao corpo real: "on conflict do nothing" no insert
-- do owner da organização pessoal.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare _org_id uuid; _invite record;
begin
  insert into public.profiles (id, full_name, company)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company', '')
  );
  insert into public.user_roles (user_id, role) values (new.id, 'comercial');

  -- aceita convite pendente para organização, se houver
  select * into _invite from public.organization_invites
   where lower(email) = lower(new.email) and status = 'pendente' and expires_at > now()
   order by created_at desc limit 1;

  if found then
    insert into public.organization_members (organization_id, user_id, role, status)
    values (_invite.organization_id, new.id, _invite.role, 'ativo')
    on conflict do nothing;
    update public.organization_invites
       set status = 'aceito', accepted_at = now(), accepted_user_id = new.id
     where id = _invite.id;
  else
    -- cria a organização pessoal (on_organization_created já insere o owner)
    insert into public.organizations (name, owner_id)
    values (coalesce(nullif(new.raw_user_meta_data->>'company', ''), 'Minha empresa'), new.id)
    returning id into _org_id;
    insert into public.organization_members (organization_id, user_id, role, status)
    values (_org_id, new.id, 'owner', 'ativo')
    on conflict do nothing;
  end if;
  return new;
end $function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
