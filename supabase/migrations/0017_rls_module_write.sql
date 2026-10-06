-- 0017_rls_module_write.sql
-- Leva para a RLS reconstruída as regras de acesso reais do Lovable que
-- faltavam, no padrão de nomes de 0005 (docs/architecture/
-- reconciliacao-schema-2026-10-02.md).
--
-- 1. Escrita por módulo (novo padrão 7, "<tabela>_module_<cmd>"): em 38
--    tabelas o Lovable só deixa escrever owner/admin ou o papel do módulo
--    (comercial -> crm, operacional -> operacional, financeiro -> financeiro),
--    via can_access_module(auth.uid(), organization_id, módulo, true). A
--    reconstrução usava um "<tabela>_tenant" FOR ALL com is_org_member: qualquer
--    membro escrevia em qualquer módulo. O "_tenant" vira "_tenant_read"
--    (leitura de membro), mantido só onde o Lovable dá leitura a membros.
--    Exclusões que o Lovable restringe por papel viram "<tabela>_admin_delete".
-- 2. Portal do patrocinador (padrão 6): leituras e a aprovação de entregas
--    que o portal usa e faltavam (contract_assets, contract_clauses,
--    property_media, sponsor_interactions, sponsors, sports_properties,
--    delivery_approval_log, deliveries UPDATE), escopadas por sponsor via
--    has_sponsor_portal_access.
-- 3. Escopo por usuário (padrão 3): conversas e sugestões de IA e logs de
--    erro eram legíveis por qualquer membro; passam a ser do próprio usuário
--    (logs: também owner/admin da organização).
-- 4. profiles: "profiles_select_any_authenticated" (using true) deixava
--    qualquer usuário logado ler o perfil de qualquer pessoa de qualquer
--    organização; passa a ser o próprio perfil + membros das mesmas
--    organizações.
-- 5. Leitura pública dos eventos de propriedades publicadas (media kit) e
--    "patrocinador vê o próprio acesso ao portal".
--
-- NÃO portado de propósito (violaria o isolamento por organização,
-- CLAUDE.md seção 6):
--   * policies com has_role(uid(), 'admin'): o papel GLOBAL admin lia,
--     alterava e apagava sports_properties/tier_sales/tier_assets de TODAS as
--     organizações;
--   * policies de "dono da linha" sem checar organização, inclusive
--     "Usuários criam suas propriedades" (insert com organization_id
--     arbitrário);
--   * contract_clause_templates continua com escrita só owner/admin
--     (padrão 4), mais restrito que o Lovable.
--
-- Risco conhecido herdado: deliveries_sponsor_portal_update libera todas as
-- colunas da entrega ao patrocinador (o Lovable faz o mesmo); restringir às
-- colunas de aprovação fica como melhoria futura.


-- 1. escrita por módulo

-- asset_allocations
drop policy if exists asset_allocations_tenant on public.asset_allocations;
create policy asset_allocations_tenant_read on public.asset_allocations for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM or ops users manage asset allocations"
create policy asset_allocations_module_all on public.asset_allocations for all to authenticated
  using (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))))
  with check (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))));

-- asset_photos
drop policy if exists asset_photos_tenant on public.asset_photos;
create policy asset_photos_tenant_read on public.asset_photos for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM or ops users manage asset photos"
create policy asset_photos_module_all on public.asset_photos for all to authenticated
  using (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))))
  with check (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))));

-- assets
drop policy if exists assets_tenant on public.assets;
create policy assets_tenant_read on public.assets for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Privileged users delete assets"
create policy assets_admin_delete on public.assets for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "Privileged users manage assets"
create policy assets_module_insert on public.assets for insert to authenticated
  with check (((public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)) AND (owner_id = auth.uid())));
-- Lovable: "Privileged users update assets"
create policy assets_module_update on public.assets for update to authenticated
  using ((public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- contract_assets
drop policy if exists contract_assets_tenant on public.contract_assets;
create policy contract_assets_tenant_read on public.contract_assets for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM or finance users manage contract assets"
create policy contract_assets_module_all on public.contract_assets for all to authenticated
  using (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true))))
  with check (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true))));

