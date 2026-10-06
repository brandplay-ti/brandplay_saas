CREATE OR REPLACE FUNCTION public.notify_opportunity_comment_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _mentioned_user uuid;
  _brand text;
  _author_name text;
  _excerpt text;
  _new_mentions uuid[];
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(m), '{}') INTO _new_mentions
    FROM unnest(NEW.mentions) AS m
    WHERE NOT (m = ANY(COALESCE(OLD.mentions, '{}')));
  ELSE
    _new_mentions := NEW.mentions;
  END IF;

  IF _new_mentions IS NULL OR array_length(_new_mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.brand INTO _brand
  FROM public.opportunities o
  WHERE o.id = NEW.opportunity_id
  LIMIT 1;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(p.company), ''), 'Alguém') INTO _author_name
  FROM public.profiles p
  WHERE p.id = NEW.author_id
  LIMIT 1;

  _excerpt := left(regexp_replace(NEW.content, '\s+', ' ', 'g'), 180);

  FOREACH _mentioned_user IN ARRAY _new_mentions LOOP
    INSERT INTO public.notifications (
      user_id,
      organization_id,
      category,
      priority,
      title,
      description,
      action_url,
      related_entity_type,
      related_entity_id,
      metadata,
      dedupe_key
    )
    SELECT
      _mentioned_user,
      NEW.organization_id,
      'opportunity_mention',
      'alta',
      'Você foi mencionado em uma oportunidade',
      COALESCE(_author_name, 'Alguém') || ' mencionou você em ' || COALESCE(_brand, 'uma oportunidade') || ': ' || _excerpt,
      '/dashboard/pipeline',
      'opportunity_comment',
      NEW.id,
      jsonb_build_object(
        'opportunity_id', NEW.opportunity_id,
        'opportunity_brand', _brand,
        'comment_id', NEW.id,
        'author_id', NEW.author_id,
        'comment_kind', NEW.kind,
        'excerpt', _excerpt
      ),
      'opportunity_mention:' || NEW.id::text || ':' || _mentioned_user::text
    WHERE EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = NEW.organization_id
        AND om.user_id = _mentioned_user
        AND om.status = 'ativo'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = _mentioned_user
        AND n.dedupe_key = 'opportunity_mention:' || NEW.id::text || ':' || _mentioned_user::text
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notify_opportunity_comment_mentions ON public.opportunity_comments;
CREATE TRIGGER notify_opportunity_comment_mentions
AFTER INSERT OR UPDATE OF mentions ON public.opportunity_comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_opportunity_comment_mentions();

REVOKE EXECUTE ON FUNCTION public.notify_opportunity_comment_mentions() FROM PUBLIC, anon, authenticated;