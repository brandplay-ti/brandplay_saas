-- 0013_lovable_column_alignment.sql
-- Alinha tipo e default de 68 colunas ao schema real do Lovable.
--
-- Tipos: o types.ts não distingue integer/numeric/numeric(p,s) nem date/
-- timestamptz (tudo vira number/string), então a reconstrução chutou. Os
-- tipos reais evitam perda na importação dos dados do Lovable: coordenadas e
-- durações fracionárias do BrandTrack em integer, confidence/score em
-- numeric(5,2) arredondando, datas em timestamptz ganhando fuso.
--
-- Defaults: vários contrariavam os domínios reais (CHECKs portados em 0014),
-- ex.: ai_suggestions.status 'pendente' (real: 'nova'), tier_sales.status
-- 'reservado' (real: 'reservada').
--
-- Conversões com perda possível (só afetam linhas já gravadas no self-hosted,
-- hoje apenas o ambiente local): numeric -> integer arredonda; timestamptz ->
-- date usa a data em America/Sao_Paulo.

alter table public.ai_suggestions
  alter column status set default 'nova'::text;
alter table public.assets
  alter column status set default 'ativo'::text;
alter table public.assets
  alter column unit_value drop default,
  alter column unit_value type numeric using unit_value::numeric,
  alter column unit_value set default 0;
alter table public.brandtrack_brands
  alter column color set default '#3b82f6'::text;
alter table public.brandtrack_detections
  alter column bes_score drop default,
  alter column bes_score type numeric using bes_score::numeric,
  alter column bes_score set default 0;
alter table public.brandtrack_detections
  alter column confidence drop default,
  alter column confidence type numeric using confidence::numeric,
  alter column confidence set default 0;
alter table public.brandtrack_detections
  alter column duration drop default,
  alter column duration type numeric using duration::numeric,
  alter column duration set default 0;
alter table public.brandtrack_detections
  alter column end_time drop default,
  alter column end_time type numeric using end_time::numeric,
  alter column end_time set default 0;
alter table public.brandtrack_detections
  alter column exposure_type set default 'outro'::text;
alter table public.brandtrack_detections
  alter column height type numeric using height::numeric;
alter table public.brandtrack_detections
  alter column position_x type numeric using position_x::numeric;
alter table public.brandtrack_detections
  alter column position_y type numeric using position_y::numeric;
alter table public.brandtrack_detections
  alter column screen_percentage drop default,
  alter column screen_percentage type numeric using screen_percentage::numeric,
  alter column screen_percentage set default 0;
alter table public.brandtrack_detections
  alter column start_time drop default,
  alter column start_time type numeric using start_time::numeric,
  alter column start_time set default 0;
alter table public.brandtrack_detections
  alter column width type numeric using width::numeric;
alter table public.brandtrack_event_brands
  alter column priority set default 1;
alter table public.brandtrack_event_brands
  alter column sponsor_status set default 'patrocinador'::text;
alter table public.brandtrack_media
  alter column duration_seconds type numeric using duration_seconds::numeric;
alter table public.brandtrack_media
  alter column status set default 'queued'::text;
alter table public.contract_assets
  alter column unit_value drop default,
  alter column unit_value type numeric using unit_value::numeric,
  alter column unit_value set default 0;
alter table public.contract_churn_risk
  alter column risk_score drop default,
  alter column risk_score type integer using round(risk_score)::integer,
  alter column risk_score set default 0;
alter table public.contracts
  alter column custom_due_dates drop default,
  alter column custom_due_dates type date[] using custom_due_dates::date[],
  alter column custom_due_dates set default '{}'::date[];
alter table public.contracts
  alter column flat_value drop default,
  alter column flat_value type numeric using flat_value::numeric,
  alter column flat_value set default 0;
alter table public.contracts
  alter column total_value drop default,
  alter column total_value type numeric using total_value::numeric,
  alter column total_value set default 0;
alter table public.crm_tasks
  alter column status set default 'aberta'::text;
alter table public.crm_tasks
  alter column task_type set default 'followup'::text;
alter table public.deliveries
  alter column delivered_at type date using (delivered_at at time zone 'America/Sao_Paulo')::date;
alter table public.delivery_attachments
  alter column kind set default 'image'::text;
