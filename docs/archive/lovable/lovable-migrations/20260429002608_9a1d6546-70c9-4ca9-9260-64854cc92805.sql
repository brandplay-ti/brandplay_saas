DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;

CREATE TRIGGER on_organization_created
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_organization();