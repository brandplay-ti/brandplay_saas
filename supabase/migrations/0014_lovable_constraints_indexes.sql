-- 0014_lovable_constraints_indexes.sql
-- CHECKs de domínio, UNIQUEs e índices que existem no Lovable e faltavam na
-- reconstrução (o types.ts não os expõe).
--
-- UNIQUEs: são alvo de upserts do app e falhavam com "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification", ex.:
-- pipeline_stage_slas (Pipeline.tsx: salvar SLAs) e market_benchmarks
-- (Edge Function ticket-benchmark-ai).
--
-- FKs: 4 FKs existiam nos dois lados com ON DELETE diferente; adota-se o do
-- Lovable. Exceção deliberada: sports_properties.owner_id continua SEM
-- cascade (no Lovable, excluir o usuário apagaria as propriedades dele).
-- As 140 FKs que só existem aqui ficam (integridade); órfãos serão tratados
-- na importação de dados.

alter table public.ai_messages add constraint ai_messages_role_check CHECK ((role = ANY (ARRAY['system'::text, 'user'::text, 'assistant'::text, 'tool'::text])));
alter table public.ai_suggestions add constraint ai_suggestions_priority_check CHECK ((priority = ANY (ARRAY['alta'::text, 'media'::text, 'baixa'::text])));
alter table public.ai_suggestions add constraint ai_suggestions_status_check CHECK ((status = ANY (ARRAY['nova'::text, 'vista'::text, 'feita'::text, 'descartada'::text])));
alter table public.asset_allocations add constraint asset_allocations_asset_id_property_id_key UNIQUE (asset_id, property_id);
alter table public.brandtrack_detections add constraint brandtrack_detections_exposure_type_check CHECK ((exposure_type = ANY (ARRAY['uniforme'::text, 'placa'::text, 'backdrop'::text, 'led'::text, 'transmissao'::text, 'outro'::text])));
alter table public.brandtrack_event_brands add constraint brandtrack_event_brands_sponsor_status_check CHECK ((sponsor_status = ANY (ARRAY['patrocinador'::text, 'nao_patrocinador'::text, 'concorrente'::text, 'parceiro'::text, 'prospect'::text])));
alter table public.brandtrack_media add constraint brandtrack_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text, 'instagram'::text])));
alter table public.brandtrack_media add constraint brandtrack_media_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text])));
alter table public.contract_churn_risk add constraint contract_churn_risk_risk_level_check CHECK ((risk_level = ANY (ARRAY['baixo'::text, 'medio'::text, 'alto'::text, 'critico'::text])));
alter table public.deliveries drop constraint deliveries_sponsor_id_fkey;
alter table public.deliveries add constraint deliveries_sponsor_id_fkey_lovable FOREIGN KEY (sponsor_id) REFERENCES sponsors(id);
alter table public.delivery_approval_log add constraint delivery_approval_log_decided_by_role_check CHECK ((decided_by_role = ANY (ARRAY['comercial'::text, 'patrocinador'::text])));
alter table public.installments drop constraint installments_sponsor_id_fkey;
alter table public.installments add constraint installments_sponsor_id_fkey_lovable FOREIGN KEY (sponsor_id) REFERENCES sponsors(id);
alter table public.lead_scores add constraint lead_scores_classification_check CHECK ((classification = ANY (ARRAY['quente'::text, 'morno'::text, 'frio'::text])));
alter table public.lead_scores add constraint lead_scores_score_check CHECK (((score >= 0) AND (score <= 100)));
alter table public.lead_scores add constraint lead_scores_target_type_check CHECK ((target_type = ANY (ARRAY['sponsor'::text, 'opportunity'::text])));
alter table public.market_benchmarks add constraint market_benchmarks_organization_id_segment_key UNIQUE (organization_id, segment);
alter table public.opportunity_contacts add constraint opportunity_contacts_contact_type_check CHECK ((contact_type = ANY (ARRAY['geral'::text, 'contrato'::text, 'financeiro'::text])));
alter table public.pipeline_funnels add constraint pipeline_funnels_name_length CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 80)));
alter table public.pipeline_stage_slas add constraint pipeline_stage_slas_days_non_negative CHECK (((sla_days IS NULL) OR (sla_days >= 0)));
alter table public.pipeline_stage_slas add constraint pipeline_stage_slas_unique UNIQUE (organization_id, pipeline_funnel_id, stage);
alter table public.proposal_versions add constraint proposal_versions_channel_check CHECK ((channel = ANY (ARRAY['concept'::text, 'deck'::text, 'whatsapp'::text, 'email'::text])));
alter table public.sellout_reports drop constraint sellout_reports_property_id_fkey;
alter table public.sellout_reports add constraint sellout_reports_property_id_fkey_lovable FOREIGN KEY (property_id) REFERENCES sports_properties(id) ON DELETE CASCADE;
alter table public.sponsor_brands add constraint sponsor_brands_sponsor_id_name_key UNIQUE (sponsor_id, name);
alter table public.sponsor_invites add constraint sponsor_invites_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aceito'::text, 'expirado'::text, 'cancelado'::text])));
alter table public.sponsor_portal_access add constraint sponsor_portal_access_status_check CHECK ((status = ANY (ARRAY['convidado'::text, 'ativo'::text, 'bloqueado'::text])));
alter table public.sponsor_portal_access add constraint sponsor_portal_access_user_id_sponsor_id_key UNIQUE (user_id, sponsor_id);
alter table public.sponsors drop constraint sponsors_merged_into_sponsor_id_fkey;
alter table public.sponsors add constraint sponsors_merged_into_sponsor_id_fkey_lovable FOREIGN KEY (merged_into_sponsor_id) REFERENCES sponsors(id);
alter table public.team_audit_log add constraint team_audit_log_action_check CHECK ((action = ANY (ARRAY['invite_sent'::text, 'invite_resent'::text, 'invite_revoked'::text, 'member_created'::text, 'role_changed'::text, 'member_revoked'::text, 'member_reactivated'::text])));
alter table public.tier_assets add constraint tier_assets_tier_id_asset_id_key UNIQUE (tier_id, asset_id);
alter table public.user_stage_probabilities add constraint user_stage_probabilities_probability_check CHECK (((probability >= 0) AND (probability <= 100)));