-- contract_clauses
drop policy if exists contract_clauses_tenant on public.contract_clauses;
create policy contract_clauses_tenant_read on public.contract_clauses for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM or finance users manage contract clauses"
create policy contract_clauses_module_all on public.contract_clauses for all to authenticated
  using (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true))))
  with check (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true))));

-- contracts
drop policy if exists contracts_tenant on public.contracts;
create policy contracts_tenant_read on public.contracts for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Privileged users delete contracts"
create policy contracts_admin_delete on public.contracts for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "Privileged users insert contracts"
create policy contracts_module_insert on public.contracts for insert to authenticated
  with check (((public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true)) AND (owner_id = auth.uid())));
-- Lovable: "Privileged users update contracts"
create policy contracts_module_update on public.contracts for update to authenticated
  using ((public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true)));

-- crm_tasks
drop policy if exists crm_tasks_tenant on public.crm_tasks;
create policy crm_tasks_tenant_read on public.crm_tasks for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users manage crm tasks"
create policy crm_tasks_module_all on public.crm_tasks for all to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))
  with check (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- deliveries
drop policy if exists deliveries_tenant on public.deliveries;
create policy deliveries_tenant_read on public.deliveries for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Ops users delete deliveries"
create policy deliveries_admin_delete on public.deliveries for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "Ops users insert deliveries"
create policy deliveries_module_insert on public.deliveries for insert to authenticated
  with check (((public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)) AND (owner_id = auth.uid())));
-- Lovable: "Ops users update deliveries"
create policy deliveries_module_update on public.deliveries for update to authenticated
  using ((public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- installments
drop policy if exists installments_tenant on public.installments;
create policy installments_tenant_read on public.installments for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Finance users delete installments"
create policy installments_module_delete on public.installments for delete to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true));
-- Lovable: "Finance users insert installments"
create policy installments_module_insert on public.installments for insert to authenticated
  with check ((public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true) AND (owner_id = auth.uid())));
-- Lovable: "Finance users update installments"
create policy installments_module_update on public.installments for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true));

-- lead_scores
drop policy if exists lead_scores_tenant on public.lead_scores;
create policy lead_scores_tenant_read on public.lead_scores for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users delete lead_scores"
create policy lead_scores_module_delete on public.lead_scores for delete to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));
-- Lovable: "CRM users insert lead_scores"
create policy lead_scores_module_insert on public.lead_scores for insert to authenticated
  with check ((public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) AND (owner_id = auth.uid())));
