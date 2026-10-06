-- 0005_rls_policies.sql
-- RLS para todas as tabelas de public. Ver 0004_functions.sql para
-- is_org_member / has_org_role / funções bônus, e SCHEMA_NOTES.md para as
-- suposições e divergências assumidas nesta reconstrução.
--
-- IMPORTANTE: linhas com organization_id = NULL ficam INACESSÍVEIS sob estas
-- policies (is_org_member(null) sempre retorna false). Isso é proposital -
-- nenhuma linha "órfã" de organização deve ficar visível via RLS - mas exige
-- que a aplicação SEMPRE preencha organization_id ao inserir. Ver
-- SCHEMA_NOTES.md sobre a natureza "suspeita" dessa nullability herdada do
-- types.ts original.
--
-- Convenção de nomes de policy: "<tabela>_tenant" (padrão 1), "<tabela>_via_<pai>"
-- (padrão 2), "<tabela>_own" (padrão 3), "<tabela>_admin_write" (escrita
-- restrita a owner/admin), "<tabela>_public_read" (bônus anônimo),
-- "<tabela>_sponsor_portal" (bônus portal do patrocinador).

-- =========================================================================
-- SEÇÃO 1: ENABLE ROW LEVEL SECURITY em TODAS as tabelas
-- =========================================================================

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.asset_allocations enable row level security;
alter table public.asset_photos enable row level security;
alter table public.assets enable row level security;
alter table public.backend_error_logs enable row level security;
alter table public.brandtrack_brands enable row level security;
alter table public.brandtrack_detections enable row level security;
alter table public.brandtrack_event_brands enable row level security;
alter table public.brandtrack_events enable row level security;
alter table public.brandtrack_media enable row level security;
alter table public.contract_assets enable row level security;
alter table public.contract_churn_risk enable row level security;
alter table public.contract_clause_templates enable row level security;
alter table public.contract_clauses enable row level security;
alter table public.contracts enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_approval_log enable row level security;
alter table public.delivery_attachments enable row level security;
alter table public.error_reports enable row level security;
alter table public.installments enable row level security;
alter table public.lead_scores enable row level security;
alter table public.market_benchmarks enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_activities enable row level security;
alter table public.opportunity_audit_logs enable row level security;
alter table public.opportunity_comment_attachments enable row level security;
alter table public.opportunity_comments enable row level security;
alter table public.opportunity_contacts enable row level security;
alter table public.organization_invites enable row level security;
alter table public.organization_members enable row level security;
alter table public.organizations enable row level security;
alter table public.pipeline_funnels enable row level security;
alter table public.pipeline_stage_slas enable row level security;
alter table public.profiles enable row level security;
alter table public.property_checklist_items enable row level security;
alter table public.property_events enable row level security;
alter table public.property_leads enable row level security;
alter table public.property_media enable row level security;
alter table public.proposal_items enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposals enable row level security;
alter table public.sellout_reports enable row level security;
alter table public.sponsor_audit_logs enable row level security;
alter table public.sponsor_brands enable row level security;
alter table public.sponsor_brandtrack_profiles enable row level security;
alter table public.sponsor_contacts enable row level security;
alter table public.sponsor_contract_profiles enable row level security;
alter table public.sponsor_crm_profiles enable row level security;
alter table public.sponsor_delivery_profiles enable row level security;
alter table public.sponsor_documents enable row level security;
alter table public.sponsor_executive_summaries enable row level security;
alter table public.sponsor_finance_profiles enable row level security;
alter table public.sponsor_interactions enable row level security;
alter table public.sponsor_invites enable row level security;
alter table public.sponsor_portal_access enable row level security;
alter table public.sponsor_portal_profiles enable row level security;
alter table public.sponsor_proposal_profiles enable row level security;
alter table public.sponsors enable row level security;
alter table public.sponsorship_tiers enable row level security;
alter table public.sports_properties enable row level security;
alter table public.team_audit_log enable row level security;
alter table public.tier_assets enable row level security;
alter table public.tier_sales enable row level security;
alter table public.user_dashboard_preferences enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_stage_probabilities enable row level security;

-- =========================================================================
-- SEÇÃO 2: PADRÃO 1 - "tenant por linha própria"
-- Tabelas com organization_id direto. Uma única policy `for all` cobre
-- select/insert/update/delete: só é permitido operar em linhas cuja
-- organização o usuário autenticado integra como membro ativo.
-- =========================================================================

