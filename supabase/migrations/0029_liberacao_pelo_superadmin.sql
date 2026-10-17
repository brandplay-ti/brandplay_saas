-- 0029_liberacao_pelo_superadmin.sql
--
-- O superadmin (0027, ADR-0008) libera acesso e estende o teste pela área
-- administrativa, em vez de SQL no Studio (docs/runbooks/cobranca.md).
--
--   admin_liberar_acesso(org, horas, comentário)
--       Liberação provisória `superadmin` em billing_access_grants — o mesmo
--       mecanismo da 0025: não altera a assinatura, cai sozinha no prazo, e
--       durante ela valem os limites do plano que aguarda pagamento (ou os do
--       teste, se não houver contratação). É a saída quando a liberação em
--       confiança do cliente não bastou. Sem a regra de uma por fatura.
--   admin_revogar_liberacao(liberação, comentário)
--       Encerra uma liberação vigente (`revoked_at`), nunca apaga.
--   admin_estender_teste(org, dias, comentário)
--       Soma dias ao teste grátis, a partir do fim atual ou de agora, o que
--       for mais tarde.
--
-- As três exigem superadmin e comentário, e gravam antes/depois em
-- platform_admin_audit_log. `manual` continua sendo a liberação por SQL do
-- runbook; `superadmin` é a da tela, com o autor em `granted_by`.

-- ─── Origem `superadmin` ─────────────────────────────────────────────
alter table public.billing_access_grants
  drop constraint billing_access_grants_kind_check;
alter table public.billing_access_grants
  add constraint billing_access_grants_kind_check check (kind in ('confianca', 'manual', 'superadmin'));

alter table public.billing_access_grants
  add constraint billing_access_grants_superadmin_check check (
    kind <> 'superadmin' or (nullif(btrim(comment), '') is not null and granted_by is not null)
  );

comment on column public.billing_access_grants.kind is
  'confianca = cliente, com comprovante, uma vez por fatura; manual = equipe por SQL; superadmin = área administrativa. manual e superadmin exigem comentário.';

-- ─── Liberar acesso ──────────────────────────────────────────────────
create or replace function public.admin_liberar_acesso(_org_id uuid, _horas integer, _comentario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _antes  jsonb;
  _grant  public.billing_access_grants;
begin
  perform public.platform_admin_require();

  if nullif(btrim(_comentario), '') is null then
    raise exception 'Informe o motivo da liberação.' using errcode = 'check_violation';
  end if;
  if _horas is null or _horas < 1 or _horas > 720 then
    raise exception 'O prazo da liberação vai de 1 a 720 horas (30 dias).' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.organizations where id = _org_id) then
    raise exception 'Organização não encontrada.' using errcode = 'no_data_found';
  end if;

  _antes := jsonb_build_object('access_plan', (public.billing_access_plan(_org_id)).id);

  insert into public.billing_access_grants (organization_id, kind, comment, granted_by, expires_at)
  values (_org_id, 'superadmin', btrim(_comentario), auth.uid(), now() + make_interval(hours => _horas))
  returning * into _grant;

  insert into public.platform_admin_audit_log
    (admin_user_id, action, organization_id, target_type, target_id, before, after, comment)
  values
    (auth.uid(), 'acesso_liberado', _org_id, 'billing_access_grant', _grant.id::text, _antes,
     to_jsonb(_grant) || jsonb_build_object('access_plan', (public.billing_access_plan(_org_id)).id),
     btrim(_comentario));

  return jsonb_build_object('id', _grant.id, 'expires_at', _grant.expires_at);
end;
$$;

comment on function public.admin_liberar_acesso(uuid, integer, text) is
  'Liberação provisória de acesso pelo superadmin, com comentário obrigatório e auditoria.';

-- ─── Revogar liberação ───────────────────────────────────────────────
create or replace function public.admin_revogar_liberacao(_grant_id uuid, _comentario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _antes  public.billing_access_grants;
  _depois public.billing_access_grants;
begin
  perform public.platform_admin_require();

  if nullif(btrim(_comentario), '') is null then
    raise exception 'Informe o motivo da revogação.' using errcode = 'check_violation';
  end if;

  select * into _antes from public.billing_access_grants where id = _grant_id;
  if _antes.id is null then
    raise exception 'Liberação não encontrada.' using errcode = 'no_data_found';
  end if;
  if _antes.revoked_at is not null or _antes.expires_at <= now() then
    raise exception 'Esta liberação já não está vigente.' using errcode = 'check_violation';
  end if;

  update public.billing_access_grants set revoked_at = now()
   where id = _grant_id
  returning * into _depois;

  insert into public.platform_admin_audit_log
    (admin_user_id, action, organization_id, target_type, target_id, before, after, comment)
  values
    (auth.uid(), 'liberacao_revogada', _antes.organization_id, 'billing_access_grant', _grant_id::text,
     to_jsonb(_antes), to_jsonb(_depois), btrim(_comentario));

  return jsonb_build_object('id', _depois.id, 'revoked_at', _depois.revoked_at);
end;
$$;

comment on function public.admin_revogar_liberacao(uuid, text) is
  'Encerra uma liberação provisória vigente, com comentário obrigatório e auditoria.';

-- ─── Estender teste ──────────────────────────────────────────────────
create or replace function public.admin_estender_teste(_org_id uuid, _dias integer, _comentario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _antes  public.billing_accounts;
  _depois public.billing_accounts;
begin
  perform public.platform_admin_require();

  if nullif(btrim(_comentario), '') is null then
    raise exception 'Informe o motivo da extensão.' using errcode = 'check_violation';
  end if;
  if _dias is null or _dias < 1 or _dias > 90 then
    raise exception 'A extensão vai de 1 a 90 dias.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.organizations where id = _org_id) then
    raise exception 'Organização não encontrada.' using errcode = 'no_data_found';
  end if;

  -- Organização importada sem gatilho ainda não tem conta: garante antes.
  _antes := public.billing_ensure_account(_org_id);

  update public.billing_accounts
     set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => _dias)
   where organization_id = _org_id
  returning * into _depois;

  insert into public.platform_admin_audit_log
    (admin_user_id, action, organization_id, target_type, target_id, before, after, comment)
  values
    (auth.uid(), 'teste_estendido', _org_id, 'billing_account', _org_id::text,
     jsonb_build_object('trial_ends_at', _antes.trial_ends_at),
     jsonb_build_object('trial_ends_at', _depois.trial_ends_at, 'dias', _dias),
     btrim(_comentario));

  return jsonb_build_object('trial_ends_at', _depois.trial_ends_at);
end;
$$;

comment on function public.admin_estender_teste(uuid, integer, text) is
  'Soma dias ao teste grátis da organização (a partir do fim atual ou de agora), com comentário obrigatório e auditoria.';

-- ─── Permissões ──────────────────────────────────────────────────────
revoke all on function public.admin_liberar_acesso(uuid, integer, text) from public, anon;
revoke all on function public.admin_revogar_liberacao(uuid, text) from public, anon;
revoke all on function public.admin_estender_teste(uuid, integer, text) from public, anon;

grant execute on function public.admin_liberar_acesso(uuid, integer, text) to authenticated, service_role;
grant execute on function public.admin_revogar_liberacao(uuid, text) to authenticated, service_role;
grant execute on function public.admin_estender_teste(uuid, integer, text) to authenticated, service_role;
