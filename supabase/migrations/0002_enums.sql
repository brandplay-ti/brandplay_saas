-- 0002_enums.sql
-- Todos os enums extraídos literalmente do bloco `Database["public"]["Enums"]`
-- de src/integrations/supabase/types.ts. Os valores abaixo são os valores
-- reais gerados pelo Supabase a partir do banco remoto (types.ts é gerado por
-- introspecção do schema, então estes literais são confiáveis - não são uma
-- suposição, ao contrário de boa parte dos defaults/constraints do restante
-- do schema).

create type public.app_role as enum ('admin', 'comercial', 'patrocinador');

create type public.contract_status as enum (
  'rascunho',
  'em_assinatura',
  'ativo',
  'vencendo',
  'encerrado',
  'cancelado'
);

create type public.crm_audit_source as enum ('manual', 'automatico', 'ia');

create type public.delivery_approval as enum ('pendente', 'aprovada', 'reprovada');

create type public.delivery_status as enum (
  'pendente',
  'em_producao',
  'entregue',
  'aprovada',
  'atrasada'
);

create type public.installment_status as enum ('pendente', 'pago', 'atrasado', 'cancelado');

create type public.opportunity_stage as enum (
  'prospect',
  'reuniao',
  'proposta_enviada',
  'negociacao',
  'fechado',
  'perdido'
);

create type public.org_role as enum ('owner', 'admin', 'comercial', 'operacional', 'financeiro');

create type public.payment_method as enum (
  'a_vista',
  'parcelado',
  'mensal',
  'personalizado',
  'quinzenal',
  'bimestral',
  'trimestral',
  'semestral',
  'anual'
);

create type public.proposal_status as enum (
  'rascunho',
  'enviada',
  'aceita',
  'recusada',
  'expirada'
);

create type public.sponsor_health as enum ('saudavel', 'atencao', 'risco', 'nao_aplicavel');

create type public.sponsor_interaction_source as enum ('manual', 'auto');

create type public.sponsor_interaction_type as enum (
  'reuniao',
  'ligacao',
  'email',
  'whatsapp',
  'nota',
  'proposta',
  'contrato',
  'oportunidade',
  'entrega',
  'parcela',
  'sistema'
);

create type public.sponsor_lifecycle as enum (
  'prospect',
  'em_abordagem',
  'qualificado',
  'em_negociacao',
  'cliente_ativo',
  'cliente_inativo',
  'perdido',
  'arquivado'
);

create type public.sponsor_priority as enum ('A', 'B', 'C');

create type public.sponsor_score as enum ('quente', 'morno', 'frio');
