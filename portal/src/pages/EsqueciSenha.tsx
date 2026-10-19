import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  ROTAS_DA_ORIGEM,
  lerOrigem,
  mensagemErroPedido,
  pedidoRecuperacaoSchema,
  urlDeRedefinicao,
} from "@/lib/recuperacaoSenha";

type Valores = z.infer<typeof pedidoRecuperacaoSchema>;

export default function EsqueciSenha() {
  const [searchParams] = useSearchParams();
  const origem = lerOrigem(searchParams.get("destino"));
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const form = useForm<Valores>({
    resolver: zodResolver(pedidoRecuperacaoSchema),
    defaultValues: { email: "" },
  });

  const enviar = async ({ email }: Valores) => {
    setErro(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: urlDeRedefinicao(window.location.origin, origem),
    });
    if (error) {
      setErro(mensagemErroPedido(error));
      return;
    }
    setEnviadoPara(email);
  };

  return (
    <AuthLayout origem={origem}>
      <Link
        to={ROTAS_DA_ORIGEM[origem].login}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para o login
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Recuperar senha</h1>

      {enviadoPara ? (
        <div className="mt-8 space-y-6">
          <Alert>
            <MailCheck className="h-4 w-4" />
            <AlertDescription>
              Se houver uma conta com <strong>{enviadoPara}</strong>, enviamos um link para criar uma nova senha. O
              link vale por tempo limitado e só pode ser usado uma vez.
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">Não chegou? Confira a caixa de spam ou lixo eletrônico.</p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setEnviadoPara(null);
              form.reset({ email: "" });
            }}
          >
            Usar outro e-mail
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(enviar)} className="mt-8 space-y-4" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="voce@empresa.com" {...field} />
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
                Enviar link de recuperação
              </Button>
            </form>
          </Form>
        </>
      )}
    </AuthLayout>
  );
}
