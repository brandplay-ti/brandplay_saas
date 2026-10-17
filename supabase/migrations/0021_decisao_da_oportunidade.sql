-- 0021_decisao_da_oportunidade.sql
--
-- Data da decisão da oportunidade (`opportunities.decided_at`).
--
-- O frontend grava `decided_at` ao fechar a oportunidade — tanto em
-- "Converter em contrato" quanto ao mover o card para "fechado"
-- (`components/pipeline/OpportunityDrawer.tsx`) — e a métrica de ciclo médio
-- de venda (`components/pipeline/PipelineMetrics.tsx`) lê a coluna. Ela nunca
-- existiu em `opportunities`, nem no banco do Lovable: lá, como aqui, o PATCH
-- inteiro era recusado (PGRST204), e com ele ia junto o `converted_contract_id`.
-- Resultado visível na validação de 2026-10-05: oportunidade fechada, contrato
-- criado, e nenhum vínculo entre os dois.
--
-- A `sync_opportunity_stage` original do Lovable também gravava `decided_at`;
-- a 0015 trocou por `last_stage_change_at` porque a coluna não existia. Aqui
-- ela volta a gravar as duas.
--
-- Aditiva: coluna nova anulável, backfill só de valores nulos.

alter table public.opportunities
  add column if not exists decided_at timestamptz;

comment on column public.opportunities.decided_at is
  'Quando a oportunidade foi decidida (fechada). Base do ciclo médio de venda.';

-- ─── Backfill ────────────────────────────────────────────────────────

-- `tg_validate_opportunity_org_access` recusa UPDATE sem usuário autenticado,
-- e uma migration não tem um. O gatilho libera o papel `service_role` — o
-- mesmo caminho das Edge Functions —, então a migration se declara assim.
-- `set_config(..., true)` vale só até o fim desta transação: nada vaza para
-- a sessão nem para as migrations seguintes.
select set_config('request.jwt.claim.role', 'service_role', true);

-- Oportunidades já fechadas: a melhor aproximação disponível da data da
-- decisão é a última mudança de estágio.
update public.opportunities
   set decided_at = coalesce(last_stage_change_at, updated_at)
 where stage = 'fechado'
   and decided_at is null;

-- Vínculo oportunidade → contrato perdido pelo PATCH recusado: o contrato
-- guarda a oportunidade de origem, então o vínculo é recuperável. Se houver
-- mais de um contrato para a mesma oportunidade, fica o mais recente.
update public.opportunities o
   set converted_contract_id = c.id
  from (
    select distinct on (opportunity_id) id, opportunity_id
      from public.contracts
     where opportunity_id is not null
     order by opportunity_id, created_at desc
  ) c
 where c.opportunity_id = o.id
   and o.converted_contract_id is null;

-- ─── sync_opportunity_stage volta a registrar a decisão ──────────────
-- Mesmo corpo e mesmas permissões da 0015; só acrescenta `decided_at`.
create or replace function public.sync_opportunity_stage(_opportunity_id uuid, _target opportunity_stage)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _order text[] := array['prospect','reuniao','proposta_enviada','negociacao','fechado'];
  _current opportunity_stage;
begin
  if _opportunity_id is null then return; end if;
  select stage into _current from public.opportunities where id = _opportunity_id;
  if _current is null or _current = 'perdido' then return; end if;
  if array_position(_order, _target::text) is null then return; end if;
  if array_position(_order, _target::text) <= array_position(_order, _current::text) then return; end if;

  update public.opportunities
  set stage = _target,
      decided_at = case when _target = 'fechado' then coalesce(decided_at, now()) else decided_at end,
      last_stage_change_at = now(),
      updated_at = now()
  where id = _opportunity_id;
end;
$function$;
revoke all on function public.sync_opportunity_stage(_opportunity_id uuid, _target opportunity_stage) from public, anon, authenticated;
grant execute on function public.sync_opportunity_stage(_opportunity_id uuid, _target opportunity_stage) to service_role;
