CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  _name text,
  _cnpj text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _org_id uuid;
  _clean_name text := btrim(_name);
  _clean_cnpj text := nullif(regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g'), '');
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado para criar organização';
  END IF;

  IF _clean_name IS NULL OR length(_clean_name) < 2 THEN
    RAISE EXCEPTION 'Informe o nome da organização';
  END IF;

  INSERT INTO public.organizations (name, owner_id, cnpj)
  VALUES (_clean_name, _actor, _clean_cnpj)
  RETURNING id INTO _org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (_org_id, _actor, 'owner', 'ativo')
  ON CONFLICT DO NOTHING;

  RETURN _org_id;
EXCEPTION
  WHEN unique_violation THEN
    IF position('organizations_cnpj_unique' in SQLERRM) > 0 THEN
      RAISE EXCEPTION 'Este CNPJ já está cadastrado';
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text) TO authenticated;