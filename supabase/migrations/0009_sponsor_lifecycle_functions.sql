-- 0009_sponsor_lifecycle_functions.sql
-- Funções do CRM Patrocinadores → Conta 360º especificadas em
-- .lovable/plan/crm-patrocinadores-conta-360º-2026-08-08.md (Fase 1 do plano):
-- archive_sponsor, unarchive_sponsor, merge_sponsors, get_portal_sponsor_overview,
-- can_access_module, e a view crm_unlinked_records. Ver
-- supabase/migrations/SCHEMA_NOTES.md para o detalhe de confiança/evidência
-- de cada item.
--
-- Nunca editar 0001..0008 (já aplicadas) - isto é migration nova.

-- =========================================================================
-- can_access_module: espelha EXATAMENTE a função `can` de
-- src/hooks/useOrganization.tsx (lida por completo antes de escrever isto).
-- =========================================================================

create or replace function public.can_access_module(_org_id uuid, _user_id uuid, _module text, _write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when om.role in ('owner', 'admin') then true
      when _module = 'team' then false
      when _module = 'crm' then om.role = 'comercial'
      when _module = 'operacional' then om.role = 'operacional'
      when _module = 'financeiro' then om.role = 'financeiro'
      else false
    end
    from public.organization_members om
    where om.organization_id = _org_id
      and om.user_id = _user_id
      and om.status = 'ativo'
    limit 1
  ), false);
$$;

comment on function public.can_access_module(uuid, uuid, text, boolean) is
  'Confiança alta: matriz de permissão copiada literalmente da função `can` em src/hooks/useOrganization.tsx (linha ~128). Suposição explícita: o frontend NÃO distingue leitura de escrita (não existe parâmetro _write lá), mas a RPC remota recebe `_write boolean` - como não há evidência de diferenciação, o parâmetro é aceito para compatibilidade de assinatura mas IGNORADO (mesma matriz para leitura e escrita). Revisar se algum fluxo do produto precisa de uma distinção real no futuro. SECURITY DEFINER necessário para resolver o papel de um _user_id arbitrário (uso típico: Edge Function de service_role checando permissão de um usuário antes de uma operação sensível), expõe só um boolean.';

-- =========================================================================
-- archive_sponsor / unarchive_sponsor: "Arquivar/mesclar: funções
-- archive_sponsor, unarchive_sponsor, merge_sponsors (Owner/Admin,
-- transacional, sem exclusão física) + auditoria em sponsor_audit_logs."
-- (plano, Fase 1, item 6). Colunas sponsors.lifecycle/archived_at/archived_by/
-- archive_reason e sponsor_audit_logs confirmadas em 0003_tables.sql.
-- =========================================================================

create or replace function public.archive_sponsor(_sponsor_id uuid, _reason text)
returns void
language plpgsql
set search_path = public
as $$
declare
  _org_id uuid;
  _old_lifecycle public.sponsor_lifecycle;
begin
  select organization_id, lifecycle into _org_id, _old_lifecycle
  from public.sponsors
  where id = _sponsor_id;

  if _org_id is null then
    raise exception 'archive_sponsor: patrocinador % não encontrado ou sem organização', _sponsor_id;
  end if;

  if not public.has_org_role(_org_id, array['owner', 'admin']) then
    raise exception 'archive_sponsor: apenas owner/admin podem arquivar um patrocinador';
  end if;

  update public.sponsors
  set lifecycle = 'arquivado',
      archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = _reason,
      updated_at = now()
  where id = _sponsor_id;

  insert into public.sponsor_audit_logs (
    organization_id, actor_id, sponsor_id, entity_type, entity_id, action, old_value, new_value, source
  ) values (
    _org_id, auth.uid(), _sponsor_id, 'sponsor', _sponsor_id, 'archive',
    jsonb_build_object('lifecycle', _old_lifecycle),
    jsonb_build_object('lifecycle', 'arquivado', 'reason', _reason),
    'manual'
  );
end;
$$;

