import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type SetupState = "checking" | "ready" | "failed" | "creating";

type OrganizationMember = {
  organization_id: string;
  role: string;
  organization: { name: string | null } | null;
};

type CreateOrganizationResponse = {
  organizationId?: string;
  error?: string;
  diagnostic?: {
    title?: string;
    probableCause?: string;
    suggestedFix?: string;
  } | null;
};

const ACTIVE_ORG_KEY = "active_organization_id";

const OrganizationSetup = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<SetupState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<CreateOrganizationResponse["diagnostic"]>(null);

  const companyName = useMemo(() => {
    const value = String(user?.user_metadata?.company ?? "").trim();
    return value.length >= 2 ? value : "Minha organização";
  }, [user]);

  const verifyOrganization = useCallback(async () => {
    if (!user) return;
    setState("checking");
    setErrorMessage(null);
    setDiagnostic(null);

    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, role, organization:organizations(name)")
      .eq("user_id", user.id)
      .eq("status", "ativo")
      .limit(1)
      .maybeSingle();

    if (error) {
      setState("failed");
      setErrorMessage(error.message);
      return;
    }

    const member = data as OrganizationMember | null;
    if (member?.organization_id) {
      localStorage.setItem(ACTIVE_ORG_KEY, member.organization_id);
      setState("ready");
      toast.success(`Organização pronta${member.organization?.name ? `: ${member.organization.name}` : ""}`);
      navigate("/dashboard", { replace: true });
      return;
    }

    setState("failed");
    setErrorMessage("Nenhuma organização ativa foi encontrada para sua conta.");
  }, [navigate, user]);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
    if (!loading && user) void verifyOrganization();
  }, [loading, navigate, user, verifyOrganization]);

  const createOrganization = async () => {
    setState("creating");
    setErrorMessage(null);
    setDiagnostic(null);

    const { data, error } = await supabase.functions.invoke<CreateOrganizationResponse>("create-organization", {
      body: { name: companyName, cnpj: null },
    });

    if (error || data?.error) {
      setState("failed");
      setErrorMessage(data?.error ?? error?.message ?? "Falha ao criar organização.");
      setDiagnostic(data?.diagnostic ?? null);
      return;
    }

    if (data?.organizationId) {
      localStorage.setItem(ACTIVE_ORG_KEY, data.organizationId);
      toast.success("Organização criada com sucesso");
      navigate("/dashboard", { replace: true });
      return;
    }

    setState("failed");
    setErrorMessage("A criação retornou sem identificador da organização.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const isBusy = loading || state === "checking" || state === "creating";

  return (
    <main className="min-h-screen bg-surface-soft px-4 py-8 md:py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <Logo sizeClassName="h-12" />
          <Button variant="ghost" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>

        <section className="rounded-lg border border-border bg-background p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              {state === "ready" ? <CheckCircle2 className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight">Setup da Organização</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Estamos validando se sua organização e seu acesso de owner foram configurados corretamente.
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex items-start gap-3 rounded-md border border-border bg-card p-4">
              {isBusy ? (
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
              ) : state === "ready" ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
              )}
              <div>
                <p className="font-medium">
                  {isBusy ? "Verificando organização" : state === "ready" ? "Organização configurada" : "Setup incompleto"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isBusy
                    ? "Aguarde enquanto confirmamos a organização e o vínculo de owner."
                    : state === "ready"
                      ? "Tudo certo. Você será redirecionado para o dashboard."
                      : errorMessage ?? "Não foi possível confirmar a organização."}
                </p>
              </div>
            </div>

            {state === "failed" && (
              <div className="rounded-md border border-border bg-card p-4">
                <h2 className="font-semibold">Como resolver</h2>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>Atualize a verificação para confirmar se o processamento terminou.</li>
                  <li>Se a sessão expirou, saia e entre novamente antes de tentar criar a organização.</li>
                  <li>Use a criação assistida para recriar a organização e o vínculo de owner em uma única operação.</li>
                  <li>Se persistir, confira os logs de falhas para validar policy de criação, owner e membership.</li>
                </ol>
                {diagnostic && (
                  <div className="mt-4 rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium text-foreground">{diagnostic.title ?? "Diagnóstico automático"}</p>
                    <p className="mt-1 text-muted-foreground">{diagnostic.probableCause}</p>
                    <p className="mt-1 text-muted-foreground">Correção sugerida: {diagnostic.suggestedFix}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button onClick={verifyOrganization} disabled={isBusy} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Verificar novamente
            </Button>
            <Button onClick={createOrganization} disabled={isBusy} className="gap-2">
              {state === "creating" && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar organização agora
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
};

export default OrganizationSetup;