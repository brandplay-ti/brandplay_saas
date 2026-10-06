-- 0003_tables.sql
-- Schema reconstruído por INFERÊNCIA a partir de
-- src/integrations/supabase/types.ts (não há acesso ao `supabase db pull` do
-- projeto remoto). Ver SCHEMA_NOTES.md para a lista completa de suposições.
--
-- Estratégia de FKs: para evitar problemas de ordenação com ~70 tabelas e
-- referências cruzadas (ex.: sponsor_interactions -> contracts/deliveries/
-- installments/opportunities/proposals, todas criadas depois de sponsors),
-- todas as tabelas são criadas primeiro SEM foreign keys inline, e todas as
-- FKs + índices são adicionados em um bloco único ao final deste arquivo.
-- Isso é funcionalmente idêntico a inline FKs, só que elimina qualquer
-- necessidade de ordenar as ~70 tabelas por dependência.

-- =========================================================================
-- SEÇÃO 1: CREATE TABLE (sem FKs)
-- =========================================================================

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid,
  -- suposição: default 'Nova conversa' (Insert tem `title?`, logo há default no banco)
  title text not null default 'Nova conversa',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  role text not null,
  content text,
  tool_call_id text,
  tool_calls jsonb,
  tool_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid,
  category text not null,
  title text not null,
  description text,
  -- suposição: default 'media'
  priority text not null default 'media',
  -- suposição: default 'pendente'
  status text not null default 'pendente',
  action_url text,
  related_entity_id uuid,
  related_entity_type text,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.asset_allocations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  property_id uuid not null,
  organization_id uuid,
  created_at timestamptz not null default now()
);

create table public.asset_photos (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  organization_id uuid,
  storage_path text not null,
  is_cover boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  name text not null,
  category text not null,
  -- suposição: default 'disponivel'
  status text not null default 'disponivel',
  quantity integer not null default 1,
  unit_value numeric(14,2) not null default 0,
  is_exclusive boolean not null default false,
  exclusive_sponsor_id uuid,
  exclusivity_terms text[] not null default '{}'::text[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.backend_error_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  user_id uuid not null,
  user_email text,
  table_name text not null,
  action text not null,
  attempted_row_keys text[] not null default '{}'::text[],
  error_code text,
  error_message text,
  error_details text,
  error_hint text,
  matching_policies jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  client_file text,
  client_line integer,
  created_at timestamptz not null default now()
);

create table public.brandtrack_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  sponsor_id uuid,
  name text not null,
  color text,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brandtrack_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  property_id uuid,
  name text not null,
  description text,
  event_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brandtrack_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  event_id uuid,
  title text not null,
  media_type text not null,
  source_platform text,
  external_url text,
  storage_path text,
  thumbnail_path text,
  -- suposição: default 'pendente'
  status text not null default 'pendente',
  progress integer not null default 0,
  error_message text,
  duration_seconds integer,
  file_size bigint,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brandtrack_detections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  media_id uuid not null,
  brand_id uuid,
  brand_name text not null,
  corrected_brand_name text,
  -- suposição: default 'logo'
  exposure_type text not null default 'logo',
  corrected_exposure_type text,
  -- suposição: campos de tempo de vídeo tratados como segundos fracionários (numeric)
  -- em vez de integer, para permitir precisão de frame/milissegundo.
  start_time numeric(10,3) not null default 0,
  end_time numeric(10,3) not null default 0,
  duration numeric(10,3) not null default 0,
  screen_percentage numeric(5,2) not null default 0,
  confidence numeric(5,2) not null default 0,
  bes_score numeric(5,2) not null default 0,
  position_x integer,
  position_y integer,
  width integer,
  height integer,
  evidence_path text,
  -- suposição: default 'pendente'
  review_status text not null default 'pendente',
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.brandtrack_event_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  event_id uuid not null,
  brand_id uuid,
  sponsor_id uuid,
  display_name text not null,
  aliases text[] not null default '{}'::text[],
  -- suposição: default 'esperado'
  sponsor_status text not null default 'esperado',
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  trade_name text,
  legal_name text,
  legal_representative text,
  cnpj text,
  state_registration text,
  email text,
  phone text,
  website text,
  logo_path text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  zip_code text,
  -- suposições de defaults (aplicação brasileira - enums em pt-BR confirmam isso):
  currency text not null default 'BRL',
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  role public.org_role not null default 'comercial',
  -- valores confirmados em supabase/functions/manage-team-access: 'ativo' | 'revogado'
  -- (provável também 'pendente' antes de aceite, mas convite fica em organization_invites)
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_org_user_unique unique (organization_id, user_id)
);

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  email text not null,
  role public.org_role not null default 'comercial',
  -- suposição: default 'pendente' (status observados no código: 'revogado', e presumivelmente 'aceito'/'expirado')
  status text not null default 'pendente',
  -- confirmado em supabase/functions/manage-team-access/index.ts: reenvio usa +14 dias
  expires_at timestamptz not null default (now() + interval '14 days'),
  token text not null default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid not null,
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_at timestamptz not null default now(),
  constraint organization_invites_token_unique unique (token)
);

create table public.pipeline_funnels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  description text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pipeline_stage_slas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  pipeline_funnel_id uuid,
  stage public.opportunity_stage not null,
  sla_days integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key,
  full_name text,
  company text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  constraint user_roles_user_role_unique unique (user_id, role)
);

create table public.notification_preferences (
  user_id uuid primary key,
  email_enabled boolean not null default true,
  inapp_enabled boolean not null default true,
  categories jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid,
  category text not null,
  -- suposição: default 'media'
  priority text not null default 'media',
  title text not null,
  description text,
  action_url text,
  related_entity_id uuid,
  related_entity_type text,
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_dashboard_preferences (
  user_id uuid not null,
  organization_id uuid not null,
  widgets jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_dashboard_preferences_pkey primary key (user_id, organization_id)
);

create table public.user_stage_probabilities (
  user_id uuid not null,
  organization_id uuid not null,
  stage public.opportunity_stage not null,
  probability numeric(5,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint user_stage_probabilities_pkey primary key (user_id, organization_id, stage)
);

create table public.team_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_id uuid not null,
  action text not null,
  target_member_id uuid,
  target_user_id uuid,
  target_email text,
  old_role public.org_role,
  new_role public.org_role,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.error_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  user_email text,
  user_agent text,
  -- suposição: default 'error'
  severity text not null default 'error',
  -- suposição: default 'frontend'
  source text not null default 'frontend',
  message text not null,
  stack text,
  component_stack text,
  route text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sports_properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  parent_property_id uuid,
  name text not null,
  category text not null,
  description text,
  about text,
  key_notes text,
  -- suposição: default 'ativo'
  status text not null default 'ativo',
  locations text[] not null default '{}'::text[],
  final_location text,
  start_date date,
  end_date date,
  season_year integer,
  audience_estimate integer,
  fans_count integer,
  participants_count integer,
  teams_count integer,
  prize_pool numeric(14,2),
  social_links jsonb not null default '{}'::jsonb,
  social_stats jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  public_slug text,
  public_headline text,
  public_about text,
  public_cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_properties_public_slug_unique unique (public_slug)
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  account_owner_id uuid,
  merged_into_sponsor_id uuid,
  name text not null,
  trade_name text,
  legal_name text,
  tax_id text,
  domain text,
  website text,
  logo_path text,
  about text,
  key_notes text,
  address text,
  address_city text,
  address_state text,
  zip_code text,
  locations text[] not null default '{}'::text[],
  final_location text,
  segment text,
  tags text[] not null default '{}'::text[],
  fans_count integer,
  participants_count integer,
  teams_count integer,
  prize_pool numeric(14,2),
  social_links jsonb not null default '{}'::jsonb,
  social_stats jsonb not null default '{}'::jsonb,
  lifecycle public.sponsor_lifecycle not null default 'prospect',
  health public.sponsor_health not null default 'nao_aplicavel',
  score public.sponsor_score not null default 'morno',
  -- suposição: default 'C' (menor prioridade). Poderia igualmente ser 'B'.
  priority public.sponsor_priority not null default 'C',
  next_action text,
  next_action_at timestamptz,
  last_contact_at timestamptz,
  notes text,
  archive_reason text,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sponsor_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  sponsor_id uuid not null,
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.sponsor_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_id uuid,
  sponsor_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  source public.crm_audit_source not null default 'manual',
  created_at timestamptz not null default now()
);

create table public.sponsor_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sponsor_id uuid not null,
  brandtrack_brand_id uuid,
  created_by uuid,
  name text not null,
  category text,
  website text,
  logo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sponsor_brandtrack_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_id uuid not null,
  sponsor_id uuid not null,
  brand_colors text[] not null default '{}'::text[],
  detection_aliases text[] not null default '{}'::text[],
  tracking_settings jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_brandtrack_profiles_sponsor_unique unique (sponsor_id)
);