comment on function public.archive_sponsor(uuid, text) is
  'Confiança alta: especificada literalmente no plano (Fase 1, item 6) como "Owner/Admin, transacional, sem exclusão física" + auditoria. Restrição a owner/admin via has_org_role (2 args, auth.uid() implícito - SECURITY INVOKER é suficiente aqui, não precisa de SECURITY DEFINER). Uma function é atômica por natureza (não precisa de BEGIN/COMMIT explícito).';

create or replace function public.unarchive_sponsor(_sponsor_id uuid, _lifecycle public.sponsor_lifecycle default null)
returns void
language plpgsql
set search_path = public
as $$
declare
  _org_id uuid;
  _new_lifecycle public.sponsor_lifecycle := coalesce(_lifecycle, 'prospect');
begin
  select organization_id into _org_id
  from public.sponsors
  where id = _sponsor_id;

  if _org_id is null then
    raise exception 'unarchive_sponsor: patrocinador % não encontrado ou sem organização', _sponsor_id;
  end if;

  if not public.has_org_role(_org_id, array['owner', 'admin']) then
    raise exception 'unarchive_sponsor: apenas owner/admin podem reativar um patrocinador arquivado';
  end if;

  update public.sponsors
  set lifecycle = _new_lifecycle,
      archived_at = null,
      archived_by = null,
      archive_reason = null,
      updated_at = now()
  where id = _sponsor_id;

  insert into public.sponsor_audit_logs (
    organization_id, actor_id, sponsor_id, entity_type, entity_id, action, old_value, new_value, source
  ) values (
    _org_id, auth.uid(), _sponsor_id, 'sponsor', _sponsor_id, 'unarchive',
    jsonb_build_object('lifecycle', 'arquivado'),
    jsonb_build_object('lifecycle', _new_lifecycle),
    'manual'
  );
end;
$$;

comment on function public.unarchive_sponsor(uuid, public.sponsor_lifecycle) is
  'Confiança média-alta: o plano pede a função mas não especifica o lifecycle de destino quando _lifecycle não é informado. Suposição adotada: default ''prospect'' (volta para requalificação) em vez de ''cliente_ativo'' - evita reativar como "cliente ativo" um relacionamento que foi arquivado sem essa informação. Caller pode sempre passar um _lifecycle explícito para evitar a suposição.';

-- =========================================================================
-- merge_sponsors: reatribuição transacional de FKs de _duplicate_id para
-- _target_id em TODAS as tabelas com sponsor_id (lista obtida via
-- `grep -n "sponsor_id" supabase/migrations/0003_tables.sql`, não só da lista
-- sugerida na tarefa), + assets.exclusive_sponsor_id. NUNCA faz DELETE do
-- patrocinador (plano: "sem exclusão física") - a única exceção são as
-- linhas "perdedoras" de conflito de UNIQUE constraint em tabelas 1:1 por
-- patrocinador ou 1:1 por (sponsor_id,user_id), tratadas explicitamente
-- abaixo e documentadas função a função.
-- =========================================================================

create or replace function public.merge_sponsors(_duplicate_id uuid, _target_id uuid)
returns json
language plpgsql
set search_path = public
as $$
declare
  _target_org uuid;
  _dup_org uuid;
  _n integer;
  _counts jsonb := '{}'::jsonb;
