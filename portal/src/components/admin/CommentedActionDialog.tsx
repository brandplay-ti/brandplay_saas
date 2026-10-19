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

interface NumberField {
  label: string;
  min: number;
  max: number;
  defaultValue: number;
  description?: string;
}

interface Props {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Quantidade (horas, dias) pedida junto do comentário. */
  numberField?: NumberField;
  destructive?: boolean;
  /** Resolve quando a ação terminou; rejeitar mantém o diálogo aberto. */
  onConfirm: (values: { amount: number | null; comment: string }) => Promise<unknown>;
}

/**
 * Ação administrativa com comentário obrigatório — o comentário vai para a
 * auditoria (`platform_admin_audit_log`). O banco exige o mesmo; aqui é só
 * para o erro aparecer antes do envio.
 */
export const CommentedActionDialog = ({
  trigger,
  title,
  description,
  confirmLabel,
  numberField,
  destructive,
  onConfirm,
}: Props) => {
  const [aberto, setAberto] = useState(false);

  const schema = z.object({
    amount: numberField
      ? z.coerce
          .number({ invalid_type_error: "Informe um número." })
          .int("Use um número inteiro.")
          .min(numberField.min, `Mínimo: ${numberField.min}.`)
          .max(numberField.max, `Máximo: ${numberField.max}.`)
      : z.any().optional(),
    comment: z.string().trim().min(5, "Explique o motivo (ao menos 5 caracteres).").max(500, "Até 500 caracteres."),
  });
  type Valores = z.infer<typeof schema>;

  const form = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { amount: numberField?.defaultValue, comment: "" },
  });

  const enviar = async (valores: Valores) => {
    try {
      await onConfirm({ amount: numberField ? Number(valores.amount) : null, comment: valores.comment.trim() });
      setAberto(false);
      form.reset({ amount: numberField?.defaultValue, comment: "" });
    } catch {
      // Quem chama mostra o erro; o diálogo fica aberto para corrigir.
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) form.reset({ amount: numberField?.defaultValue, comment: "" });
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4">
            {numberField && (
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{numberField.label}</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" min={numberField.min} max={numberField.max} {...field} />
                    </FormControl>
                    {numberField.description && <FormDescription>{numberField.description}</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Quem pediu, o que aconteceu, combinado com o cliente" {...field} />
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
              <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
