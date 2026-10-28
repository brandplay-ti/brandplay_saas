import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  percentOff: z.coerce
    .number({ invalid_type_error: "Informe o percentual." })
    .int("Use um número inteiro.")
    .min(1, "Mínimo: 1%.")
    .max(100, "Máximo: 100%."),
  durationMonths: z.coerce
    .number({ invalid_type_error: "Informe o prazo." })
    .int("Use um número inteiro.")
    .min(1, "Mínimo: 1 mês.")
    .max(12, "Máximo: 12 meses."),
  comment: z.string().trim().min(5, "Explique o motivo (ao menos 5 caracteres).").max(500, "Até 500 caracteres."),
});

type Valores = z.infer<typeof schema>;

interface Props {
  trigger: ReactNode;
  onConfirm: (values: { percentOff: number; durationMonths: number; comment: string }) => Promise<unknown>;
}

/** Desconto percentual ou isenção (100%) por até 12 meses. O motivo vai para a auditoria. */
export const DiscountDialog = ({ trigger, onConfirm }: Props) => {
  const [aberto, setAberto] = useState(false);
  const form = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { percentOff: 100, durationMonths: 1, comment: "" },
  });

  const enviar = async (valores: Valores) => {
    try {
      await onConfirm({
        percentOff: Number(valores.percentOff),
        durationMonths: Number(valores.durationMonths),
        comment: valores.comment.trim(),
      });
      setAberto(false);
      form.reset({ percentOff: 100, durationMonths: 1, comment: "" });
    } catch {
      // Quem chama mostra o erro; o diálogo fica aberto.
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) form.reset({ percentOff: 100, durationMonths: 1, comment: "" });
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desconto ou isenção</DialogTitle>
          <DialogDescription>
            100% isenta a cobrança e mantém o acesso pelo prazo: o aviso de teste some. Com assinatura vigente, o cupom
            entra nela. Sem assinatura, entra no próximo checkout. Um desconto vigente por vez.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4">
            <FormField
              control={form.control}
              name="percentOff"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Percentual</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="numeric" min={1} max={100} {...field} />
                  </FormControl>
                  <FormDescription>De 1 a 100. 100 isenta.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="durationMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meses</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="numeric" min={1} max={12} {...field} />
                  </FormControl>
                  <FormDescription>De 1 a 12 meses.</FormDescription>
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
                    <Textarea rows={3} placeholder="Quem pediu e o combinado com o cliente" {...field} />
                  </FormControl>
                  <FormDescription>Fica registrado no histórico administrativo.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Aplicar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
