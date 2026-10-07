-- 0022_cadastro_sem_organizacao_pessoal.sql
--
-- `handle_new_user` deixa de criar organização pessoal para quem não está se
-- cadastrando como cliente.
--
-- O gatilho (herdado do Lovable, idêntico na 0018) cria uma organização para
-- todo usuário novo que não tenha convite de equipe pendente. Dois caminhos
-- entram nele sem que isso faça sentido, e os dois foram observados na
-- validação de 2026-10-05:
--
--   1. Equipe → "Criar conta" (`manage-team-access`, ação `create_user`): a
--      função cria o usuário passando o nome da organização em
--      `user_metadata.company`, e o gatilho criava uma SEGUNDA organização,
--      com o mesmo nome, da qual o membro virava owner. O membro passava a ver
--      duas organizações idênticas no seletor, uma delas vazia.
--
--   2. Portal do patrocinador (cadastro pelo link de convite): o patrocinador
--      ganhava uma organização "Minha empresa" que não usa — o acesso dele é
--      por `sponsor_portal_access`, não por `organization_members`.
--
-- Correções:
--
--   1. resolvida na Edge Function, sem mudar este gatilho: `create_user` agora
--      cria um convite de equipe pendente antes do usuário, e o gatilho segue
--      o caminho de convite que já existia. (Um sinal em `app_metadata` não
--      funciona: o GoTrue grava o usuário primeiro e o app_metadata depois, e
--      o gatilho roda no INSERT.)
--
--   2. resolvida aqui: com convite de patrocinador pendente e válido para o
--      e-mail, o gatilho não cria organização. O sinal não é forjável por quem
--      se cadastra — o convite só é criado por membro autorizado da
--      organização, via `manage-portal-access`.
--
-- Fora isso o corpo é o da 0018, sem alteração.

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
  elsif exists (
    select 1 from public.sponsor_invites si
     where lower(si.email) = lower(new.email)
       and si.status = 'pendente'
       and si.expires_at > now()
  ) then
    -- patrocinador convidado: o acesso vem de accept_sponsor_invite_by_token
    null;
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
