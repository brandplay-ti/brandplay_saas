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

const Auth = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate("/onboarding/organizacao", { replace: true });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding/organizacao`,
            data: { full_name: fullName, company },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Você já está dentro.");
        navigate("/onboarding/organizacao", { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        navigate("/onboarding/organizacao", { replace: true });
      }
    } catch (err: any) {
      const msg = err?.message ?? "Erro ao autenticar";
      if (msg.toLowerCase().includes("invalid login")) {
        toast.error("E-mail ou senha incorretos.");
      } else if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("user already")) {
        toast.error("E-mail já cadastrado. Tente entrar.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      {/* Left brand panel */}
      <div className="hidden md:flex relative bg-gradient-brand p-12 flex-col justify-between text-primary-foreground">
        <Logo showWordmark={false} sizeClassName="h-20 w-20" />
        <div>
          <h2 className="text-4xl font-bold leading-tight">
            Transformando patrocínio em resultado.
          </h2>
          <p className="mt-4 text-primary-foreground/80 text-lg">
            Gerencie propriedades, contratos, entregas e relatórios em uma única plataforma.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">
          © {new Date().getFullYear()} BrandPlay
        </p>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="h-4 w-4" /> Voltar para o site
          </Link>

          <div className="md:hidden mb-6">
            <Logo sizeClassName="h-14" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "login" ? "Entrar na sua conta" : "Criar sua conta"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login"
              ? "Acesse o painel da sua propriedade."
              : "Comece grátis em menos de 1 minuto."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Empresa / Propriedade</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>
              </>
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

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-brand hover:opacity-90 shadow-glow"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

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
        </div>
      </div>
    </div>
  );
};

export default Auth;