begin
  if _duplicate_id = _target_id then
    raise exception 'merge_sponsors: duplicate_id e target_id não podem ser o mesmo patrocinador';
  end if;

  select organization_id into _target_org from public.sponsors where id = _target_id;
  select organization_id into _dup_org from public.sponsors where id = _duplicate_id;

  if _target_org is null then
    raise exception 'merge_sponsors: patrocinador alvo % não encontrado ou sem organização', _target_id;
  end if;
  if _dup_org is null then
    raise exception 'merge_sponsors: patrocinador duplicado % não encontrado ou sem organização', _duplicate_id;
  end if;
  if _target_org <> _dup_org then
    raise exception 'merge_sponsors: os dois patrocinadores precisam pertencer à mesma organização';
  end if;
  if not public.has_org_role(_target_org, array['owner', 'admin']) then
    raise exception 'merge_sponsors: apenas owner/admin podem mesclar patrocinadores';
  end if;
  if exists (select 1 from public.sponsors where id = _duplicate_id and merged_into_sponsor_id is not null) then
    raise exception 'merge_sponsors: patrocinador duplicado já foi mesclado anteriormente';
  end if;

  -- Tabelas com várias linhas por patrocinador (sem unique(sponsor_id)):
  -- reatribuição direta, sem risco de conflito.
  update public.brandtrack_brands set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('brandtrack_brands', _n);

  update public.brandtrack_event_brands set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('brandtrack_event_brands', _n);

  update public.sponsor_contacts set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_contacts', _n);

  update public.sponsor_audit_logs set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_audit_logs', _n);

  update public.sponsor_brands set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_brands', _n);

  update public.sponsor_documents set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_documents', _n);

  update public.sponsor_invites set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_invites', _n);

  update public.tier_sales set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('tier_sales', _n);

  update public.property_checklist_items set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('property_checklist_items', _n);

  update public.opportunities set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('opportunities', _n);

  update public.contracts set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('contracts', _n);

  update public.installments set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('installments', _n);

  update public.deliveries set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('deliveries', _n);

  update public.proposals set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('proposals', _n);

  update public.crm_tasks set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('crm_tasks', _n);

  update public.sponsor_interactions set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_interactions', _n);

  update public.assets set exclusive_sponsor_id = _target_id where exclusive_sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('assets_exclusive_sponsor_id', _n);

  -- Tabelas "perfil" 1:1 por patrocinador (constraint unique(sponsor_id)):
  -- se o alvo já tem uma linha, a do duplicado é DESCARTADA (dado do alvo
  -- prevalece - decisão explícita, sem merge campo a campo; é a única
  -- exceção a "nunca exclusão física" neste schema, limitada a este
  -- conflito de unicidade específico). Senão, reatribuída normalmente.
  delete from public.sponsor_brandtrack_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_brandtrack_profiles where sponsor_id = _target_id);
  update public.sponsor_brandtrack_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_brandtrack_profiles', _n);

  delete from public.sponsor_contract_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_contract_profiles where sponsor_id = _target_id);
  update public.sponsor_contract_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_contract_profiles', _n);

  delete from public.sponsor_crm_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_crm_profiles where sponsor_id = _target_id);
  update public.sponsor_crm_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_crm_profiles', _n);

  delete from public.sponsor_delivery_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_delivery_profiles where sponsor_id = _target_id);
  update public.sponsor_delivery_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_delivery_profiles', _n);

  delete from public.sponsor_finance_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_finance_profiles where sponsor_id = _target_id);
  update public.sponsor_finance_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_finance_profiles', _n);

  delete from public.sponsor_portal_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_portal_profiles where sponsor_id = _target_id);
  update public.sponsor_portal_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_portal_profiles', _n);

  delete from public.sponsor_proposal_profiles where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_proposal_profiles where sponsor_id = _target_id);
  update public.sponsor_proposal_profiles set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_proposal_profiles', _n);

  delete from public.sponsor_executive_summaries where sponsor_id = _duplicate_id and exists (select 1 from public.sponsor_executive_summaries where sponsor_id = _target_id);
  update public.sponsor_executive_summaries set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_executive_summaries', _n);

  -- sponsor_portal_access: unique(sponsor_id, user_id). Se o usuário já tem
  -- acesso ao alvo, a linha do duplicado é descartada (o usuário já está
  -- coberto); senão, reatribuída.
  delete from public.sponsor_portal_access spa_dup
  where spa_dup.sponsor_id = _duplicate_id
    and exists (
      select 1 from public.sponsor_portal_access spa_target
      where spa_target.sponsor_id = _target_id
        and spa_target.user_id = spa_dup.user_id
    );
  update public.sponsor_portal_access set sponsor_id = _target_id where sponsor_id = _duplicate_id;
  get diagnostics _n = row_count; _counts := _counts || jsonb_build_object('sponsor_portal_access', _n);

  -- Marca o duplicado como mesclado - NUNCA exclusão física do registro
  -- sponsors em si (plano: "sem exclusão física").
  update public.sponsors
  set merged_into_sponsor_id = _target_id,
      lifecycle = 'arquivado',
      archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = 'merged_into:' || _target_id::text,
      updated_at = now()
  where id = _duplicate_id;

  insert into public.sponsor_audit_logs (
    organization_id, actor_id, sponsor_id, entity_type, entity_id, action, old_value, new_value, source
  ) values (
    _target_org, auth.uid(), _target_id, 'sponsor', _duplicate_id, 'merge',
    jsonb_build_object('duplicate_id', _duplicate_id),
    jsonb_build_object('target_id', _target_id, 'moved', _counts),
    'manual'
  );

  return (jsonb_build_object('target_id', _target_id, 'duplicate_id', _duplicate_id, 'moved', _counts))::json;