-- Lovable: "CRM users update lead_scores"
create policy lead_scores_module_update on public.lead_scores for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- opportunities
drop policy if exists opportunities_tenant on public.opportunities;
create policy opportunities_tenant_read on public.opportunities for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users delete opportunities"
create policy opportunities_module_delete on public.opportunities for delete to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "CRM users insert opportunities"
create policy opportunities_module_insert on public.opportunities for insert to authenticated
  with check (((organization_id IS NOT NULL) AND (owner_id = auth.uid()) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "CRM users update opportunities"
create policy opportunities_module_update on public.opportunities for update to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- opportunity_activities
drop policy if exists opportunity_activities_tenant on public.opportunity_activities;
create policy opportunity_activities_tenant_read on public.opportunity_activities for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users delete opportunity activities"
create policy opportunity_activities_module_delete on public.opportunity_activities for delete to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "CRM users create opportunity activities"
create policy opportunity_activities_module_insert on public.opportunity_activities for insert to authenticated
  with check (((organization_id IS NOT NULL) AND (owner_id = auth.uid()) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "CRM users update opportunity activities"
create policy opportunity_activities_module_update on public.opportunity_activities for update to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- opportunity_audit_logs
drop policy if exists opportunity_audit_logs_tenant on public.opportunity_audit_logs;
create policy opportunity_audit_logs_tenant_read on public.opportunity_audit_logs for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users create opportunity audit logs"
create policy opportunity_audit_logs_module_insert on public.opportunity_audit_logs for insert to authenticated
  with check (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- opportunity_comment_attachments
drop policy if exists opportunity_comment_attachments_tenant on public.opportunity_comment_attachments;
create policy opportunity_comment_attachments_tenant_read on public.opportunity_comment_attachments for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Uploaders delete opportunity comment attachments"
create policy opportunity_comment_attachments_admin_delete on public.opportunity_comment_attachments for delete to authenticated
  using (((uploaded_by = auth.uid()) OR public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role])));
-- Lovable: "CRM users create opportunity comment attachments"
create policy opportunity_comment_attachments_module_insert on public.opportunity_comment_attachments for insert to authenticated
  with check (((uploaded_by = auth.uid()) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- opportunity_comments
drop policy if exists opportunity_comments_tenant on public.opportunity_comments;
create policy opportunity_comments_tenant_read on public.opportunity_comments for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Authors delete opportunity comments"
create policy opportunity_comments_admin_delete on public.opportunity_comments for delete to authenticated
  using (((author_id = auth.uid()) OR public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role])));
-- Lovable: "CRM users create opportunity comments"
create policy opportunity_comments_module_insert on public.opportunity_comments for insert to authenticated
  with check (((author_id = auth.uid()) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "Authors update opportunity comments"
create policy opportunity_comments_module_update on public.opportunity_comments for update to authenticated
  using (((author_id = auth.uid()) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((author_id = auth.uid()) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- property_checklist_items
drop policy if exists property_checklist_items_tenant on public.property_checklist_items;
create policy property_checklist_items_tenant_read on public.property_checklist_items for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Org admins delete checklist"
create policy property_checklist_items_admin_delete on public.property_checklist_items for delete to authenticated
  using (((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'operacional'::org_role])));
-- Lovable: "Ops users create checklist"
create policy property_checklist_items_module_insert on public.property_checklist_items for insert to authenticated
  with check (((organization_id IS NOT NULL) AND (owner_id = auth.uid()) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))));
-- Lovable: "Ops users update checklist"
create policy property_checklist_items_module_update on public.property_checklist_items for update to authenticated
  using (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))))
  with check (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))));

-- property_events
drop policy if exists property_events_tenant on public.property_events;
create policy property_events_tenant_read on public.property_events for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Org admins delete events"
create policy property_events_admin_delete on public.property_events for delete to authenticated
  using (((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'operacional'::org_role])));
-- Lovable: "Ops users create events"
create policy property_events_module_insert on public.property_events for insert to authenticated
  with check (((organization_id IS NOT NULL) AND (owner_id = auth.uid()) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))));
-- Lovable: "Ops users update events"
create policy property_events_module_update on public.property_events for update to authenticated
  using (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))))
  with check (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))));

-- property_leads
drop policy if exists property_leads_tenant on public.property_leads;
create policy property_leads_tenant_read on public.property_leads for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users delete property leads"
create policy property_leads_module_delete on public.property_leads for delete to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "CRM users update property leads"
create policy property_leads_module_update on public.property_leads for update to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- property_media
drop policy if exists property_media_tenant on public.property_media;
create policy property_media_tenant_read on public.property_media for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Org admins delete property media"
create policy property_media_admin_delete on public.property_media for delete to authenticated
  using (((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'operacional'::org_role])));
-- Lovable: "CRM or ops users create property media"
create policy property_media_module_insert on public.property_media for insert to authenticated
  with check (((organization_id IS NOT NULL) AND (owner_id = auth.uid()) AND (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true))));
-- Lovable: "CRM or ops users update property media"
create policy property_media_module_update on public.property_media for update to authenticated
  using (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true))))
  with check (((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true))));

