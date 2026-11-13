import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/PasswordInput";
import { useAddSupport } from "@/hooks/usePlatformAdmin";
import { novoSuporteSchema, type NovoSuporte } from "@/lib/platformAdmin";

const VAZIO: NovoSuporte = { fullName: "", email: "", password: "", comment: "" };

/** Cadastro de uma pessoa da equipe com o perfil Suporte (0046). */
export const AddSupportDialog = () => {
  const [aberto, setAberto] = useState(false);
  const cadastrar = useAddSupport();
  const form = useForm<NovoSuporte>({
    resolver: zodResolver(novoSuporteSchema),
    defaultValues: VAZIO,
  });

  const fechar = (v: boolean) => {
    setAberto(v);
    if (!v) form.reset(VAZIO);
  };

  const enviar = async (valores: NovoSuporte) => {
    try {
      const r = await cadastrar.mutateAsync(valores);
      toast.success(
        r.conta === "existente"
          ? "Suporte concedido. A pessoa já tinha conta: a senha dela não mudou."
          : "Suporte cadastrado. Passe a senha temporária à pessoa por um canal seguro.",
      );
      fechar(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Cadastrar suporte
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar suporte</DialogTitle>
          <DialogDescription>
            O suporte lista os clientes, dá baixa em faturas, lança descontos e entra no painel do
            cliente. Não vê faturamento, planos, IA nem a equipe.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha temporária</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormDescription>
                    Só vale se a pessoa ainda não tem conta. Quem já tem conta mantém a senha.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Ex.: entrou na equipe de atendimento"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Fica registrado no histórico administrativo.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => fechar(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