end;
$$;

comment on function public.merge_sponsors(uuid, uuid) is
  'Confiança média: a lista de tabelas com sponsor_id foi obtida via grep real em 0003_tables.sql (26 tabelas + assets.exclusive_sponsor_id), não só da lista sugerida na tarefa. Validações: mesma organização obrigatória, caller owner/admin, duplicado ainda não mesclado. Para as 7 tabelas de perfil 1:1 (unique(sponsor_id)) e sponsor_executive_summaries (sponsor_id é PK) e sponsor_portal_access (unique(sponsor_id,user_id)): quando o alvo já tem uma linha equivalente, a linha do duplicado é DESCARTADA via DELETE em vez de reatribuída - única exceção documentada a "nunca exclusão física", estritamente limitada a resolver o conflito de unicidade (não se tenta merge campo a campo entre as duas linhas de perfil). SECURITY INVOKER (não definer): toda UPDATE roda com os privilégios do caller e é coberta pelas policies tenant (is_org_member) das tabelas envolvidas, que já são satisfeitas porque caller/alvo/duplicado estão comprovadamente na mesma organização.';

-- =========================================================================
-- get_portal_sponsor_overview: "Portal seguro: função
-- get_portal_sponsor_overview() SECURITY DEFINER com validação de
-- usuário/organização/vínculo, retornando apenas campos liberados" (plano,
-- Fase 1, item 5). Necessária porque NENHUMA policy de 0005_rls_policies.sql
-- Seção 9 (portal do patrocinador) libera leitura direta da tabela
-- `sponsors` para o papel patrocinador - sem esta função, o portal não
-- consegue nem mostrar o nome/logo do patrocinador.
-- =========================================================================

create or replace function public.get_portal_sponsor_overview(_sponsor_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _sponsor record;
  _result json;
begin
  select id, organization_id, name, trade_name, logo_path, segment, lifecycle, health
  into _sponsor
  from public.sponsors
  where id = _sponsor_id;

  if not found then
    raise exception 'get_portal_sponsor_overview: patrocinador % não encontrado', _sponsor_id;
  end if;

  if not (public.has_sponsor_portal_access(_sponsor_id) or public.is_org_member(_sponsor.organization_id)) then
    raise exception 'get_portal_sponsor_overview: acesso negado ao patrocinador %', _sponsor_id;
  end if;

  select json_build_object(
    'sponsor', json_build_object(
      'id', _sponsor.id,
      'name', _sponsor.name,
      'trade_name', _sponsor.trade_name,
      'logo_path', _sponsor.logo_path,
      'segment', _sponsor.segment,
      'lifecycle', _sponsor.lifecycle,
      'health', _sponsor.health
    ),
    'contracts', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'title', c.title, 'status', c.status, 'total_value', c.total_value,
        'start_date', c.start_date, 'end_date', c.end_date
      ) order by c.start_date desc nulls last)
      from public.contracts c
      where c.sponsor_id = _sponsor_id
    ), '[]'::json),
    'deliveries_summary', (
      select json_build_object(
        'total', count(*),
        'aprovadas', count(*) filter (where d.status = 'aprovada'),
        'pendentes', count(*) filter (where d.status in ('pendente', 'em_producao')),
        'atrasadas', count(*) filter (where d.status = 'atrasada')
      )
      from public.deliveries d
      where d.sponsor_id = _sponsor_id
    ),
    'installments_summary', (
      select json_build_object(
        'total', count(*),
        'pendentes', count(*) filter (where i.status = 'pendente'),
        'atrasadas', count(*) filter (where i.status = 'atrasado'),
        'proxima_vencimento', min(i.due_date) filter (where i.status = 'pendente')
      )
      from public.installments i
      where i.sponsor_id = _sponsor_id
    ),
    'proposals', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'title', p.title, 'status', p.status, 'total_value', p.total_value, 'sent_at', p.sent_at
      ) order by p.created_at desc)
      from public.proposals p
      where p.sponsor_id = _sponsor_id
    ), '[]'::json)
  ) into _result;

  return _result;
