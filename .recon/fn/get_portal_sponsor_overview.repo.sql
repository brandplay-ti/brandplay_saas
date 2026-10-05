CREATE OR REPLACE FUNCTION public.get_portal_sponsor_overview(_sponsor_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