-- proposal_items
drop policy if exists proposal_items_tenant on public.proposal_items;
create policy proposal_items_tenant_read on public.proposal_items for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users delete proposal items"
create policy proposal_items_module_delete on public.proposal_items for delete to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "CRM users create proposal items"
create policy proposal_items_module_insert on public.proposal_items for insert to authenticated
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "CRM users update proposal items"
create policy proposal_items_module_update on public.proposal_items for update to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- proposal_versions
drop policy if exists proposal_versions_tenant on public.proposal_versions;
create policy proposal_versions_tenant_read on public.proposal_versions for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users delete proposal_versions"
create policy proposal_versions_module_delete on public.proposal_versions for delete to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));
-- Lovable: "CRM users insert proposal_versions"
create policy proposal_versions_module_insert on public.proposal_versions for insert to authenticated
  with check ((public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) AND (owner_id = auth.uid())));
-- Lovable: "CRM users update proposal_versions"
create policy proposal_versions_module_update on public.proposal_versions for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- proposals
drop policy if exists proposals_tenant on public.proposals;
create policy proposals_tenant_read on public.proposals for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users delete proposals"
create policy proposals_module_delete on public.proposals for delete to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));
-- Lovable: "CRM users insert proposals"
create policy proposals_module_insert on public.proposals for insert to authenticated
  with check ((public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) AND (owner_id = auth.uid())));
-- Lovable: "CRM users update proposals"
create policy proposals_module_update on public.proposals for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- sponsor_brands
drop policy if exists sponsor_brands_tenant on public.sponsor_brands;
create policy sponsor_brands_tenant_read on public.sponsor_brands for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users manage sponsor brands"
create policy sponsor_brands_module_all on public.sponsor_brands for all to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))
  with check (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- sponsor_contacts
drop policy if exists sponsor_contacts_tenant on public.sponsor_contacts;
create policy sponsor_contacts_tenant_read on public.sponsor_contacts for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users manage sponsor contacts"
create policy sponsor_contacts_module_all on public.sponsor_contacts for all to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- sponsor_contract_profiles
drop policy if exists sponsor_contract_profiles_tenant on public.sponsor_contract_profiles;
create policy sponsor_contract_profiles_tenant_read on public.sponsor_contract_profiles for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Admins delete sponsor contract profiles"
create policy sponsor_contract_profiles_admin_delete on public.sponsor_contract_profiles for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "CRM finance users create sponsor contract profiles"
create policy sponsor_contract_profiles_module_insert on public.sponsor_contract_profiles for insert to authenticated
  with check (((owner_id = auth.uid()) AND (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true))));
-- Lovable: "CRM finance users update sponsor contract profiles"
create policy sponsor_contract_profiles_module_update on public.sponsor_contract_profiles for update to authenticated
  using ((public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true)))
  with check ((public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true)));

-- sponsor_crm_profiles
drop policy if exists sponsor_crm_profiles_tenant on public.sponsor_crm_profiles;
create policy sponsor_crm_profiles_tenant_read on public.sponsor_crm_profiles for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Admins delete sponsor CRM profiles"
create policy sponsor_crm_profiles_admin_delete on public.sponsor_crm_profiles for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "CRM users create sponsor CRM profiles"
create policy sponsor_crm_profiles_module_insert on public.sponsor_crm_profiles for insert to authenticated
  with check (((owner_id = auth.uid()) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "CRM users update sponsor CRM profiles"
create policy sponsor_crm_profiles_module_update on public.sponsor_crm_profiles for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))
  with check (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- sponsor_delivery_profiles
drop policy if exists sponsor_delivery_profiles_tenant on public.sponsor_delivery_profiles;
create policy sponsor_delivery_profiles_tenant_read on public.sponsor_delivery_profiles for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Admins delete sponsor delivery profiles"
create policy sponsor_delivery_profiles_admin_delete on public.sponsor_delivery_profiles for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "Ops CRM users create sponsor delivery profiles"
create policy sponsor_delivery_profiles_module_insert on public.sponsor_delivery_profiles for insert to authenticated
  with check (((owner_id = auth.uid()) AND (public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))));