alter table public.installments
  alter column amount drop default,
  alter column amount type numeric using amount::numeric,
  alter column amount set default 0;
alter table public.installments
  alter column paid_amount type numeric using paid_amount::numeric;
alter table public.installments
  alter column paid_at type date using (paid_at at time zone 'America/Sao_Paulo')::date;
alter table public.lead_scores
  alter column fit_audience type integer using round(fit_audience)::integer;
alter table public.lead_scores
  alter column fit_history type integer using round(fit_history)::integer;
alter table public.lead_scores
  alter column fit_segment type integer using round(fit_segment)::integer;
alter table public.lead_scores
  alter column score drop default,
  alter column score type integer using round(score)::integer,
  alter column score set default 0;
alter table public.market_benchmarks
  alter column market_avg_ticket drop default,
  alter column market_avg_ticket type numeric using market_avg_ticket::numeric,
  alter column market_avg_ticket set default 0;
alter table public.market_benchmarks
  alter column market_max type numeric using market_max::numeric;
alter table public.market_benchmarks
  alter column market_min type numeric using market_min::numeric;
alter table public.notification_preferences
  alter column categories set default '{"churn_risk": true, "delivery_late": true, "installment_due": true, "opportunity_stale": true, "proposal_expiring": true, "installment_overdue": true}'::jsonb;
alter table public.opportunities
  alter column lost_value type numeric using lost_value::numeric;
alter table public.opportunity_activities
  alter column activity_type set default 'nota'::text;
alter table public.opportunity_activities
  alter column due_date type timestamp with time zone using due_date::timestamp with time zone;
alter table public.opportunity_audit_logs
  alter column new_value type numeric using new_value::numeric;
alter table public.opportunity_audit_logs
  alter column old_value type numeric using old_value::numeric;
alter table public.opportunity_contacts
  alter column contact_type set default 'geral'::text;
alter table public.organization_invites
  alter column token set default encode(gen_random_bytes(24), 'hex'::text);
alter table public.property_events
  alter column event_type set default 'jogo'::text;
alter table public.property_media
  alter column media_type set default 'photo'::text;
alter table public.proposal_items
  alter column unit_value drop default,
  alter column unit_value type numeric using unit_value::numeric,
  alter column unit_value set default 0;
alter table public.proposals
  alter column flat_value drop default,
  alter column flat_value type numeric using flat_value::numeric,
  alter column flat_value set default 0;
alter table public.proposals
  alter column total_value drop default,
  alter column total_value type numeric using total_value::numeric,
  alter column total_value set default 0;
alter table public.proposals
  alter column valid_until type date using (valid_until at time zone 'America/Sao_Paulo')::date;
alter table public.sponsor_crm_profiles
  alter column last_contact_at type date using (last_contact_at at time zone 'America/Sao_Paulo')::date;
alter table public.sponsor_invites
  alter column token set default encode(gen_random_bytes(24), 'hex'::text);
alter table public.sponsors
  alter column fans_count type bigint using fans_count::bigint;
alter table public.sponsors
  alter column last_contact_at type date using (last_contact_at at time zone 'America/Sao_Paulo')::date;
alter table public.sponsors
  alter column priority set default 'B'::sponsor_priority;
alter table public.sponsors
  alter column prize_pool type numeric using prize_pool::numeric;
alter table public.sponsorship_tiers
  alter column color set default '#64748b'::text;
alter table public.sponsorship_tiers
  alter column level set default 'custom'::text;
alter table public.sponsorship_tiers
  alter column value drop default,
  alter column value type numeric using value::numeric,
  alter column value set default 0;
alter table public.sports_properties
  alter column fans_count type numeric using fans_count::numeric;
alter table public.sports_properties
  alter column participants_count type numeric using participants_count::numeric;
alter table public.sports_properties
  alter column prize_pool type numeric using prize_pool::numeric;
alter table public.sports_properties
  alter column teams_count type numeric using teams_count::numeric;
alter table public.tier_sales
  alter column status set default 'reservada'::text;
alter table public.user_dashboard_preferences
  alter column widgets set default '[]'::jsonb;
alter table public.user_stage_probabilities
  alter column probability drop default,
  alter column probability type integer using round(probability)::integer,
  alter column probability set default 0;
