-- Recria o gatilho que vincula automaticamente o criador como owner da organização
DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;

CREATE TRIGGER on_organization_created
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_organization();