-- índices
create index if not exists idx_ai_conversations_user ON public.ai_conversations USING btree (user_id, last_message_at DESC);
create index if not exists idx_ai_messages_conv ON public.ai_messages USING btree (conversation_id, created_at);
create index if not exists idx_ai_suggestions_user ON public.ai_suggestions USING btree (user_id, status, priority);
create index if not exists idx_assets_category ON public.assets USING btree (category);
create index if not exists idx_backend_error_logs_created_at ON public.backend_error_logs USING btree (created_at DESC);
create index if not exists idx_backend_error_logs_org_created_at ON public.backend_error_logs USING btree (organization_id, created_at DESC);
create index if not exists idx_backend_error_logs_table_action ON public.backend_error_logs USING btree (table_name, action);
create index if not exists idx_backend_error_logs_user_created_at ON public.backend_error_logs USING btree (user_id, created_at DESC);
create index if not exists idx_brandtrack_detections_media_time ON public.brandtrack_detections USING btree (media_id, start_time);
create index if not exists idx_brandtrack_detections_review_status ON public.brandtrack_detections USING btree (review_status);
create index if not exists idx_brandtrack_detections_reviewed_by ON public.brandtrack_detections USING btree (reviewed_by);
create unique index if not exists idx_brandtrack_event_brands_unique_name ON public.brandtrack_event_brands USING btree (event_id, lower(display_name));
create index if not exists idx_brandtrack_media_source_platform ON public.brandtrack_media USING btree (source_platform);
create index if not exists idx_contracts_sponsor ON public.contracts USING btree (organization_id, sponsor_id);
create index if not exists idx_crm_tasks_due ON public.crm_tasks USING btree (organization_id, status, due_date);
create index if not exists idx_crm_tasks_org_sponsor ON public.crm_tasks USING btree (organization_id, sponsor_id, status);
create index if not exists idx_deliveries_sponsor ON public.deliveries USING btree (organization_id, sponsor_id);
create index if not exists idx_deliveries_status ON public.deliveries USING btree (status);
create index if not exists idx_error_reports_created_at ON public.error_reports USING btree (created_at DESC);
create index if not exists idx_error_reports_org_created_at ON public.error_reports USING btree (organization_id, created_at DESC);
create index if not exists idx_error_reports_severity ON public.error_reports USING btree (severity);
create index if not exists idx_error_reports_user_created_at ON public.error_reports USING btree (user_id, created_at DESC);
create index if not exists idx_installments_status ON public.installments USING btree (status);
create index if not exists idx_lead_scores_org_score ON public.lead_scores USING btree (organization_id, score DESC);
create index if not exists idx_lead_scores_target ON public.lead_scores USING btree (target_type, target_id, property_id);
create unique index if not exists notifications_dedupe_idx ON public.notifications USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);
create index if not exists notifications_user_unread_idx ON public.notifications USING btree (user_id, read_at, created_at DESC);
create index if not exists idx_opportunities_owner_stage ON public.opportunities USING btree (owner_id, stage, "position");
create index if not exists idx_opportunities_sponsor ON public.opportunities USING btree (organization_id, sponsor_id);
create index if not exists opportunities_pipeline_funnel_idx ON public.opportunities USING btree (organization_id, pipeline_funnel_id);
create index if not exists idx_opportunity_activities_due ON public.opportunity_activities USING btree (due_date) WHERE (status = 'pendente'::text);
create index if not exists idx_opportunity_audit_logs_opportunity_created ON public.opportunity_audit_logs USING btree (opportunity_id, created_at DESC);
create index if not exists idx_opportunity_comments_opportunity_created ON public.opportunity_comments USING btree (opportunity_id, created_at DESC);
create unique index if not exists organizations_cnpj_unique ON public.organizations USING btree (cnpj) WHERE (cnpj IS NOT NULL);
create unique index if not exists pipeline_funnels_default_unique ON public.pipeline_funnels USING btree (organization_id) WHERE (is_default = true);
create index if not exists pipeline_funnels_org_position_idx ON public.pipeline_funnels USING btree (organization_id, "position", name);
create index if not exists pipeline_stage_slas_org_funnel_idx ON public.pipeline_stage_slas USING btree (organization_id, pipeline_funnel_id, stage);
create index if not exists idx_property_checklist_property ON public.property_checklist_items USING btree (property_id, "position");
create index if not exists idx_property_events_starts ON public.property_events USING btree (starts_at);
create index if not exists idx_property_media_property ON public.property_media USING btree (property_id, "position");
create index if not exists idx_proposal_versions_proposal ON public.proposal_versions USING btree (proposal_id, channel);
create index if not exists idx_proposals_status ON public.proposals USING btree (status);
create index if not exists idx_sponsor_audit_org_sponsor ON public.sponsor_audit_logs USING btree (organization_id, sponsor_id, created_at DESC);
create index if not exists idx_sponsor_brands_org_sponsor ON public.sponsor_brands USING btree (organization_id, sponsor_id);
create index if not exists sponsor_brandtrack_profiles_org_idx ON public.sponsor_brandtrack_profiles USING btree (organization_id, sponsor_id);
create index if not exists sponsor_contract_profiles_org_idx ON public.sponsor_contract_profiles USING btree (organization_id, sponsor_id);
create index if not exists sponsor_crm_profiles_org_idx ON public.sponsor_crm_profiles USING btree (organization_id, sponsor_id);
create index if not exists sponsor_delivery_profiles_org_idx ON public.sponsor_delivery_profiles USING btree (organization_id, sponsor_id);
create index if not exists idx_sponsor_documents_org_sponsor ON public.sponsor_documents USING btree (organization_id, sponsor_id);
create index if not exists sponsor_finance_profiles_org_idx ON public.sponsor_finance_profiles USING btree (organization_id, sponsor_id);
create index if not exists idx_sponsor_interactions_next_action ON public.sponsor_interactions USING btree (owner_id, next_action_at) WHERE ((next_action_at IS NOT NULL) AND (next_action_done = false));
create index if not exists idx_sponsor_interactions_sponsor ON public.sponsor_interactions USING btree (sponsor_id, occurred_at DESC);
create index if not exists idx_sponsor_invites_email ON public.sponsor_invites USING btree (email);
create index if not exists idx_sponsor_invites_token ON public.sponsor_invites USING btree (token);
create index if not exists sponsor_portal_profiles_org_idx ON public.sponsor_portal_profiles USING btree (organization_id, sponsor_id);
create index if not exists sponsor_proposal_profiles_org_idx ON public.sponsor_proposal_profiles USING btree (organization_id, sponsor_id);
create index if not exists idx_sponsors_org_archived ON public.sponsors USING btree (organization_id, archived_at);
create index if not exists idx_sponsors_org_lifecycle ON public.sponsors USING btree (organization_id, lifecycle);
create index if not exists idx_sports_properties_slug ON public.sports_properties USING btree (public_slug) WHERE (public_slug IS NOT NULL);
create index if not exists team_audit_log_org_created_idx ON public.team_audit_log USING btree (organization_id, created_at DESC);
