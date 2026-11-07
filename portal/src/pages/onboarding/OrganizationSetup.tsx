import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, LogOut, Mail, Palette, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { BrandKitCard } from "@/components/organization/BrandKitCard";
import { ConvitesPendentes } from "@/components/organization/ConvitesPendentes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ClientTypeField } from "@/components/organization/ClientTypeField";
import type { TipoDeCliente } from "@/lib/permissoes";
import { useConvitesDeOrganizacao, type ConviteDeOrganizacao } from "@/hooks/useConvitesDeOrganizacao";
import { mensagemDeErroDoConvite } from "@/lib/convites";
import type { BillingStatus } from "@/lib/billing";
import { lembrarEtapaDeMarcaPulada, precisaDaEtapaDeMarca, pulouEtapaDeMarca } from "@/lib/onboardingMarca";
import { toast } from "sonner";

type SetupState = "checking" | "ready" | "failed" | "creating" | "marca";

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
  const [orgDaMarca, setOrgDaMarca] = useState<string | null>(null);
  // Com a etapa de marca aberta, uma nova verificação (o `user` muda de
  // identidade quando o token renova) tiraria a tela e o que foi digitado.
  const etapaDeMarcaAberta = useRef(false);
  const abrirEtapaDeMarca = useCallback((orgId: string) => {
    etapaDeMarcaAberta.current = true;
    setOrgDaMarca(orgId);
    setState("marca");
  }, []);
  const { convites, aceitar, recusar } = useConvitesDeOrganizacao();
  const [conviteOcupado, setConviteOcupado] = useState<string | null>(null);
  const [pularConvites, setPularConvites] = useState(false);
  // Convite pendente aparece antes de seguir para o dashboard. Erro ao listar
  // não segura o login: segue como se não houvesse convite.
  const pendentes = convites.data ?? [];
  const mostrarConvites = pendentes.length > 0 && !pularConvites;
  // Durante o aceite a lista recarrega vazia; sem esta trava a verificação
  // escolheria outra organização ativa antes de ir para o dashboard.
  const convitesResolvidos = convites.isFetched && !mostrarConvites && conviteOcupado === null;

  // O tipo escolhido no cadastro; a criação assistida deixa conferir.
  const [clientType, setClientType] = useState<TipoDeCliente>("agencia");
  useEffect(() => {
    setClientType(user?.user_metadata?.client_type === "marca" ? "marca" : "agencia");
  }, [user]);

  const companyName = useMemo(() => {
    const value = String(user?.user_metadata?.company ?? "").trim();
    return value.length >= 2 ? value : "Minha organização";
  }, [user]);

  // Etapa de marca (lib/onboardingMarca.ts). Erro em qualquer consulta não
  // segura o login: segue para o painel sem a etapa.
  const deveMostrarMarca = useCallback(async (orgId: string, papel: string) => {
    // Papel e "pulada" se conferem antes de ir ao banco.
    if (!precisaDaEtapaDeMarca({ papel, temKit: false, temAcesso: true, pulou: pulouEtapaDeMarca(orgId) })) {
      return false;
    }
    const [kit, status] = await Promise.all([
      supabase.from("organization_brand_kits").select("organization_id").eq("organization_id", orgId).maybeSingle(),
      supabase.rpc("billing_status", { _org_id: orgId }),
    ]);
    if (kit.error || status.error) return false;
    // O tipo gerado de uma função que devolve jsonb é `Json`; o formato está
    // fixado na 0024 e espelhado em `BillingStatus`.
    const acesso = (status.data as unknown as BillingStatus | null)?.access === true;
    return precisaDaEtapaDeMarca({ papel, temKit: !!kit.data, temAcesso: acesso, pulou: false });
  }, []);

  const verifyOrganization = useCallback(async () => {
    if (!user || etapaDeMarcaAberta.current) return;
    setState("checking");
    setErrorMessage(null);
    setDiagnostic(null);

    const [{ data, error }, { data: superadmin }] = await Promise.all([
      supabase
        .from("organization_members")
        .select("organization_id, role, organization:organizations(name)")
        .eq("user_id", user.id)
        .eq("status", "ativo")
        .limit(1)
        .maybeSingle(),
      // Falha aqui não bloqueia o login: segue o fluxo de quem não é superadmin.
      supabase.rpc("is_platform_admin"),
    ]);

    const member = error ? null : (data as OrganizationMember | null);
    if (member?.organization_id) localStorage.setItem(ACTIVE_ORG_KEY, member.organization_id);

    // O superadmin da plataforma entra sempre pela administração (ADR-0008),
    // seja ou não membro de alguma organização; o painel dela fica a um clique
    // em "Painel da organização". Redirecionamento é experiência: a fronteira
    // é o banco.
    if (superadmin === true) {
      navigate("/admin", { replace: true });
      return;
    }

    if (error) {
      setState("failed");
      setErrorMessage(error.message);
      return;
    }

    if (member?.organization_id) {
      if (await deveMostrarMarca(member.organization_id, member.role)) {
        abrirEtapaDeMarca(member.organization_id);
        return;
      }
      setState("ready");
      toast.success(`Organização pronta${member.organization?.name ? `: ${member.organization.name}` : ""}`);
      navigate("/dashboard", { replace: true });
      return;
    }

    setState("failed");
    setErrorMessage("Nenhuma organização ativa foi encontrada para sua conta.");
  }, [abrirEtapaDeMarca, deveMostrarMarca, navigate, user]);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
    if (!loading && user && convitesResolvidos) void verifyOrganization();
  }, [loading, navigate, user, verifyOrganization, convitesResolvidos]);

  const aceitarConvite = async (convite: ConviteDeOrganizacao) => {
    setConviteOcupado(convite.id);
    try {
      const orgId = await aceitar.mutateAsync(convite.id);
      localStorage.setItem(ACTIVE_ORG_KEY, orgId);
      toast.success(`Você entrou em ${convite.organization_name}`);
      navigate("/dashboard", { replace: true });
    } catch (erro) {
      toast.error(mensagemDeErroDoConvite(erro, convite.organization_name));
      setConviteOcupado(null);
    }
  };

  const recusarConvite = async (convite: ConviteDeOrganizacao) => {
    setConviteOcupado(convite.id);
    try {
      await recusar.mutateAsync(convite.id);
      toast.success(`Convite de ${convite.organization_name} recusado`);
    } catch (erro) {
      toast.error(mensagemDeErroDoConvite(erro, convite.organization_name));
    } finally {
      setConviteOcupado(null);
    }
  };

  const createOrganization = async () => {
    setState("creating");
    setErrorMessage(null);
    setDiagnostic(null);

    const { data, error } = await supabase.functions.invoke<CreateOrganizationResponse>("create-organization", {
      body: { name: companyName, cnpj: null, client_type: clientType },
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
      // Quem cria é o owner, e a organização nasce sem kit de marca.
      if (await deveMostrarMarca(data.organizationId, "owner")) {
        abrirEtapaDeMarca(data.organizationId);
        return;
      }
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

  const irParaOPainel = () => navigate("/dashboard", { replace: true });

  if (state === "marca" && orgDaMarca) {
    return (
      <main className="min-h-screen bg-surface-soft px-4 py-8 md:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <div className="flex items-center justify-between gap-4">
            <Logo sizeClassName="h-8" />
            <Button variant="ghost" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>

          <section className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Palette className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight">Cores e logo da sua organização</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Os relatórios, as propostas e os contratos da sua organização vão sair com estas cores e este
                logo. Você pode mudar depois em Configurações.
              </p>
            </div>
          </section>

          <BrandKitCard
            organizationId={orgDaMarca}
            podeEditar
            aoSalvarCores={irParaOPainel}
            rotuloSalvar="Salvar e continuar"
          />

          <div>
            <Button
              variant="ghost"
              onClick={() => {
                lembrarEtapaDeMarcaPulada(orgDaMarca);
                irParaOPainel();
              }}
            >
              Pular por agora
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-soft px-4 py-8 md:py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <Logo sizeClassName="h-8" />
          <Button variant="ghost" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>

        {mostrarConvites && (
          <section className="rounded-lg border border-border bg-background p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Mail className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight">
                  {pendentes.length === 1 ? "Você tem um convite" : "Você tem convites"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ao aceitar, você passa a fazer parte da organização com o papel indicado. As organizações em
                  que você já está continuam iguais.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <ConvitesPendentes
                convites={pendentes}
                ocupado={conviteOcupado}
                onAceitar={aceitarConvite}
                onRecusar={recusarConvite}
              />
            </div>
            <div className="mt-6">
              <Button variant="ghost" onClick={() => setPularConvites(true)} disabled={conviteOcupado !== null}>
                Agora não
              </Button>
            </div>
          </section>
        )}

        {!mostrarConvites && (
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

            {state === "failed" && (
              <div className="mt-6 space-y-2">
                <span className="text-sm font-medium leading-none">Tipo de cliente da organização</span>
                <ClientTypeField value={clientType} onChange={setClientType} disabled={isBusy} idPrefix="setup-tipo" />
              </div>
            )}
  
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
        )}
      </div>
    </main>
  );
};

export default OrganizationSetup;