-- Lovable: "Ops CRM users update sponsor delivery profiles"
create policy sponsor_delivery_profiles_module_update on public.sponsor_delivery_profiles for update to authenticated
  using ((public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check ((public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- sponsor_documents
drop policy if exists sponsor_documents_tenant on public.sponsor_documents;
create policy sponsor_documents_tenant_read on public.sponsor_documents for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "sponsor_documents_delete"
create policy sponsor_documents_module_delete on public.sponsor_documents for delete to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));
-- Lovable: "sponsor_documents_insert"
create policy sponsor_documents_module_insert on public.sponsor_documents for insert to authenticated
  with check (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));
-- Lovable: "sponsor_documents_update"
create policy sponsor_documents_module_update on public.sponsor_documents for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))
  with check (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- sponsor_finance_profiles
drop policy if exists sponsor_finance_profiles_tenant on public.sponsor_finance_profiles;
create policy sponsor_finance_profiles_tenant_read on public.sponsor_finance_profiles for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Admins delete sponsor finance profiles"
create policy sponsor_finance_profiles_admin_delete on public.sponsor_finance_profiles for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "Finance users create sponsor finance profiles"
create policy sponsor_finance_profiles_module_insert on public.sponsor_finance_profiles for insert to authenticated
  with check (((owner_id = auth.uid()) AND public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true)));
-- Lovable: "Finance users update sponsor finance profiles"
create policy sponsor_finance_profiles_module_update on public.sponsor_finance_profiles for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true))
  with check (public.can_access_module(auth.uid(), organization_id, 'financeiro'::text, true));

-- sponsor_interactions
drop policy if exists sponsor_interactions_tenant on public.sponsor_interactions;
create policy sponsor_interactions_tenant_read on public.sponsor_interactions for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users manage sponsor interactions"
create policy sponsor_interactions_module_all on public.sponsor_interactions for all to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- sponsor_invites
drop policy if exists sponsor_invites_tenant on public.sponsor_invites;
-- Lovable: "CRM users manage sponsor invites"
create policy sponsor_invites_module_all on public.sponsor_invites for all to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- sponsor_portal_access
drop policy if exists sponsor_portal_access_tenant on public.sponsor_portal_access;
-- Lovable: "CRM users manage sponsor portal access"
create policy sponsor_portal_access_module_all on public.sponsor_portal_access for all to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- sponsor_proposal_profiles
drop policy if exists sponsor_proposal_profiles_tenant on public.sponsor_proposal_profiles;
create policy sponsor_proposal_profiles_tenant_read on public.sponsor_proposal_profiles for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Admins delete sponsor proposal profiles"
create policy sponsor_proposal_profiles_admin_delete on public.sponsor_proposal_profiles for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "CRM users create sponsor proposal profiles"
create policy sponsor_proposal_profiles_module_insert on public.sponsor_proposal_profiles for insert to authenticated
  with check (((owner_id = auth.uid()) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "CRM users update sponsor proposal profiles"
create policy sponsor_proposal_profiles_module_update on public.sponsor_proposal_profiles for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true))
  with check (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- sponsors
drop policy if exists sponsors_tenant on public.sponsors;
create policy sponsors_tenant_read on public.sponsors for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users delete sponsors"
create policy sponsors_module_delete on public.sponsors for delete to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));
-- Lovable: "CRM users insert sponsors"
create policy sponsors_module_insert on public.sponsors for insert to authenticated
  with check ((public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) AND (owner_id = auth.uid())));
-- Lovable: "CRM users update sponsors"
create policy sponsors_module_update on public.sponsors for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- sponsorship_tiers
drop policy if exists sponsorship_tiers_tenant on public.sponsorship_tiers;
create policy sponsorship_tiers_tenant_read on public.sponsorship_tiers for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users manage tiers del"
create policy sponsorship_tiers_admin_delete on public.sponsorship_tiers for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "CRM users manage tiers ins"
create policy sponsorship_tiers_module_insert on public.sponsorship_tiers for insert to authenticated
  with check ((public.can_access_module(auth.uid(), organization_id, 'crm'::text, true) AND (owner_id = auth.uid())));
-- Lovable: "CRM users manage tiers upd"
create policy sponsorship_tiers_module_update on public.sponsorship_tiers for update to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm'::text, true));