end;
$$;

comment on function public.get_portal_sponsor_overview(uuid) is
  'Confiança média: estrutura do JSON de retorno é inferida (não há consumidor no repositório que revele o shape exato, ao contrário de get_delivery_report_data). Campos escolhidos por serem exatamente os liberados nas policies "_sponsor_portal_read" de 0005_rls_policies.sql Seção 9 (contratos/entregas/parcelas/propostas) mais um subconjunto deliberadamente restrito de sponsors (nunca notes/tax_id/account_owner_id/dados internos). SECURITY DEFINER é essencial aqui (não opcional): não existe policy de leitura de `sponsors` para o portal do patrocinador em 0005_rls_policies.sql, então sem SECURITY DEFINER um usuário do portal não conseguiria ver nem o nome do próprio patrocinador. Valida explicitamente dentro do corpo (has_sponsor_portal_access OU is_org_member) antes de devolver qualquer dado, conforme exigido pela tarefa para toda função SECURITY DEFINER que bypassa RLS.';

-- =========================================================================
-- crm_unlinked_records: "Lista administrativa de pendências via view
-- crm_unlinked_records" (plano, Fase 1, item 4) - deliveries/installments
-- ainda sem sponsor_id vinculado. Colunas de saída confirmadas em types.ts
-- (bloco Views): created_at, entity_id, entity_type, label, organization_id.
-- =========================================================================

create or replace view public.crm_unlinked_records
with (security_invoker = true)
as
select
  d.id as entity_id,
  'delivery'::text as entity_type,
  d.title as label,
  d.organization_id,
  d.created_at
from public.deliveries d
where d.sponsor_id is null
  and d.organization_id is not null

union all

select
  i.id as entity_id,
  'installment'::text as entity_type,
  coalesce(c.title, 'Parcela ' || i.installment_number::text) as label,
  i.organization_id,
  i.created_at
from public.installments i
left join public.contracts c on c.id = i.contract_id
where i.sponsor_id is null
  and i.organization_id is not null;

comment on view public.crm_unlinked_records is
  'Confiança média-alta: nome e colunas de saída (created_at, entity_id, entity_type, label, organization_id) confirmados em types.ts (bloco Views). Conteúdo (deliveries + installments sem sponsor_id) é exatamente o que o plano descreve ("Lista administrativa de pendências"). `label` é inferido (deliveries.title; para installments, o título do contrato pai ou um rótulo genérico "Parcela N" se o contrato também já não tiver título). WITH (security_invoker = true) é deliberado e crítico para isolamento de organização: sem essa opção, a view rodaria com os privilégios de quem a criou (ignorando RLS de quem consulta); com ela, a view respeita as policies tenant de deliveries/installments do usuário que está efetivamente consultando. Requer PostgreSQL 15+ (reloption security_invoker em views) - assumido disponível no stack self-hosted deste projeto (ADR-0001).';