create table public.sponsor_contract_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_id uuid not null,
  sponsor_id uuid not null,
  legal_name text,
  tax_id text,
  billing_contact text,
  contract_preferences jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_contract_profiles_sponsor_unique unique (sponsor_id)
);

create table public.sponsor_crm_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_id uuid not null,
  sponsor_id uuid not null,
  score public.sponsor_score not null default 'morno',
  segment text,
  tags text[] not null default '{}'::text[],
  last_contact_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_crm_profiles_sponsor_unique unique (sponsor_id)
);

create table public.sponsor_delivery_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_id uuid not null,
  sponsor_id uuid not null,
  approval_contact text,
  evidence_preferences jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_delivery_profiles_sponsor_unique unique (sponsor_id)
);

create table public.sponsor_finance_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_id uuid not null,
  sponsor_id uuid not null,
  billing_email text,
  payment_terms text,
  invoice_data jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_finance_profiles_sponsor_unique unique (sponsor_id)
);

create table public.sponsor_portal_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_id uuid not null,
  sponsor_id uuid not null,
  portal_display_name text,
  portal_settings jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_portal_profiles_sponsor_unique unique (sponsor_id)
);

create table public.sponsor_proposal_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_id uuid not null,
  sponsor_id uuid not null,
  preferred_contact_name text,
  preferred_contact_email text,
  proposal_preferences jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_proposal_profiles_sponsor_unique unique (sponsor_id)
);

create table public.sponsor_executive_summaries (
  sponsor_id uuid primary key,
  organization_id uuid,
  owner_id uuid not null,
  summary text not null,
  highlights jsonb not null default '[]'::jsonb,
  model text,
  generated_at timestamptz not null default now()
);

create table public.sponsor_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sponsor_id uuid not null,
  uploaded_by uuid,
  title text not null,
  -- suposição: default 'outro'
  category text not null default 'outro',
  description text,
  journey_stage text,
  file_name text not null,
  file_path text not null,
  file_size bigint,
  file_type text,
  ai_enabled boolean not null default true,
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sponsor_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  sponsor_id uuid not null,
  email text not null,
  -- suposição: default 'pendente'
  status text not null default 'pendente',
  -- confirmado em supabase/functions/manage-portal-access/index.ts: +14 dias
  expires_at timestamptz not null default (now() + interval '14 days'),
  token text not null default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid not null,
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_at timestamptz not null default now(),
  constraint sponsor_invites_token_unique unique (token)
);

create table public.sponsor_portal_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  sponsor_id uuid not null,
  user_id uuid not null,
  granted_by uuid not null,
  -- confirmado em supabase/functions/manage-portal-access/index.ts: 'ativo'
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_portal_access_sponsor_user_unique unique (sponsor_id, user_id)
);

create table public.sponsorship_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  property_id uuid not null,
  name text not null,
  -- suposição: default 'ouro'
  level text not null default 'ouro',
  description text,
  benefits text,
  color text,
  value numeric(14,2) not null default 0,
  total_slots integer not null default 1,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tier_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  tier_id uuid not null,
  asset_id uuid not null,
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.tier_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  tier_id uuid not null,
  sponsor_id uuid,
  contract_id uuid,
  brand text,
  -- suposição: default 'reservado'
  status text not null default 'reservado',
  notes text,
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.property_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  property_id uuid not null,
  title text not null,
  -- suposição: default 'evento'
  event_type text not null default 'evento',
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- suposição: default 'agendado'
  status text not null default 'agendado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  property_id uuid not null,
  -- suposição: default 'foto'
  media_type text not null default 'foto',
  storage_path text,
  external_url text,
  thumbnail_url text,
  caption text,
  is_cover boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  property_id uuid not null,
  tier_id uuid,
  created_opportunity_id uuid,
  contact_name text not null,
  email text not null,
  phone text,
  company text,
  budget_range text,
  message text,
  -- suposição: default 'novo'
  status text not null default 'novo',
  created_at timestamptz not null default now()
);

create table public.property_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  property_id uuid not null,
  event_id uuid,
  opportunity_id uuid,
  delivery_id uuid,
  sponsor_id uuid,
  title text not null,
  description text,
  assignee text,
  -- suposição: default 'pendente'
  status text not null default 'pendente',
  position integer not null default 0,
  due_date date,
  completed_at timestamptz,
  evidence_path text,
  evidence_geo jsonb,
  evidence_taken_at timestamptz,
  evidence_taken_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sellout_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  property_id uuid,
  event_id uuid,
  title text not null,
  content text not null,
  metrics jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

