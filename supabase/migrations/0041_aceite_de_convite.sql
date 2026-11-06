-- Aceite de convite de organização por quem já tem conta (fase 0 do
-- docs/architecture/plano-equipes.md).
--
-- Até aqui o convite só valia para quem se cadastrava depois dele
-- (`handle_new_user`). Para um e-mail que já tinha conta, `manage-team-access`
-- adicionava a pessoa direto como membro ativo, sem aceite, e sobrescrevia o
-- papel de quem já era membro. A partir desta migration a função só cria o
-- convite; a pessoa entra e aceita (ou recusa) com estas funções.
--
-- A autorização é o e-mail confirmado da conta logada ser o do convite. O
-- token continua servindo só para mostrar o convite antes do login
-- (`get_organization_invite_by_token`).

alter table public.team_audit_log drop constraint team_audit_log_action_check;
alter table public.team_audit_log add constraint team_audit_log_action_check check (
  action = any (array[
    'invite_sent', 'invite_resent', 'invite_revoked', 'member_created',
    'role_changed', 'member_revoked', 'member_reactivated', 'permission_changed',
    'invite_accepted', 'invite_declined'
  ])
);

-- ─── Convites da conta logada ───────────────────────────────────────
-- Um por organização (o mais recente), sem as organizações em que a pessoa já
-- é membro ativo. Conta com e-mail não confirmado não vê convite.
create or replace function public.convites_de_organizacao_pendentes()
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  role public.org_role,
  invited_by_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select distinct on (oi.organization_id)
         oi.id, oi.organization_id, o.name, oi.role,
         nullif(p.full_name, ''), oi.expires_at
    from public.organization_invites oi
    join public.organizations o on o.id = oi.organization_id
    join auth.users u on u.id = auth.uid()
    left join public.profiles p on p.id = oi.invited_by
   where lower(oi.email) = lower(u.email)
     and u.email_confirmed_at is not null
     and oi.status = 'pendente'
     and oi.expires_at > now()
     and not exists (
       select 1 from public.organization_members om
        where om.organization_id = oi.organization_id
          and om.user_id = u.id
          and om.status = 'ativo'
     )
   order by oi.organization_id, oi.created_at desc;
$$;

comment on function public.convites_de_organizacao_pendentes() is
  'Convites pendentes para o e-mail confirmado da conta logada, um por organização.';

-- Convite pendente, válido e do e-mail confirmado de auth.uid(). Convite de
-- outro e-mail tem o mesmo erro de convite inexistente: a resposta não diz se
-- o id existe.
create or replace function public.convite_da_conta(_invite_id uuid)
returns public.organization_invites
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  _invite public.organization_invites;
  _email text;
  _confirmado timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado' using errcode = '28000';
  end if;

  select u.email, u.email_confirmed_at into _email, _confirmado
    from auth.users u where u.id = auth.uid();

  select * into _invite
    from public.organization_invites
   where id = _invite_id
     and status = 'pendente'
     and expires_at > now()
   for update;

  if not found or _confirmado is null
     or lower(_invite.email) <> lower(coalesce(_email, '')) then
    raise exception 'Convite inválido ou expirado' using errcode = 'P0002';
  end if;

  return _invite;
end;
$$;

-- ─── Aceitar ─────────────────────────────────────────────────────────
-- Devolve a organização. Quem já é membro ativo mantém o papel que tem; o
-- convite só é encerrado. Membro revogado volta com o papel do convite, se o
-- convite for posterior à revogação: revogar depois de convidar vale mais.
-- O limite de usuários do plano (`trg_zz_billing_limit`, 0024) vale aqui.
create or replace function public.aceitar_convite_de_organizacao(_invite_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  _invite public.organization_invites;
  _membro public.organization_members;
  _reativado boolean := false;
begin
  _invite := public.convite_da_conta(_invite_id);

  select * into _membro
    from public.organization_members
   where organization_id = _invite.organization_id
     and user_id = auth.uid()
   for update;

  if not found then
    insert into public.organization_members (organization_id, user_id, role, status)
    values (_invite.organization_id, auth.uid(), _invite.role, 'ativo');
  elsif _membro.status <> 'ativo' then
    if _membro.updated_at > _invite.created_at then
      raise exception 'Convite inválido ou expirado' using errcode = 'P0002';
    end if;
    update public.organization_members
       set status = 'ativo', role = _invite.role, updated_at = now()
     where id = _membro.id;
    _reativado := true;
  end if;

  update public.organization_invites
     set status = 'aceito', accepted_at = now(), accepted_user_id = auth.uid()
   where id = _invite.id;

  insert into public.team_audit_log (
    organization_id, actor_id, action, target_email, target_user_id, new_role, metadata
  ) values (
    _invite.organization_id, auth.uid(), 'invite_accepted', _invite.email, auth.uid(),
    _invite.role, jsonb_build_object('invite_id', _invite.id, 'reativado', _reativado)
  );

  return _invite.organization_id;
end;
$$;

comment on function public.aceitar_convite_de_organizacao(uuid) is
  'A conta logada aceita o convite do próprio e-mail confirmado e vira membro ativo. Grava invite_accepted em team_audit_log.';

-- ─── Recusar ─────────────────────────────────────────────────────────
create or replace function public.recusar_convite_de_organizacao(_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  _invite public.organization_invites;
begin
  _invite := public.convite_da_conta(_invite_id);

  update public.organization_invites
     set status = 'recusado'
   where id = _invite.id;

  insert into public.team_audit_log (
    organization_id, actor_id, action, target_email, target_user_id, old_role, metadata
  ) values (
    _invite.organization_id, auth.uid(), 'invite_declined', _invite.email, auth.uid(),
    _invite.role, jsonb_build_object('invite_id', _invite.id)
  );
end;
$$;

comment on function public.recusar_convite_de_organizacao(uuid) is
  'A conta logada recusa o convite do próprio e-mail confirmado. Grava invite_declined em team_audit_log.';

-- ─── Membro por e-mail (só para manage-team-access) ─────────────────
-- A Edge Function precisa saber se o e-mail convidado já é membro desta
-- organização sem listar os usuários da plataforma inteira.
create or replace function public.membro_da_organizacao_por_email(_org_id uuid, _email text)
returns table (member_id uuid, user_id uuid, status text, role public.org_role)
language sql
stable
security definer
set search_path = public, auth
as $$
  select om.id, om.user_id, om.status, om.role
    from public.organization_members om
    join auth.users u on u.id = om.user_id
   where om.organization_id = _org_id
     and lower(u.email) = lower(trim(_email))
   limit 1;
$$;

revoke all on function public.convites_de_organizacao_pendentes() from public, anon, authenticated;
revoke all on function public.convite_da_conta(uuid) from public, anon, authenticated;
revoke all on function public.aceitar_convite_de_organizacao(uuid) from public, anon, authenticated;
revoke all on function public.recusar_convite_de_organizacao(uuid) from public, anon, authenticated;
revoke all on function public.membro_da_organizacao_por_email(uuid, text) from public, anon, authenticated;

grant execute on function public.convites_de_organizacao_pendentes() to authenticated, service_role;
grant execute on function public.aceitar_convite_de_organizacao(uuid) to authenticated, service_role;
grant execute on function public.recusar_convite_de_organizacao(uuid) to authenticated, service_role;
grant execute on function public.convite_da_conta(uuid) to service_role;
grant execute on function public.membro_da_organizacao_por_email(uuid, text) to service_role;
