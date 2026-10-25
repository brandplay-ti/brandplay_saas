create table if not exists public.team_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null,
  action text not null check (action in ('invite_sent','invite_resent','invite_revoked','member_created','role_changed','member_revoked','member_reactivated')),
  target_email text,
  target_user_id uuid,
  target_member_id uuid,
  old_role public.org_role,
  new_role public.org_role,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists team_audit_log_org_created_idx on public.team_audit_log(organization_id, created_at desc);

alter table public.team_audit_log enable row level security;

drop policy if exists "Org admins can view audit log" on public.team_audit_log;
create policy "Org admins can view audit log"
on public.team_audit_log for select
to authenticated
using (public.has_org_role(auth.uid(), organization_id, array['owner','admin']::public.org_role[]));