-- sports_properties
drop policy if exists sports_properties_tenant on public.sports_properties;
create policy sports_properties_tenant_read on public.sports_properties for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "Privileged users delete properties"
create policy sports_properties_admin_delete on public.sports_properties for delete to authenticated
  using (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
-- Lovable: "Privileged users insert properties"
create policy sports_properties_module_insert on public.sports_properties for insert to authenticated
  with check (((public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)) AND (owner_id = auth.uid())));
-- Lovable: "Privileged users update properties"
create policy sports_properties_module_update on public.sports_properties for update to authenticated
  using ((public.can_access_module(auth.uid(), organization_id, 'operacional'::text, true) OR public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- tier_assets
drop policy if exists tier_assets_tenant on public.tier_assets;
create policy tier_assets_tenant_read on public.tier_assets for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users manage tier assets"
create policy tier_assets_module_all on public.tier_assets for all to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));

-- tier_sales
drop policy if exists tier_sales_tenant on public.tier_sales;
create policy tier_sales_tenant_read on public.tier_sales for select to authenticated
  using (public.is_org_member(organization_id));
-- Lovable: "CRM users manage tier sales"
create policy tier_sales_module_all on public.tier_sales for all to authenticated
  using (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)))
  with check (((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm'::text, true)));
-- Lovable: "Users create own tier sales"
create policy tier_sales_member_insert on public.tier_sales for insert to authenticated
  with check (((auth.uid() = owner_id) AND (organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id) AND (EXISTS ( SELECT 1
   FROM sponsorship_tiers t
  WHERE ((t.id = tier_sales.tier_id) AND (t.organization_id = tier_sales.organization_id))))));

-- 2. portal do patrocinador
-- Lovable: "Sponsor portal user views contract assets"
drop policy if exists contract_assets_sponsor_portal_read on public.contract_assets;
create policy contract_assets_sponsor_portal_read on public.contract_assets for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM contracts c
  WHERE ((c.id = contract_assets.contract_id) AND (c.sponsor_id IS NOT NULL) AND public.has_sponsor_portal_access(c.sponsor_id)))));
-- Lovable: "Sponsor portal user views contract clauses"
drop policy if exists contract_clauses_sponsor_portal_read on public.contract_clauses;
create policy contract_clauses_sponsor_portal_read on public.contract_clauses for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM contracts c
  WHERE ((c.id = contract_clauses.contract_id) AND (c.sponsor_id IS NOT NULL) AND public.has_sponsor_portal_access(c.sponsor_id)))));
-- Lovable: "Sponsor portal user views linked media"
drop policy if exists property_media_sponsor_portal_read on public.property_media;
create policy property_media_sponsor_portal_read on public.property_media for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM contracts c
  WHERE ((c.property_id = property_media.property_id) AND (c.sponsor_id IS NOT NULL) AND public.has_sponsor_portal_access(c.sponsor_id)))));
-- Lovable: "Sponsor portal user views own interactions"
drop policy if exists sponsor_interactions_sponsor_portal_read on public.sponsor_interactions;
create policy sponsor_interactions_sponsor_portal_read on public.sponsor_interactions for select to authenticated
  using (public.has_sponsor_portal_access(sponsor_id));
-- Lovable: "Sponsor portal user views own sponsor"
drop policy if exists sponsors_sponsor_portal_read on public.sponsors;
create policy sponsors_sponsor_portal_read on public.sponsors for select to authenticated
  using (public.has_sponsor_portal_access(id));
-- Lovable: "Sponsor portal user views linked properties"
drop policy if exists sports_properties_sponsor_portal_read on public.sports_properties;
create policy sports_properties_sponsor_portal_read on public.sports_properties for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM contracts c
  WHERE ((c.property_id = sports_properties.id) AND (c.sponsor_id IS NOT NULL) AND public.has_sponsor_portal_access(c.sponsor_id)))));