create policy ai_conversations_tenant on public.ai_conversations for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy ai_suggestions_tenant on public.ai_suggestions for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy asset_allocations_tenant on public.asset_allocations for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy asset_photos_tenant on public.asset_photos for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy assets_tenant on public.assets for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy backend_error_logs_tenant on public.backend_error_logs for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy brandtrack_brands_tenant on public.brandtrack_brands for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy brandtrack_detections_tenant on public.brandtrack_detections for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy brandtrack_event_brands_tenant on public.brandtrack_event_brands for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy brandtrack_events_tenant on public.brandtrack_events for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy brandtrack_media_tenant on public.brandtrack_media for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy contract_assets_tenant on public.contract_assets for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy contract_churn_risk_tenant on public.contract_churn_risk for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy contract_clauses_tenant on public.contract_clauses for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy contracts_tenant on public.contracts for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy crm_tasks_tenant on public.crm_tasks for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy deliveries_tenant on public.deliveries for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy delivery_approval_log_tenant on public.delivery_approval_log for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy delivery_attachments_tenant on public.delivery_attachments for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy error_reports_tenant on public.error_reports for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy installments_tenant on public.installments for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy lead_scores_tenant on public.lead_scores for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy market_benchmarks_tenant on public.market_benchmarks for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy opportunities_tenant on public.opportunities for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy opportunity_activities_tenant on public.opportunity_activities for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy opportunity_audit_logs_tenant on public.opportunity_audit_logs for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy opportunity_comment_attachments_tenant on public.opportunity_comment_attachments for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy opportunity_comments_tenant on public.opportunity_comments for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy opportunity_contacts_tenant on public.opportunity_contacts for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy property_checklist_items_tenant on public.property_checklist_items for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy property_events_tenant on public.property_events for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy property_leads_tenant on public.property_leads for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy property_media_tenant on public.property_media for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy proposal_items_tenant on public.proposal_items for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy proposal_versions_tenant on public.proposal_versions for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy proposals_tenant on public.proposals for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sellout_reports_tenant on public.sellout_reports for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_audit_logs_tenant on public.sponsor_audit_logs for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_brands_tenant on public.sponsor_brands for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_brandtrack_profiles_tenant on public.sponsor_brandtrack_profiles for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_contacts_tenant on public.sponsor_contacts for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_contract_profiles_tenant on public.sponsor_contract_profiles for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_crm_profiles_tenant on public.sponsor_crm_profiles for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_delivery_profiles_tenant on public.sponsor_delivery_profiles for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_documents_tenant on public.sponsor_documents for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_executive_summaries_tenant on public.sponsor_executive_summaries for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_finance_profiles_tenant on public.sponsor_finance_profiles for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_interactions_tenant on public.sponsor_interactions for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_invites_tenant on public.sponsor_invites for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_portal_access_tenant on public.sponsor_portal_access for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_portal_profiles_tenant on public.sponsor_portal_profiles for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsor_proposal_profiles_tenant on public.sponsor_proposal_profiles for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsors_tenant on public.sponsors for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sponsorship_tiers_tenant on public.sponsorship_tiers for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy sports_properties_tenant on public.sports_properties for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy tier_assets_tenant on public.tier_assets for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy tier_sales_tenant on public.tier_sales for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

-- =========================================================================
-- SEÇÃO 3: PADRÃO 1 (variante) - tabelas "administrativas" com escrita
-- restrita a roles owner/admin, leitura liberada para qualquer membro ativo.
-- =========================================================================

-- organization_members: qualquer membro ativo pode ver a lista de colegas;
-- criar/editar/remover membros é ação de owner/admin (normalmente feita via
-- Edge Function `manage-team-access` com service role, mas a policy cobre
-- também o caso de uso direto pelo client).
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy organization_members_admin_write on public.organization_members
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy organization_members_admin_update on public.organization_members
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']))
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy organization_members_admin_delete on public.organization_members
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']));

-- organization_invites: membros veem os convites da própria organização;
-- criar/revogar convite é ação de owner/admin (Passo 3 pede explicitamente
-- essa restrição).
create policy organization_invites_select on public.organization_invites
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy organization_invites_admin_insert on public.organization_invites
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy organization_invites_admin_update on public.organization_invites
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']))
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy organization_invites_admin_delete on public.organization_invites
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']));

