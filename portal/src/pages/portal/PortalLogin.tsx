import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function PortalLogin() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const inviteToken = searchParams.get("invite");
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviteSponsor, setInviteSponsor] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && !inviteToken) navigate("/portal", { replace: true });
  }, [user, loading, inviteToken, navigate]);

  // Carrega o convite (se houver) para mostrar o nome do patrocinador
  useEffect(() => {
    if (!inviteToken) return;
    (async () => {
      const { data } = await (supabase as any)
        .rpc("get_sponsor_invite_by_token", { p_token: inviteToken })
        .maybeSingle();
      if (!data) {
        toast.error("Convite inválido");
        return;
      }
      setEmail(data.email);
      setInviteSponsor(data.sponsor_name ?? "patrocinador");
      setMode("signup");
    })();
  }, [inviteToken]);

  const acceptInvite = async () => {
    if (!inviteToken) return;
    const { error } = await (supabase as any).rpc("accept_sponsor_invite_by_token", { p_token: inviteToken });
    if (error) throw error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/portal`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.user && data.session) await acceptInvite();
        toast.success("Conta criada!");
        navigate("/portal", { replace: true });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (inviteToken && data.user) await acceptInvite();
        toast.success("Bem-vindo!");
        navigate("/portal", { replace: true });
      }
    } catch (err: any) {
      const msg = err?.message ?? "Erro ao autenticar";
      if (msg.toLowerCase().includes("invalid login")) toast.error("E-mail ou senha incorretos.");
      else if (msg.toLowerCase().includes("already registered")) toast.error("E-mail já cadastrado. Tente entrar.");
      else toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex relative bg-gradient-brand p-12 flex-col justify-between text-primary-foreground">
        <Logo showWordmark={false} sizeClassName="h-20 w-20" />
        <div>
          <h2 className="text-4xl font-bold leading-tight">Portal do Patrocinador</h2>
          <p className="mt-4 text-primary-foreground/80 text-lg">
            Acompanhe entregas, contratos e relatórios das suas ativações em tempo real.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">© {new Date().getFullYear()} BrandPlay</p>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>

          <div className="md:hidden mb-6">
            <Logo sizeClassName="h-14" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "login" ? "Entrar no Portal" : "Criar conta de patrocinador"}
          </h1>
          {inviteSponsor ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Você foi convidado por <strong>{inviteSponsor}</strong> para acessar o portal.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "login"
                ? "Acesse entregas, contratos e relatórios."
                : "Crie sua conta. A propriedade vai vincular seu acesso após confirmação."}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                required
                disabled={!!inviteToken && mode === "signup"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full bg-gradient-brand hover:opacity-90 shadow-glow">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          {!inviteToken && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? "Ainda não tem conta?" : "Já tem uma conta?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="font-semibold text-primary hover:underline"
              >
                {mode === "login" ? "Criar conta" : "Entrar"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
