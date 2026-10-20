import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PasswordInput } from "@/components/PasswordInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  ROTAS_DA_ORIGEM,
  SENHA_MINIMO,
  lerErroDoLink,
  lerOrigem,
  linkParaEsqueciSenha,
  mensagemErroRedefinicao,
  novaSenhaSchema,
} from "@/lib/recuperacaoSenha";

type Valores = z.infer<typeof novaSenhaSchema>;

export default function ResetarSenha() {
  const [searchParams] = useSearchParams();
  const origem = lerOrigem(searchParams.get("destino"));
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  // Lido uma vez, no primeiro render: é a URL com que o link do e-mail chegou.
  const [erroDoLink] = useState(() => lerErroDoLink(window.location.href));
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);

  const form = useForm<Valores>({
    resolver: zodResolver(novaSenhaSchema),
    defaultValues: { senha: "", confirmacao: "" },
  });

  const salvar = async ({ senha }: Valores) => {
    setErro(null);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setErro(mensagemErroRedefinicao(error));
      return;
    }
    setConcluido(true);
  };

  if (concluido) {
    return (
      <AuthLayout origem={origem}>
        <ShieldCheck className="h-10 w-10 text-primary" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Senha redefinida</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pronto! Use a nova senha nos próximos acessos. Você já está conectado.
        </p>
        <Button
          className="mt-8 w-full bg-gradient-brand hover:opacity-90 shadow-glow"
          onClick={() => navigate(ROTAS_DA_ORIGEM[origem].aposRedefinir, { replace: true })}
        >
          Continuar
        </Button>
      </AuthLayout>
    );
  }

  if (!erroDoLink && loading) {
    return (
      <AuthLayout origem={origem}>
        <div className="flex justify-center py-12" role="status" aria-label="Validando o link">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AuthLayout>
    );
  }

  if (erroDoLink || !session) {
    return (
      <AuthLayout origem={origem}>
        <h1 className="text-2xl font-bold tracking-tight">Link inválido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {erroDoLink ?? "Este link de recuperação expirou ou já foi usado. Peça um novo para continuar."}
        </p>
        <Button asChild className="mt-8 w-full bg-gradient-brand hover:opacity-90 shadow-glow">
          <Link to={linkParaEsqueciSenha(origem)}>Pedir um novo link</Link>
        </Button>
        <Button asChild variant="ghost" className="mt-2 w-full">
          <Link to={ROTAS_DA_ORIGEM[origem].login}>Voltar para o login</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout origem={origem}>
      <h1 className="text-2xl font-bold tracking-tight">Criar nova senha</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Escolha a nova senha da conta <strong>{session.user.email}</strong>.
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(salvar)} className="mt-8 space-y-4" noValidate>
          <FormField
            control={form.control}
            name="senha"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nova senha</FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder={`Mínimo de ${SENHA_MINIMO} caracteres`}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmacao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmar nova senha</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="Repita a nova senha" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="w-full bg-gradient-brand hover:opacity-90 shadow-glow"
          >
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Redefinir senha
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