-- contract_clause_templates: qualquer membro pode ler/usar os templates,
-- mas só owner/admin pode criar/editar/remover (pedido explicitamente no
-- Passo 3).
create policy contract_clause_templates_select on public.contract_clause_templates
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy contract_clause_templates_admin_insert on public.contract_clause_templates
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy contract_clause_templates_admin_update on public.contract_clause_templates
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']))
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy contract_clause_templates_admin_delete on public.contract_clause_templates
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']));

-- pipeline_funnels / pipeline_stage_slas: configuração do funil de vendas.
-- Extensão análoga (não pedida literalmente no Passo 3, mas mesma lógica:
-- "ações administrativas" de configuração ficam com owner/admin).
create policy pipeline_funnels_select on public.pipeline_funnels
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy pipeline_funnels_admin_write on public.pipeline_funnels
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy pipeline_funnels_admin_update on public.pipeline_funnels
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']))
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy pipeline_funnels_admin_delete on public.pipeline_funnels
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']));

create policy pipeline_stage_slas_select on public.pipeline_stage_slas
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy pipeline_stage_slas_admin_write on public.pipeline_stage_slas
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy pipeline_stage_slas_admin_update on public.pipeline_stage_slas
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']))
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy pipeline_stage_slas_admin_delete on public.pipeline_stage_slas
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']));

-- team_audit_log: log de auditoria de mudanças de equipe. Somente
-- owner/admin podem ler; inserts na prática vêm de Edge Functions com
-- service role (que ignora RLS), então não liberamos INSERT para
-- `authenticated` além do que já é coberto por owner/admin.
create policy team_audit_log_select on public.team_audit_log
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']));

create policy team_audit_log_admin_insert on public.team_audit_log
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']));

-- =========================================================================
-- SEÇÃO 4: PADRÃO 2 - "tenant por herança"
-- Tabelas sem organization_id próprio, que só têm FK para uma tabela com
-- organization_id.
-- =========================================================================

-- ai_messages -> ai_conversations.organization_id
create policy ai_messages_via_conversation on public.ai_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and public.is_org_member(c.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and public.is_org_member(c.organization_id)
    )
  );

-- =========================================================================
-- SEÇÃO 5: PADRÃO 3 - "escopo por usuário" (sem organização)
-- =========================================================================

-- profiles: qualquer usuário autenticado pode LER perfis (necessário para a
-- UI mostrar nomes de "criado por"/"responsável" em várias telas), mas só
-- pode editar/inserir/apagar o próprio perfil.
create policy profiles_select_any_authenticated on public.profiles
  for select to authenticated
  using (true);

create policy profiles_own_write on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- notification_preferences: só o próprio usuário.
create policy notification_preferences_own on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- user_roles: papel de plataforma (app_role: admin/comercial/patrocinador).
-- Usuário só pode LER o próprio papel; escrita não é liberada para
-- `authenticated` (deve ser feita por service role / função administrativa,
-- para impedir que um usuário se autopromova a admin).
create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

-- notifications: embora tenha organization_id, a notificação é pessoal
-- (pertence a um usuário específico) - decidimos aplicar o padrão 3
-- (escopo por usuário) em vez do padrão 1, para que um admin da organização
-- não veja notificações de outro usuário. Ver SCHEMA_NOTES.md.
create policy notifications_own on public.notifications
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================================
-- SEÇÃO 6: escopo combinado usuário + organização
-- (preferências pessoais que só fazem sentido dentro de uma organização da
-- qual o usuário é membro)
-- =========================================================================

create policy user_dashboard_preferences_own on public.user_dashboard_preferences
  for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

create policy user_stage_probabilities_own on public.user_stage_probabilities
  for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- =========================================================================
-- SEÇÃO 7: PADRÃO 4 - organizations
-- Membros podem ler; só owner/admin pode atualizar; NENHUMA policy de INSERT
-- é criada para `authenticated` - a criação de organização deve passar pela
-- função RPC `create_organization_with_owner` (security definer, já
-- referenciada no types.ts original em Functions), executada tipicamente a
-- partir da Edge Function `create-organization` com service role, que
-- ignora RLS. Sem policy de DELETE também (exclusão de organização é uma
-- operação sensível demais para liberar via client - deve ser uma rotina
-- administrativa própria, fora do escopo deste schema).
-- =========================================================================

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_admin_update on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner','admin']))
  with check (public.has_org_role(id, array['owner','admin']));