create table public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  property_id uuid,
  target_id uuid not null,
  target_type text not null,
  -- suposição: default 'morno'
  classification text not null default 'morno',
  score numeric(5,2) not null default 0,
  fit_audience numeric(5,2),
  fit_history numeric(5,2),
  fit_segment numeric(5,2),
  approach_argument text,
  reasons jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.market_benchmarks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  segment text not null,
  market_avg_ticket numeric(14,2) not null default 0,
  market_min numeric(14,2),
  market_max numeric(14,2),
  notes text,
  model text,
  generated_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  assignee_id uuid,
  property_id uuid,
  sponsor_id uuid,
  tier_id uuid,
  pipeline_funnel_id uuid,
  brand text not null,
  stage public.opportunity_stage not null default 'prospect',
  value numeric(14,2) not null default 0,
  position integer not null default 0,
  expected_close_date date,
  last_stage_change_at timestamptz not null default now(),
  lost_reason text,
  lost_competitor text,
  lost_comment text,
  lost_value numeric(14,2),
  converted_contract_id uuid,
  converted_proposal_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunity_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  opportunity_id uuid not null,
  -- suposição: default 'tarefa'
  activity_type text not null default 'tarefa',
  title text not null,
  description text,
  due_date date,
  -- suposição: default 'pendente'
  status text not null default 'pendente',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunity_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  actor_id uuid,
  event_type text not null,
  from_stage public.opportunity_stage,
  to_stage public.opportunity_stage,
  old_value numeric(14,2),
  new_value numeric(14,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.opportunity_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  author_id uuid not null,
  -- suposição: default 'comentario'
  kind text not null default 'comentario',
  content text not null,
  -- suposição: ids de membros mencionados (uuid[]) - poderia também ser texto livre
  mentions uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunity_comment_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  comment_id uuid not null,
  uploaded_by uuid not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.opportunity_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  opportunity_id uuid not null,
  created_by uuid,
  name text not null,
  -- suposição: default 'decisor'
  contact_type text not null default 'decisor',
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_clause_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  title text not null,
  content text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  opportunity_id uuid,
  sponsor_id uuid,
  property_id uuid,
  title text not null,
  brand text not null,
  contract_number text,
  status public.contract_status not null default 'rascunho',
  payment_method public.payment_method not null default 'a_vista',
  use_flat_value boolean not null default false,
  flat_value numeric(14,2) not null default 0,
  total_value numeric(14,2) not null default 0,
  installments integer not null default 1,
  due_day integer,
  due_days integer,
  -- suposição: mantido como text[] (formato original de datas customizadas incerto)
  custom_due_dates text[] not null default '{}'::text[],
  start_date date,
  end_date date,
  signatories text,
  file_name text,
  file_path text,
  ai_summary text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_clauses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  contract_id uuid not null,
  title text not null,
  content text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.contract_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  contract_id uuid not null,
  asset_id uuid,
  name text not null,
  quantity integer not null default 1,
  unit_value numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.contract_churn_risk (
  contract_id uuid primary key,
  organization_id uuid,
  owner_id uuid not null,
  risk_level text not null,
  risk_score numeric(5,2) not null default 0,
  signals jsonb not null default '[]'::jsonb,
  recommendation text,
  model text,
  generated_at timestamptz not null default now()
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  contract_id uuid not null,
  sponsor_id uuid,
  installment_number integer not null,
  total_installments integer not null default 1,
  amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2),
  due_date date not null,
  paid_at timestamptz,
  payment_method public.payment_method,
  status public.installment_status not null default 'pendente',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  contract_id uuid,
  opportunity_id uuid,
  sponsor_id uuid,
  property_id uuid,
  title text not null,
  brand text not null,
  asset_type text,
  description text,
  quantity integer not null default 1,
  position integer not null default 0,
  status public.delivery_status not null default 'pendente',
  approval public.delivery_approval not null default 'pendente',
  approval_comment text,
  due_date date,
  delivered_at timestamptz,
  evidence_url text,
  evidence_geo jsonb,
  evidence_taken_at timestamptz,
  evidence_taken_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  delivery_id uuid not null,
  owner_id uuid not null,
  uploaded_by uuid not null,
  -- suposição: default 'foto'
  kind text not null default 'foto',
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  geo jsonb,
  taken_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.delivery_approval_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  delivery_id uuid not null,
  decided_by uuid not null,
  decided_by_role text not null,
  decision public.delivery_approval not null,
  comment text,
  created_at timestamptz not null default now()
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  sponsor_id uuid,
  property_id uuid,
  title text not null,
  brand text,
  proposal_number text,
  status public.proposal_status not null default 'rascunho',
  use_flat_value boolean not null default false,
  flat_value numeric(14,2) not null default 0,
  total_value numeric(14,2) not null default 0,
  message text,
  pdf_path text,
  -- suposição: tratado como timestamptz (nome não segue o padrão "*_date")
  valid_until timestamptz,
  sent_at timestamptz,
  decided_at timestamptz,
  rejection_reason text,
  rejection_notes text,
  converted_opportunity_id uuid,
  converted_contract_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  proposal_id uuid not null,
  asset_id uuid,
  name text not null,
  description text,
  quantity integer not null default 1,
  unit_value numeric(14,2) not null default 0,
  position integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  proposal_id uuid not null,
  channel text not null,
  title text,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sponsor_id uuid not null,
  sponsor_brand_id uuid,
  opportunity_id uuid,
  assignee_id uuid,
  created_by uuid,
  completed_by uuid,
  title text not null,
  description text,
  -- suposição: default 'geral'
  task_type text not null default 'geral',
  -- suposição: default 'media'
  priority text not null default 'media',
  -- suposição: default 'pendente'
  status text not null default 'pendente',
  source public.crm_audit_source not null default 'manual',
  due_date date,
  completed_at timestamptz,
  completion_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sponsor_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_id uuid not null,
  created_by uuid,
  sponsor_id uuid not null,
  title text not null,
  type public.sponsor_interaction_type not null default 'nota',
  source public.sponsor_interaction_source not null default 'manual',
  description text,
  attachment_url text,
  occurred_at timestamptz not null default now(),
  next_action text,
  next_action_at timestamptz,
  next_action_done boolean not null default false,
  related_contract_id uuid,
  related_delivery_id uuid,
  related_installment_id uuid,
  related_opportunity_id uuid,
  related_proposal_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- SEÇÃO 2: FOREIGN KEYS
-- Adicionadas em bloco único após a criação de todas as tabelas para não
-- depender de ordenação. Convenções adotadas:
--  * organization_id -> organizations(id) on delete cascade em TODAS as
--    tabelas que possuem a coluna, mesmo quando o types.ts original não
--    listava a FK em `Relationships` (ver SCHEMA_NOTES.md - isso é uma
--    melhoria deliberada em relação ao schema remoto, que aparentemente não
--    tinha a maioria dessas FKs formalizadas).
--  * colunas de usuário (owner_id, user_id, created_by, actor_id, etc.)
--    referenciam auth.users(id). Nullable -> on delete set null.
--    Not null -> sem ON DELETE (restrict/no action padrão do Postgres).
--  * demais FKs seguem exatamente o que foi observado em `Relationships`
--    no types.ts.
-- =========================================================================

-- organization_id -> organizations (todas as tabelas que possuem a coluna)
alter table public.ai_conversations add constraint ai_conversations_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.ai_suggestions add constraint ai_suggestions_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.asset_allocations add constraint asset_allocations_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.asset_photos add constraint asset_photos_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.assets add constraint assets_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.backend_error_logs add constraint backend_error_logs_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete set null;
alter table public.brandtrack_brands add constraint brandtrack_brands_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.brandtrack_events add constraint brandtrack_events_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.brandtrack_media add constraint brandtrack_media_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.brandtrack_detections add constraint brandtrack_detections_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.brandtrack_event_brands add constraint brandtrack_event_brands_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.organization_members add constraint organization_members_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.organization_invites add constraint organization_invites_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.pipeline_funnels add constraint pipeline_funnels_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.pipeline_stage_slas add constraint pipeline_stage_slas_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.notifications add constraint notifications_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.user_dashboard_preferences add constraint user_dashboard_preferences_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.user_stage_probabilities add constraint user_stage_probabilities_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.team_audit_log add constraint team_audit_log_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.error_reports add constraint error_reports_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete set null;
alter table public.sports_properties add constraint sports_properties_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsors add constraint sponsors_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_contacts add constraint sponsor_contacts_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_audit_logs add constraint sponsor_audit_logs_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_brands add constraint sponsor_brands_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_brandtrack_profiles add constraint sponsor_brandtrack_profiles_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_contract_profiles add constraint sponsor_contract_profiles_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_crm_profiles add constraint sponsor_crm_profiles_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_delivery_profiles add constraint sponsor_delivery_profiles_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_finance_profiles add constraint sponsor_finance_profiles_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_portal_profiles add constraint sponsor_portal_profiles_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_proposal_profiles add constraint sponsor_proposal_profiles_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_executive_summaries add constraint sponsor_executive_summaries_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_documents add constraint sponsor_documents_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_invites add constraint sponsor_invites_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_portal_access add constraint sponsor_portal_access_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsorship_tiers add constraint sponsorship_tiers_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.tier_assets add constraint tier_assets_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.tier_sales add constraint tier_sales_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.property_events add constraint property_events_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.property_media add constraint property_media_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.property_leads add constraint property_leads_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.property_checklist_items add constraint property_checklist_items_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sellout_reports add constraint sellout_reports_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.lead_scores add constraint lead_scores_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.market_benchmarks add constraint market_benchmarks_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.opportunities add constraint opportunities_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.opportunity_activities add constraint opportunity_activities_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.opportunity_audit_logs add constraint opportunity_audit_logs_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.opportunity_comments add constraint opportunity_comments_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.opportunity_comment_attachments add constraint opportunity_comment_attachments_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.opportunity_contacts add constraint opportunity_contacts_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.contract_clause_templates add constraint contract_clause_templates_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.contracts add constraint contracts_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.contract_clauses add constraint contract_clauses_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.contract_assets add constraint contract_assets_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.contract_churn_risk add constraint contract_churn_risk_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.installments add constraint installments_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.deliveries add constraint deliveries_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.delivery_attachments add constraint delivery_attachments_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.delivery_approval_log add constraint delivery_approval_log_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.proposals add constraint proposals_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.proposal_items add constraint proposal_items_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.proposal_versions add constraint proposal_versions_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.crm_tasks add constraint crm_tasks_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.sponsor_interactions add constraint sponsor_interactions_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;

-- auth.users (colunas de usuário: not null -> sem on delete / nullable -> set null)
alter table public.ai_conversations add constraint ai_conversations_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.ai_suggestions add constraint ai_suggestions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.assets add constraint assets_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.backend_error_logs add constraint backend_error_logs_user_id_fkey foreign key (user_id) references auth.users(id);
alter table public.brandtrack_brands add constraint brandtrack_brands_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.brandtrack_events add constraint brandtrack_events_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.brandtrack_media add constraint brandtrack_media_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.brandtrack_detections add constraint brandtrack_detections_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.brandtrack_detections add constraint brandtrack_detections_reviewed_by_fkey foreign key (reviewed_by) references auth.users(id) on delete set null;
alter table public.brandtrack_event_brands add constraint brandtrack_event_brands_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.organizations add constraint organizations_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.organization_members add constraint organization_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.organization_invites add constraint organization_invites_invited_by_fkey foreign key (invited_by) references auth.users(id);
alter table public.organization_invites add constraint organization_invites_accepted_user_id_fkey foreign key (accepted_user_id) references auth.users(id) on delete set null;
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table public.user_roles add constraint user_roles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.notification_preferences add constraint notification_preferences_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.notifications add constraint notifications_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.user_dashboard_preferences add constraint user_dashboard_preferences_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.user_stage_probabilities add constraint user_stage_probabilities_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.team_audit_log add constraint team_audit_log_actor_id_fkey foreign key (actor_id) references auth.users(id);
alter table public.team_audit_log add constraint team_audit_log_target_user_id_fkey foreign key (target_user_id) references auth.users(id) on delete set null;
alter table public.team_audit_log add constraint team_audit_log_target_member_id_fkey foreign key (target_member_id) references public.organization_members(id) on delete set null;
alter table public.error_reports add constraint error_reports_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.sports_properties add constraint sports_properties_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsors add constraint sponsors_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsors add constraint sponsors_account_owner_id_fkey foreign key (account_owner_id) references auth.users(id) on delete set null;
alter table public.sponsors add constraint sponsors_archived_by_fkey foreign key (archived_by) references auth.users(id) on delete set null;
alter table public.sponsor_audit_logs add constraint sponsor_audit_logs_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null;
alter table public.sponsor_brands add constraint sponsor_brands_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.sponsor_brandtrack_profiles add constraint sponsor_brandtrack_profiles_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsor_contract_profiles add constraint sponsor_contract_profiles_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsor_crm_profiles add constraint sponsor_crm_profiles_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsor_delivery_profiles add constraint sponsor_delivery_profiles_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsor_finance_profiles add constraint sponsor_finance_profiles_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsor_portal_profiles add constraint sponsor_portal_profiles_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsor_proposal_profiles add constraint sponsor_proposal_profiles_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsor_executive_summaries add constraint sponsor_executive_summaries_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsor_documents add constraint sponsor_documents_uploaded_by_fkey foreign key (uploaded_by) references auth.users(id) on delete set null;
alter table public.sponsor_invites add constraint sponsor_invites_invited_by_fkey foreign key (invited_by) references auth.users(id);
alter table public.sponsor_invites add constraint sponsor_invites_accepted_user_id_fkey foreign key (accepted_user_id) references auth.users(id) on delete set null;
alter table public.sponsor_portal_access add constraint sponsor_portal_access_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.sponsor_portal_access add constraint sponsor_portal_access_granted_by_fkey foreign key (granted_by) references auth.users(id);
alter table public.sponsorship_tiers add constraint sponsorship_tiers_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.tier_sales add constraint tier_sales_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.property_events add constraint property_events_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.property_media add constraint property_media_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.property_leads add constraint property_leads_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.property_checklist_items add constraint property_checklist_items_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.property_checklist_items add constraint property_checklist_items_evidence_taken_by_fkey foreign key (evidence_taken_by) references auth.users(id) on delete set null;
alter table public.sellout_reports add constraint sellout_reports_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.lead_scores add constraint lead_scores_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.opportunities add constraint opportunities_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.opportunities add constraint opportunities_assignee_id_fkey foreign key (assignee_id) references auth.users(id) on delete set null;
alter table public.opportunity_activities add constraint opportunity_activities_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.opportunity_audit_logs add constraint opportunity_audit_logs_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null;
alter table public.opportunity_comments add constraint opportunity_comments_author_id_fkey foreign key (author_id) references auth.users(id);
alter table public.opportunity_comment_attachments add constraint opportunity_comment_attachments_uploaded_by_fkey foreign key (uploaded_by) references auth.users(id);
alter table public.opportunity_contacts add constraint opportunity_contacts_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.contract_churn_risk add constraint contract_churn_risk_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.contracts add constraint contracts_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.installments add constraint installments_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.deliveries add constraint deliveries_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.deliveries add constraint deliveries_evidence_taken_by_fkey foreign key (evidence_taken_by) references auth.users(id) on delete set null;
alter table public.delivery_attachments add constraint delivery_attachments_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.delivery_attachments add constraint delivery_attachments_uploaded_by_fkey foreign key (uploaded_by) references auth.users(id);
alter table public.delivery_approval_log add constraint delivery_approval_log_decided_by_fkey foreign key (decided_by) references auth.users(id);
alter table public.proposals add constraint proposals_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.proposal_versions add constraint proposal_versions_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.crm_tasks add constraint crm_tasks_assignee_id_fkey foreign key (assignee_id) references auth.users(id) on delete set null;
alter table public.crm_tasks add constraint crm_tasks_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.crm_tasks add constraint crm_tasks_completed_by_fkey foreign key (completed_by) references auth.users(id) on delete set null;
alter table public.sponsor_interactions add constraint sponsor_interactions_owner_id_fkey foreign key (owner_id) references auth.users(id);
alter table public.sponsor_interactions add constraint sponsor_interactions_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;

-- Relacionamentos explícitos observados em `Relationships` no types.ts
alter table public.ai_messages add constraint ai_messages_conversation_id_fkey foreign key (conversation_id) references public.ai_conversations(id) on delete cascade;

alter table public.asset_allocations add constraint asset_allocations_asset_id_fkey foreign key (asset_id) references public.assets(id) on delete cascade;
alter table public.asset_allocations add constraint asset_allocations_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete cascade;

alter table public.asset_photos add constraint asset_photos_asset_id_fkey foreign key (asset_id) references public.assets(id) on delete cascade;

alter table public.assets add constraint assets_exclusive_sponsor_id_fkey foreign key (exclusive_sponsor_id) references public.sponsors(id) on delete set null;

alter table public.brandtrack_brands add constraint brandtrack_brands_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;

alter table public.brandtrack_detections add constraint brandtrack_detections_brand_id_fkey foreign key (brand_id) references public.brandtrack_brands(id) on delete set null;
alter table public.brandtrack_detections add constraint brandtrack_detections_media_id_fkey foreign key (media_id) references public.brandtrack_media(id) on delete cascade;

alter table public.brandtrack_event_brands add constraint brandtrack_event_brands_brand_id_fkey foreign key (brand_id) references public.brandtrack_brands(id) on delete set null;
alter table public.brandtrack_event_brands add constraint brandtrack_event_brands_event_id_fkey foreign key (event_id) references public.brandtrack_events(id) on delete cascade;
alter table public.brandtrack_event_brands add constraint brandtrack_event_brands_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;

alter table public.brandtrack_events add constraint brandtrack_events_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete set null;

alter table public.brandtrack_media add constraint brandtrack_media_event_id_fkey foreign key (event_id) references public.brandtrack_events(id) on delete set null;

alter table public.contract_assets add constraint contract_assets_asset_id_fkey foreign key (asset_id) references public.assets(id) on delete set null;
alter table public.contract_assets add constraint contract_assets_contract_id_fkey foreign key (contract_id) references public.contracts(id) on delete cascade;

alter table public.contract_churn_risk add constraint contract_churn_risk_contract_id_fkey foreign key (contract_id) references public.contracts(id) on delete cascade;

alter table public.contract_clauses add constraint contract_clauses_contract_id_fkey foreign key (contract_id) references public.contracts(id) on delete cascade;

alter table public.contracts add constraint contracts_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities(id) on delete set null;
alter table public.contracts add constraint contracts_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete set null;
alter table public.contracts add constraint contracts_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;

alter table public.crm_tasks add constraint crm_tasks_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities(id) on delete set null;
alter table public.crm_tasks add constraint crm_tasks_sponsor_brand_id_fkey foreign key (sponsor_brand_id) references public.sponsor_brands(id) on delete set null;
alter table public.crm_tasks add constraint crm_tasks_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.deliveries add constraint deliveries_contract_id_fkey foreign key (contract_id) references public.contracts(id) on delete set null;
alter table public.deliveries add constraint deliveries_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities(id) on delete set null;
alter table public.deliveries add constraint deliveries_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete set null;
alter table public.deliveries add constraint deliveries_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;

alter table public.delivery_approval_log add constraint delivery_approval_log_delivery_id_fkey foreign key (delivery_id) references public.deliveries(id) on delete cascade;

alter table public.delivery_attachments add constraint delivery_attachments_delivery_id_fkey foreign key (delivery_id) references public.deliveries(id) on delete cascade;

alter table public.installments add constraint installments_contract_id_fkey foreign key (contract_id) references public.contracts(id) on delete cascade;
alter table public.installments add constraint installments_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;

alter table public.lead_scores add constraint lead_scores_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete set null;

alter table public.opportunities add constraint opportunities_converted_contract_id_fkey foreign key (converted_contract_id) references public.contracts(id) on delete set null;
alter table public.opportunities add constraint opportunities_converted_proposal_id_fkey foreign key (converted_proposal_id) references public.proposals(id) on delete set null;
alter table public.opportunities add constraint opportunities_pipeline_funnel_id_fkey foreign key (pipeline_funnel_id) references public.pipeline_funnels(id) on delete set null;
alter table public.opportunities add constraint opportunities_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete set null;
alter table public.opportunities add constraint opportunities_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;
alter table public.opportunities add constraint opportunities_tier_id_fkey foreign key (tier_id) references public.sponsorship_tiers(id) on delete set null;

alter table public.opportunity_activities add constraint opportunity_activities_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities(id) on delete cascade;

alter table public.opportunity_comment_attachments add constraint opportunity_comment_attachments_comment_id_fkey foreign key (comment_id) references public.opportunity_comments(id) on delete cascade;
alter table public.opportunity_comment_attachments add constraint opportunity_comment_attachments_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities(id) on delete cascade;

alter table public.opportunity_comments add constraint opportunity_comments_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities(id) on delete cascade;

alter table public.opportunity_contacts add constraint opportunity_contacts_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities(id) on delete cascade;

alter table public.pipeline_stage_slas add constraint pipeline_stage_slas_pipeline_funnel_id_fkey foreign key (pipeline_funnel_id) references public.pipeline_funnels(id) on delete cascade;

alter table public.property_checklist_items add constraint property_checklist_items_delivery_id_fkey foreign key (delivery_id) references public.deliveries(id) on delete set null;
alter table public.property_checklist_items add constraint property_checklist_items_event_id_fkey foreign key (event_id) references public.property_events(id) on delete set null;
alter table public.property_checklist_items add constraint property_checklist_items_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities(id) on delete set null;
alter table public.property_checklist_items add constraint property_checklist_items_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete cascade;
alter table public.property_checklist_items add constraint property_checklist_items_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;

alter table public.property_events add constraint property_events_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete cascade;

alter table public.property_leads add constraint property_leads_created_opportunity_id_fkey foreign key (created_opportunity_id) references public.opportunities(id) on delete set null;
alter table public.property_leads add constraint property_leads_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete cascade;
alter table public.property_leads add constraint property_leads_tier_id_fkey foreign key (tier_id) references public.sponsorship_tiers(id) on delete set null;

alter table public.property_media add constraint property_media_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete cascade;

alter table public.proposal_items add constraint proposal_items_asset_id_fkey foreign key (asset_id) references public.assets(id) on delete set null;
alter table public.proposal_items add constraint proposal_items_proposal_id_fkey foreign key (proposal_id) references public.proposals(id) on delete cascade;

alter table public.proposal_versions add constraint proposal_versions_proposal_id_fkey foreign key (proposal_id) references public.proposals(id) on delete cascade;

alter table public.proposals add constraint proposals_converted_contract_id_fkey foreign key (converted_contract_id) references public.contracts(id) on delete set null;
alter table public.proposals add constraint proposals_converted_opportunity_id_fkey foreign key (converted_opportunity_id) references public.opportunities(id) on delete set null;
alter table public.proposals add constraint proposals_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete set null;
alter table public.proposals add constraint proposals_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;

alter table public.sellout_reports add constraint sellout_reports_event_id_fkey foreign key (event_id) references public.property_events(id) on delete set null;
alter table public.sellout_reports add constraint sellout_reports_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete set null;

alter table public.sponsor_audit_logs add constraint sponsor_audit_logs_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;

alter table public.sponsor_brands add constraint sponsor_brands_brandtrack_brand_id_fkey foreign key (brandtrack_brand_id) references public.brandtrack_brands(id) on delete set null;
alter table public.sponsor_brands add constraint sponsor_brands_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_brandtrack_profiles add constraint sponsor_brandtrack_profiles_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_contacts add constraint sponsor_contacts_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_contract_profiles add constraint sponsor_contract_profiles_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_crm_profiles add constraint sponsor_crm_profiles_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_delivery_profiles add constraint sponsor_delivery_profiles_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_documents add constraint sponsor_documents_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_executive_summaries add constraint sponsor_executive_summaries_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_finance_profiles add constraint sponsor_finance_profiles_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_interactions add constraint sponsor_interactions_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;
alter table public.sponsor_interactions add constraint sponsor_interactions_related_contract_id_fkey foreign key (related_contract_id) references public.contracts(id) on delete set null;
alter table public.sponsor_interactions add constraint sponsor_interactions_related_delivery_id_fkey foreign key (related_delivery_id) references public.deliveries(id) on delete set null;
alter table public.sponsor_interactions add constraint sponsor_interactions_related_installment_id_fkey foreign key (related_installment_id) references public.installments(id) on delete set null;
alter table public.sponsor_interactions add constraint sponsor_interactions_related_opportunity_id_fkey foreign key (related_opportunity_id) references public.opportunities(id) on delete set null;
alter table public.sponsor_interactions add constraint sponsor_interactions_related_proposal_id_fkey foreign key (related_proposal_id) references public.proposals(id) on delete set null;

alter table public.sponsor_invites add constraint sponsor_invites_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_portal_access add constraint sponsor_portal_access_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_portal_profiles add constraint sponsor_portal_profiles_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsor_proposal_profiles add constraint sponsor_proposal_profiles_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete cascade;

alter table public.sponsors add constraint sponsors_merged_into_sponsor_id_fkey foreign key (merged_into_sponsor_id) references public.sponsors(id) on delete set null;

alter table public.sponsorship_tiers add constraint sponsorship_tiers_property_id_fkey foreign key (property_id) references public.sports_properties(id) on delete cascade;

alter table public.sports_properties add constraint sports_properties_parent_property_id_fkey foreign key (parent_property_id) references public.sports_properties(id) on delete set null;

alter table public.tier_assets add constraint tier_assets_asset_id_fkey foreign key (asset_id) references public.assets(id) on delete cascade;
alter table public.tier_assets add constraint tier_assets_tier_id_fkey foreign key (tier_id) references public.sponsorship_tiers(id) on delete cascade;

alter table public.tier_sales add constraint tier_sales_contract_id_fkey foreign key (contract_id) references public.contracts(id) on delete set null;
alter table public.tier_sales add constraint tier_sales_sponsor_id_fkey foreign key (sponsor_id) references public.sponsors(id) on delete set null;
alter table public.tier_sales add constraint tier_sales_tier_id_fkey foreign key (tier_id) references public.sponsorship_tiers(id) on delete cascade;

-- =========================================================================
-- SEÇÃO 3: ÍNDICES
-- Índice em toda coluna organization_id (crítico para performance das
-- policies de RLS) e em toda coluna usada em FK.
-- =========================================================================

create index ai_conversations_organization_id_idx on public.ai_conversations (organization_id);
create index ai_conversations_user_id_idx on public.ai_conversations (user_id);
create index ai_messages_conversation_id_idx on public.ai_messages (conversation_id);
create index ai_suggestions_organization_id_idx on public.ai_suggestions (organization_id);
create index ai_suggestions_user_id_idx on public.ai_suggestions (user_id);
create index asset_allocations_organization_id_idx on public.asset_allocations (organization_id);
create index asset_allocations_asset_id_idx on public.asset_allocations (asset_id);
create index asset_allocations_property_id_idx on public.asset_allocations (property_id);
create index asset_photos_organization_id_idx on public.asset_photos (organization_id);
create index asset_photos_asset_id_idx on public.asset_photos (asset_id);
create index assets_organization_id_idx on public.assets (organization_id);
create index assets_owner_id_idx on public.assets (owner_id);
create index assets_exclusive_sponsor_id_idx on public.assets (exclusive_sponsor_id);
create index backend_error_logs_organization_id_idx on public.backend_error_logs (organization_id);
create index backend_error_logs_user_id_idx on public.backend_error_logs (user_id);
create index brandtrack_brands_organization_id_idx on public.brandtrack_brands (organization_id);
create index brandtrack_brands_owner_id_idx on public.brandtrack_brands (owner_id);
create index brandtrack_brands_sponsor_id_idx on public.brandtrack_brands (sponsor_id);
create index brandtrack_events_organization_id_idx on public.brandtrack_events (organization_id);
create index brandtrack_events_owner_id_idx on public.brandtrack_events (owner_id);
create index brandtrack_events_property_id_idx on public.brandtrack_events (property_id);
create index brandtrack_media_organization_id_idx on public.brandtrack_media (organization_id);
create index brandtrack_media_owner_id_idx on public.brandtrack_media (owner_id);
create index brandtrack_media_event_id_idx on public.brandtrack_media (event_id);
create index brandtrack_detections_organization_id_idx on public.brandtrack_detections (organization_id);
create index brandtrack_detections_owner_id_idx on public.brandtrack_detections (owner_id);
create index brandtrack_detections_brand_id_idx on public.brandtrack_detections (brand_id);
create index brandtrack_detections_media_id_idx on public.brandtrack_detections (media_id);
create index brandtrack_event_brands_organization_id_idx on public.brandtrack_event_brands (organization_id);
create index brandtrack_event_brands_owner_id_idx on public.brandtrack_event_brands (owner_id);
create index brandtrack_event_brands_brand_id_idx on public.brandtrack_event_brands (brand_id);
create index brandtrack_event_brands_event_id_idx on public.brandtrack_event_brands (event_id);
create index brandtrack_event_brands_sponsor_id_idx on public.brandtrack_event_brands (sponsor_id);
create index organization_members_organization_id_idx on public.organization_members (organization_id);
create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_invites_organization_id_idx on public.organization_invites (organization_id);
create index organization_invites_email_idx on public.organization_invites (email);
create index pipeline_funnels_organization_id_idx on public.pipeline_funnels (organization_id);
create index pipeline_stage_slas_organization_id_idx on public.pipeline_stage_slas (organization_id);
create index pipeline_stage_slas_pipeline_funnel_id_idx on public.pipeline_stage_slas (pipeline_funnel_id);
create index notifications_organization_id_idx on public.notifications (organization_id);
create index notifications_user_id_idx on public.notifications (user_id);
create index user_dashboard_preferences_organization_id_idx on public.user_dashboard_preferences (organization_id);
create index user_stage_probabilities_organization_id_idx on public.user_stage_probabilities (organization_id);
create index team_audit_log_organization_id_idx on public.team_audit_log (organization_id);
create index team_audit_log_actor_id_idx on public.team_audit_log (actor_id);
create index error_reports_organization_id_idx on public.error_reports (organization_id);
create index error_reports_user_id_idx on public.error_reports (user_id);
create index sports_properties_organization_id_idx on public.sports_properties (organization_id);
create index sports_properties_owner_id_idx on public.sports_properties (owner_id);
create index sports_properties_parent_property_id_idx on public.sports_properties (parent_property_id);
create index sponsors_organization_id_idx on public.sponsors (organization_id);
create index sponsors_owner_id_idx on public.sponsors (owner_id);
create index sponsors_merged_into_sponsor_id_idx on public.sponsors (merged_into_sponsor_id);
create index sponsor_contacts_organization_id_idx on public.sponsor_contacts (organization_id);
create index sponsor_contacts_sponsor_id_idx on public.sponsor_contacts (sponsor_id);
create index sponsor_audit_logs_organization_id_idx on public.sponsor_audit_logs (organization_id);
create index sponsor_audit_logs_sponsor_id_idx on public.sponsor_audit_logs (sponsor_id);
create index sponsor_brands_organization_id_idx on public.sponsor_brands (organization_id);
create index sponsor_brands_sponsor_id_idx on public.sponsor_brands (sponsor_id);
create index sponsor_brands_brandtrack_brand_id_idx on public.sponsor_brands (brandtrack_brand_id);
create index sponsor_brandtrack_profiles_organization_id_idx on public.sponsor_brandtrack_profiles (organization_id);
create index sponsor_contract_profiles_organization_id_idx on public.sponsor_contract_profiles (organization_id);
create index sponsor_crm_profiles_organization_id_idx on public.sponsor_crm_profiles (organization_id);
create index sponsor_delivery_profiles_organization_id_idx on public.sponsor_delivery_profiles (organization_id);
create index sponsor_finance_profiles_organization_id_idx on public.sponsor_finance_profiles (organization_id);
create index sponsor_portal_profiles_organization_id_idx on public.sponsor_portal_profiles (organization_id);
create index sponsor_proposal_profiles_organization_id_idx on public.sponsor_proposal_profiles (organization_id);
create index sponsor_executive_summaries_organization_id_idx on public.sponsor_executive_summaries (organization_id);
create index sponsor_documents_organization_id_idx on public.sponsor_documents (organization_id);
create index sponsor_documents_sponsor_id_idx on public.sponsor_documents (sponsor_id);
create index sponsor_invites_organization_id_idx on public.sponsor_invites (organization_id);
create index sponsor_invites_sponsor_id_idx on public.sponsor_invites (sponsor_id);
create index sponsor_portal_access_organization_id_idx on public.sponsor_portal_access (organization_id);
create index sponsor_portal_access_sponsor_id_idx on public.sponsor_portal_access (sponsor_id);
create index sponsor_portal_access_user_id_idx on public.sponsor_portal_access (user_id);
create index sponsorship_tiers_organization_id_idx on public.sponsorship_tiers (organization_id);
create index sponsorship_tiers_property_id_idx on public.sponsorship_tiers (property_id);
create index tier_assets_organization_id_idx on public.tier_assets (organization_id);
create index tier_assets_tier_id_idx on public.tier_assets (tier_id);
create index tier_assets_asset_id_idx on public.tier_assets (asset_id);
create index tier_sales_organization_id_idx on public.tier_sales (organization_id);
create index tier_sales_tier_id_idx on public.tier_sales (tier_id);
create index tier_sales_sponsor_id_idx on public.tier_sales (sponsor_id);
create index tier_sales_contract_id_idx on public.tier_sales (contract_id);
create index property_events_organization_id_idx on public.property_events (organization_id);
create index property_events_property_id_idx on public.property_events (property_id);
create index property_media_organization_id_idx on public.property_media (organization_id);
create index property_media_property_id_idx on public.property_media (property_id);
create index property_leads_organization_id_idx on public.property_leads (organization_id);
create index property_leads_property_id_idx on public.property_leads (property_id);
create index property_leads_tier_id_idx on public.property_leads (tier_id);
create index property_checklist_items_organization_id_idx on public.property_checklist_items (organization_id);
create index property_checklist_items_property_id_idx on public.property_checklist_items (property_id);
create index property_checklist_items_event_id_idx on public.property_checklist_items (event_id);
create index property_checklist_items_delivery_id_idx on public.property_checklist_items (delivery_id);
create index property_checklist_items_opportunity_id_idx on public.property_checklist_items (opportunity_id);
create index property_checklist_items_sponsor_id_idx on public.property_checklist_items (sponsor_id);
create index sellout_reports_organization_id_idx on public.sellout_reports (organization_id);
create index sellout_reports_property_id_idx on public.sellout_reports (property_id);
create index sellout_reports_event_id_idx on public.sellout_reports (event_id);
create index lead_scores_organization_id_idx on public.lead_scores (organization_id);
create index lead_scores_property_id_idx on public.lead_scores (property_id);
create index market_benchmarks_organization_id_idx on public.market_benchmarks (organization_id);
create index opportunities_organization_id_idx on public.opportunities (organization_id);
create index opportunities_owner_id_idx on public.opportunities (owner_id);
create index opportunities_sponsor_id_idx on public.opportunities (sponsor_id);
create index opportunities_property_id_idx on public.opportunities (property_id);
create index opportunities_tier_id_idx on public.opportunities (tier_id);
create index opportunities_pipeline_funnel_id_idx on public.opportunities (pipeline_funnel_id);
create index opportunities_stage_idx on public.opportunities (stage);
create index opportunity_activities_organization_id_idx on public.opportunity_activities (organization_id);
create index opportunity_activities_opportunity_id_idx on public.opportunity_activities (opportunity_id);
create index opportunity_audit_logs_organization_id_idx on public.opportunity_audit_logs (organization_id);
create index opportunity_audit_logs_opportunity_id_idx on public.opportunity_audit_logs (opportunity_id);
create index opportunity_comments_organization_id_idx on public.opportunity_comments (organization_id);
create index opportunity_comments_opportunity_id_idx on public.opportunity_comments (opportunity_id);
create index opportunity_comment_attachments_organization_id_idx on public.opportunity_comment_attachments (organization_id);
create index opportunity_comment_attachments_opportunity_id_idx on public.opportunity_comment_attachments (opportunity_id);
create index opportunity_comment_attachments_comment_id_idx on public.opportunity_comment_attachments (comment_id);
create index opportunity_contacts_organization_id_idx on public.opportunity_contacts (organization_id);
create index opportunity_contacts_opportunity_id_idx on public.opportunity_contacts (opportunity_id);
create index contract_clause_templates_organization_id_idx on public.contract_clause_templates (organization_id);
create index contracts_organization_id_idx on public.contracts (organization_id);
create index contracts_owner_id_idx on public.contracts (owner_id);
create index contracts_sponsor_id_idx on public.contracts (sponsor_id);
create index contracts_property_id_idx on public.contracts (property_id);
create index contracts_opportunity_id_idx on public.contracts (opportunity_id);
create index contracts_status_idx on public.contracts (status);
create index contract_clauses_organization_id_idx on public.contract_clauses (organization_id);
create index contract_clauses_contract_id_idx on public.contract_clauses (contract_id);
create index contract_assets_organization_id_idx on public.contract_assets (organization_id);
create index contract_assets_contract_id_idx on public.contract_assets (contract_id);
create index contract_assets_asset_id_idx on public.contract_assets (asset_id);
create index contract_churn_risk_organization_id_idx on public.contract_churn_risk (organization_id);
create index installments_organization_id_idx on public.installments (organization_id);
create index installments_contract_id_idx on public.installments (contract_id);
create index installments_sponsor_id_idx on public.installments (sponsor_id);
create index installments_due_date_idx on public.installments (due_date);
create index deliveries_organization_id_idx on public.deliveries (organization_id);
create index deliveries_contract_id_idx on public.deliveries (contract_id);
create index deliveries_opportunity_id_idx on public.deliveries (opportunity_id);
create index deliveries_property_id_idx on public.deliveries (property_id);
create index deliveries_sponsor_id_idx on public.deliveries (sponsor_id);
create index delivery_attachments_organization_id_idx on public.delivery_attachments (organization_id);
create index delivery_attachments_delivery_id_idx on public.delivery_attachments (delivery_id);
create index delivery_approval_log_organization_id_idx on public.delivery_approval_log (organization_id);
create index delivery_approval_log_delivery_id_idx on public.delivery_approval_log (delivery_id);
create index proposals_organization_id_idx on public.proposals (organization_id);
create index proposals_owner_id_idx on public.proposals (owner_id);
create index proposals_sponsor_id_idx on public.proposals (sponsor_id);
create index proposals_property_id_idx on public.proposals (property_id);
create index proposal_items_organization_id_idx on public.proposal_items (organization_id);
create index proposal_items_proposal_id_idx on public.proposal_items (proposal_id);
create index proposal_items_asset_id_idx on public.proposal_items (asset_id);
create index proposal_versions_organization_id_idx on public.proposal_versions (organization_id);
create index proposal_versions_proposal_id_idx on public.proposal_versions (proposal_id);
create index crm_tasks_organization_id_idx on public.crm_tasks (organization_id);
create index crm_tasks_sponsor_id_idx on public.crm_tasks (sponsor_id);
create index crm_tasks_opportunity_id_idx on public.crm_tasks (opportunity_id);
create index crm_tasks_sponsor_brand_id_idx on public.crm_tasks (sponsor_brand_id);
create index sponsor_interactions_organization_id_idx on public.sponsor_interactions (organization_id);
create index sponsor_interactions_sponsor_id_idx on public.sponsor_interactions (sponsor_id);

-- Índices adicionais em owner_id / demais FKs que não tinham sido cobertos acima.
create index contract_churn_risk_owner_id_idx on public.contract_churn_risk (owner_id);
create index sponsor_brandtrack_profiles_owner_id_idx on public.sponsor_brandtrack_profiles (owner_id);
create index sponsor_contract_profiles_owner_id_idx on public.sponsor_contract_profiles (owner_id);
create index sponsor_crm_profiles_owner_id_idx on public.sponsor_crm_profiles (owner_id);
create index sponsor_delivery_profiles_owner_id_idx on public.sponsor_delivery_profiles (owner_id);
create index sponsor_finance_profiles_owner_id_idx on public.sponsor_finance_profiles (owner_id);
create index sponsor_portal_profiles_owner_id_idx on public.sponsor_portal_profiles (owner_id);
create index sponsor_proposal_profiles_owner_id_idx on public.sponsor_proposal_profiles (owner_id);
create index sponsor_executive_summaries_owner_id_idx on public.sponsor_executive_summaries (owner_id);
create index sponsorship_tiers_owner_id_idx on public.sponsorship_tiers (owner_id);
create index tier_sales_owner_id_idx on public.tier_sales (owner_id);
create index property_events_owner_id_idx on public.property_events (owner_id);
create index property_media_owner_id_idx on public.property_media (owner_id);
create index property_leads_owner_id_idx on public.property_leads (owner_id);
create index property_checklist_items_owner_id_idx on public.property_checklist_items (owner_id);
create index property_checklist_items_evidence_taken_by_idx on public.property_checklist_items (evidence_taken_by);
create index sellout_reports_owner_id_idx on public.sellout_reports (owner_id);
create index lead_scores_owner_id_idx on public.lead_scores (owner_id);
create index opportunity_activities_owner_id_idx on public.opportunity_activities (owner_id);
create index opportunity_audit_logs_actor_id_idx on public.opportunity_audit_logs (actor_id);
create index opportunity_comments_author_id_idx on public.opportunity_comments (author_id);
create index opportunity_contacts_created_by_idx on public.opportunity_contacts (created_by);
create index installments_owner_id_idx on public.installments (owner_id);
create index deliveries_owner_id_idx on public.deliveries (owner_id);
create index delivery_attachments_owner_id_idx on public.delivery_attachments (owner_id);
create index delivery_approval_log_decided_by_idx on public.delivery_approval_log (decided_by);
create index proposal_versions_owner_id_idx on public.proposal_versions (owner_id);
create index sponsor_interactions_owner_id_idx on public.sponsor_interactions (owner_id);
create index sponsor_interactions_related_contract_id_idx on public.sponsor_interactions (related_contract_id);
create index sponsor_interactions_related_delivery_id_idx on public.sponsor_interactions (related_delivery_id);
create index sponsor_interactions_related_installment_id_idx on public.sponsor_interactions (related_installment_id);
create index sponsor_interactions_related_opportunity_id_idx on public.sponsor_interactions (related_opportunity_id);
create index sponsor_interactions_related_proposal_id_idx on public.sponsor_interactions (related_proposal_id);
create index crm_tasks_assignee_id_idx on public.crm_tasks (assignee_id);
create index opportunities_assignee_id_idx on public.opportunities (assignee_id);
create index opportunities_converted_contract_id_idx on public.opportunities (converted_contract_id);
create index opportunities_converted_proposal_id_idx on public.opportunities (converted_proposal_id);
create index proposals_converted_contract_id_idx on public.proposals (converted_contract_id);
create index proposals_converted_opportunity_id_idx on public.proposals (converted_opportunity_id);