-- Lovable: "Sponsor views own approval log"
drop policy if exists delivery_approval_log_sponsor_portal_read on public.delivery_approval_log;
create policy delivery_approval_log_sponsor_portal_read on public.delivery_approval_log for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (deliveries d
     JOIN contracts c ON (((c.opportunity_id = d.opportunity_id) OR (c.id = d.opportunity_id))))
  WHERE ((d.id = delivery_approval_log.delivery_id) AND (c.sponsor_id IS NOT NULL) AND public.has_sponsor_portal_access(c.sponsor_id)))));
-- Lovable: "Authenticated insert approval log"
drop policy if exists delivery_approval_log_sponsor_portal_insert on public.delivery_approval_log;
create policy delivery_approval_log_sponsor_portal_insert on public.delivery_approval_log for insert to authenticated
  with check (((decided_by = auth.uid()) AND (((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id)) OR (EXISTS ( SELECT 1
   FROM (deliveries d
     JOIN contracts c ON (((c.opportunity_id = d.opportunity_id) OR (c.id = d.opportunity_id))))
  WHERE ((d.id = delivery_approval_log.delivery_id) AND (c.sponsor_id IS NOT NULL) AND public.has_sponsor_portal_access(c.sponsor_id)))))));
-- Lovable: "Sponsor portal user updates approval"
drop policy if exists deliveries_sponsor_portal_update on public.deliveries;
create policy deliveries_sponsor_portal_update on public.deliveries for update to authenticated
  using (((sponsor_id IS NOT NULL) AND public.has_sponsor_portal_access(sponsor_id)))
  with check (((sponsor_id IS NOT NULL) AND public.has_sponsor_portal_access(sponsor_id)));

-- delivery_approval_log: a leitura e o insert de membros já não vêm do
-- _tenant FOR ALL (que permitia também update/delete do log de aprovação)
drop policy if exists delivery_approval_log_tenant on public.delivery_approval_log;
create policy delivery_approval_log_tenant_read on public.delivery_approval_log for select to authenticated
  using (public.is_org_member(organization_id));
create policy delivery_approval_log_member_insert on public.delivery_approval_log for insert to authenticated
  with check (decided_by = auth.uid() and public.is_org_member(organization_id));

-- 3. escopo por usuário
drop policy if exists ai_conversations_tenant on public.ai_conversations;
create policy ai_conversations_own on public.ai_conversations for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

drop policy if exists ai_messages_via_conversation on public.ai_messages;
create policy ai_messages_own_via_conversation on public.ai_messages for all to authenticated
  using (exists (select 1 from public.ai_conversations c
                 where c.id = ai_messages.conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.ai_conversations c
                      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()));

drop policy if exists ai_suggestions_tenant on public.ai_suggestions;
create policy ai_suggestions_own on public.ai_suggestions for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- logs: gravados pelas Edge Functions com service_role; usuários só leem
drop policy if exists backend_error_logs_tenant on public.backend_error_logs;
create policy backend_error_logs_own_read on public.backend_error_logs for select to authenticated
  using (user_id = auth.uid());
create policy backend_error_logs_admin_read on public.backend_error_logs for select to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists error_reports_tenant on public.error_reports;
create policy error_reports_own_read on public.error_reports for select to authenticated
  using (user_id = auth.uid());
create policy error_reports_admin_read on public.error_reports for select to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner','admin']));

-- 4. profiles
drop policy if exists profiles_select_any_authenticated on public.profiles;
create policy profiles_select_same_org on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.organization_members me
      join public.organization_members other on other.organization_id = me.organization_id
      where me.user_id = auth.uid() and other.user_id = profiles.id
    )
  );

-- 5. leitura pública e acesso próprio ao portal
drop policy if exists property_events_public_read on public.property_events;
create policy property_events_public_read on public.property_events for select to anon, authenticated
  using (public.is_property_published(property_id));

drop policy if exists sponsor_portal_access_own on public.sponsor_portal_access;
create policy sponsor_portal_access_own on public.sponsor_portal_access for select to authenticated
  using (user_id = auth.uid());