-- =========================================================================
-- SEÇÃO 8 (BÔNUS): leitura pública anônima para a página "Media Kit"
-- (src/pages/PublicMediaKit.tsx, rota pública tipo /p/:slug, usada sem
-- login). Evidenciado diretamente no código-fonte do frontend, não é uma
-- suposição. Estas policies são ADICIONAIS às de tenant acima - RLS aplica
-- OR entre múltiplas policies permissivas do mesmo comando, então membros da
-- organização continuam enxergando tudo via as policies da Seção 2, e o
-- público anônimo passa a enxergar adicionalmente o subconjunto "publicado".
-- =========================================================================

create policy sports_properties_public_read on public.sports_properties
  for select to anon
  using (is_published = true);

create policy property_media_public_read on public.property_media
  for select to anon
  using (public.is_property_published(property_id));

create policy sponsorship_tiers_public_read on public.sponsorship_tiers
  for select to anon
  using (public.is_property_published(property_id));

create policy tier_sales_public_read on public.tier_sales
  for select to anon
  using (public.is_tier_publicly_visible(tier_id));

create policy tier_assets_public_read on public.tier_assets
  for select to anon
  using (public.is_tier_publicly_visible(tier_id));

create policy asset_allocations_public_read on public.asset_allocations
  for select to anon
  using (public.is_property_published(property_id));

create policy assets_public_read on public.assets
  for select to anon
  using (public.is_asset_publicly_visible(id));

create policy asset_photos_public_read on public.asset_photos
  for select to anon
  using (public.is_asset_publicly_visible(asset_id));

create policy contracts_public_read on public.contracts
  for select to anon
  using (
    property_id is not null
    and status in ('ativo', 'vencendo')
    and public.is_property_published(property_id)
  );

create policy sponsors_public_read on public.sponsors
  for select to anon
  using (public.is_sponsor_publicly_visible(id));

-- property_leads: o formulário público de captação de leads
-- (handleSubmitLead em PublicMediaKit.tsx) insere sem sessão. Liberamos
-- somente INSERT para propriedades publicadas; SELECT/UPDATE/DELETE
-- continuam restritos aos membros da organização (Seção 2).
create policy property_leads_public_insert on public.property_leads
  for insert to anon
  with check (public.is_property_published(property_id));

-- =========================================================================
-- SEÇÃO 9 (BÔNUS): portal do patrocinador (app_role = 'patrocinador')
-- Usuários com acesso concedido via sponsor_portal_access devem enxergar os
-- próprios contratos/entregas/parcelas/propostas mesmo sem serem membros da
-- organização (organization_members). Policies adicionais de SELECT.
-- =========================================================================

create policy contracts_sponsor_portal_read on public.contracts
  for select to authenticated
  using (sponsor_id is not null and public.has_sponsor_portal_access(sponsor_id));

create policy deliveries_sponsor_portal_read on public.deliveries
  for select to authenticated
  using (sponsor_id is not null and public.has_sponsor_portal_access(sponsor_id));

create policy delivery_attachments_sponsor_portal_read on public.delivery_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      where d.id = delivery_attachments.delivery_id
        and d.sponsor_id is not null
        and public.has_sponsor_portal_access(d.sponsor_id)
    )
  );

create policy installments_sponsor_portal_read on public.installments
  for select to authenticated
  using (sponsor_id is not null and public.has_sponsor_portal_access(sponsor_id));

create policy proposals_sponsor_portal_read on public.proposals
  for select to authenticated
  using (sponsor_id is not null and public.has_sponsor_portal_access(sponsor_id));

create policy proposal_items_sponsor_portal_read on public.proposal_items
  for select to authenticated
  using (
    exists (
      select 1 from public.proposals p
      where p.id = proposal_items.proposal_id
        and p.sponsor_id is not null
        and public.has_sponsor_portal_access(p.sponsor_id)
    )
  );

create policy property_checklist_items_sponsor_portal_read on public.property_checklist_items
  for select to authenticated
  using (sponsor_id is not null and public.has_sponsor_portal_access(sponsor_id));

create policy sponsor_documents_sponsor_portal_read on public.sponsor_documents
  for select to authenticated
  using (public.has_sponsor_portal_access(sponsor_id));
