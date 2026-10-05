CREATE OR REPLACE FUNCTION public.accept_sponsor_invite_by_token(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  _invite public.sponsor_invites%rowtype;
  _uid uuid := auth.uid();
  _email text;
  _org_id uuid;
begin
  if _uid is null then
    raise exception 'accept_sponsor_invite_by_token: usuário não autenticado';
  end if;

  select email into _email from auth.users where id = _uid;

  select * into _invite
  from public.sponsor_invites
  where token = p_token
    and status = 'pendente'
    and expires_at > now();

  if not found then
    return false;
  end if;

  if _email is null or lower(_invite.email) <> lower(_email) then
    raise exception 'accept_sponsor_invite_by_token: e-mail da conta autenticada não corresponde ao convite';
  end if;

  _org_id := coalesce(_invite.organization_id, (select organization_id from public.sponsors where id = _invite.sponsor_id));

  insert into public.sponsor_portal_access (organization_id, sponsor_id, user_id, granted_by, status)
  values (_org_id, _invite.sponsor_id, _uid, _invite.invited_by, 'ativo')
  on conflict (sponsor_id, user_id) do update set status = 'ativo', updated_at = now();

  insert into public.user_roles (user_id, role)
  values (_uid, 'patrocinador')
  on conflict (user_id, role) do nothing;

  update public.sponsor_invites
  set status = 'aceito', accepted_at = now(), accepted_user_id = _uid
  where id = _invite.id;

  return true;
end;
$function$

