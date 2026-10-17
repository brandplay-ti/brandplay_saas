import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSavePlan, type BillingPlan, type PlanFields, type SavePlanResult } from "@/hooks/usePlatformAdmin";
import { centsToInput, parseFeatures, parseLimit, parseReais, stripeSyncNotice } from "@/lib/platformAdmin";

const limite = (rotulo: string, minimo: number) =>
  z.string().refine((v) => {
    const n = parseLimit(v);
    return n === null || (Number.isInteger(n) && n >= minimo && n <= 100_000);
  }, `${rotulo}: inteiro a partir de ${minimo}, ou vazio para sem limite.`);

const schema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{1,39}$/, "De 2 a 40 caracteres: minúsculas, números, - ou _."),
  name: z.string().trim().min(2, "De 2 a 60 caracteres.").max(60, "De 2 a 60 caracteres."),
  description: z.string().trim().max(300, "Até 300 caracteres."),
  price: z.string().refine((v) => {
    const c = parseReais(v);
    return c === null || (!Number.isNaN(c) && c >= 100 && c <= 100_000_000);
  }, "Valor em reais (ex.: 490,00), a partir de R$ 1,00. Vazio = sob consulta."),
  maxProperties: limite("Propriedades", 0),
  maxUsers: limite("Usuários", 1),
  features: z.string().refine((v) => {
    const lista = parseFeatures(v);
    return lista.length <= 20 && lista.every((f) => f.length <= 80);
  }, "Até 20 recursos, um por linha, com até 80 caracteres."),
  highlight: z.boolean(),
  active: z.boolean(),
  sortOrder: z.coerce.number().int("Inteiro.").min(0).max(10_000),
  comment: z.string().trim().max(500, "Até 500 caracteres."),
});

type Valores = z.infer<typeof schema>;

function valoresIniciais(plano: BillingPlan | null): Valores {
  return {
    id: plano?.id ?? "",
    name: plano?.name ?? "",
    description: plano?.description ?? "",
    price: centsToInput(plano?.price_cents ?? null),
    maxProperties: plano?.max_properties == null ? "" : String(plano.max_properties),
    maxUsers: plano?.max_users == null ? "" : String(plano.max_users),
    features: (plano?.features ?? []).join("\n"),
    highlight: plano?.highlight ?? false,
    active: plano?.active ?? true,
    sortOrder: plano?.sort_order ?? 0,
    comment: "",
  };
}

function campos(v: Valores): PlanFields {
  return {
    name: v.name.trim(),
    description: v.description.trim(),
    price_cents: parseReais(v.price),
    max_properties: parseLimit(v.maxProperties),
    max_users: parseLimit(v.maxUsers),
    features: parseFeatures(v.features),
    highlight: v.highlight,
    active: v.active,
    sort_order: v.sortOrder,
  };
}

/** O que mudou em relação ao plano salvo — a função só altera o que recebe. */
function diferencas(antes: BillingPlan, depois: PlanFields): Partial<PlanFields> {
  const mudou: Partial<PlanFields> = {};
  (Object.keys(depois) as (keyof PlanFields)[]).forEach((k) => {
    if (JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) {
      (mudou as Record<string, unknown>)[k] = depois[k];
    }
  });
  return mudou;
}

interface Props {
  trigger: ReactNode;
  /** Nulo = plano novo. */
  plan: BillingPlan | null;
}

export const PlanFormDialog = ({ trigger, plan }: Props) => {
  const [aberto, setAberto] = useState(false);
  const salvar = useSavePlan();
  const form = useForm<Valores>({ resolver: zodResolver(schema), defaultValues: valoresIniciais(plan) });
  const editando = plan !== null;

  const precoDigitado = parseReais(form.watch("price"));
  const mudouPreco = editando && precoDigitado !== plan.price_cents && !Number.isNaN(precoDigitado);

  const enviar = async (v: Valores) => {
    const novos = campos(v);
    try {
      let resultado: SavePlanResult;
      if (editando) {
        const mudancas = diferencas(plan, novos);
        if (Object.keys(mudancas).length === 0) {
          setAberto(false);
          return;
        }
        resultado = await salvar.mutateAsync({ action: "update", planId: plan.id, plan: mudancas, comment: v.comment });
      } else {
        resultado = await salvar.mutateAsync({ action: "create", plan: { id: v.id.trim(), ...novos }, comment: v.comment });
      }
      toast.success(editando ? "Plano atualizado." : "Plano criado.");
      const aviso = stripeSyncNotice(resultado.stripe);
      if (aviso) toast[aviso.tone](aviso.text);
      setAberto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o plano.");
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        // Só ao abrir: a lista de planos recarrega em segundo plano, e
        // resetar a cada recarga apagaria o que está sendo digitado.
        if (v) form.reset(valoresIniciais(plan));
        setAberto(v);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editando ? `Editar ${plan.name}` : "Novo plano"}</DialogTitle>
          <DialogDescription>
            Preço e limites valem pelo banco; o Stripe recebe produto e preço ao salvar.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Identificador</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={editando} placeholder="ex.: pro-anual" autoComplete="off" />
                    </FormControl>
                    <FormDescription>Chave no checkout e no Stripe. Não muda depois.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço mensal (R$)</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" placeholder="Sob consulta" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxProperties"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Propriedades</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" placeholder="Sem limite" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxUsers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuários</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" placeholder="Sem limite" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {mudouPreco && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  O Stripe ganha um preço novo e o anterior é arquivado. Assinaturas em curso continuam no preço
                  antigo; migrar quem já assina é feito no Stripe.
                </AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="features"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recursos</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={5} placeholder="Um por linha" />
                  </FormControl>
                  <FormDescription>Aparecem no catálogo público e na tela de plano. Não aplicam limite.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <FormLabel>À venda</FormLabel>
                      <FormDescription>Fora de venda, quem assina continua.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="highlight"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <FormLabel>Destaque</FormLabel>
                      <FormDescription>Selo de recomendado.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordem no catálogo</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo (opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Fica no histórico administrativo" autoComplete="off" />
                  </FormControl>
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
                {editando ? "Salvar" : "Criar plano"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
