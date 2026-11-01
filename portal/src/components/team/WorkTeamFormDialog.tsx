import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { esquemaDaEquipe, type DadosDaEquipe } from "@/lib/equipes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dados atuais, ao editar. Sem eles o formulário cria uma equipe. */
  inicial?: DadosDaEquipe;
  /** Devolve true quando salvou, para fechar o diálogo. */
  onSalvar: (dados: DadosDaEquipe) => Promise<boolean>;
};

export function WorkTeamFormDialog({ open, onOpenChange, inicial, onSalvar }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar equipe" : "Nova equipe de trabalho"}</DialogTitle>
          <DialogDescription>
            Depois de criar, inclua os membros e os projetos que a equipe vai receber.
          </DialogDescription>
        </DialogHeader>
        {/* O formulário só monta com o diálogo aberto: cada abertura começa dos dados atuais. */}
        <Formulario inicial={inicial} onSalvar={onSalvar} onFechar={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  inicial,
  onSalvar,
  onFechar,
}: {
  inicial?: DadosDaEquipe;
  onSalvar: (dados: DadosDaEquipe) => Promise<boolean>;
  onFechar: () => void;
}) {
  const form = useForm<DadosDaEquipe>({
    resolver: zodResolver(esquemaDaEquipe),
    defaultValues: inicial ?? { name: "", description: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const enviar = form.handleSubmit(async (dados) => {
    if (await onSalvar(dados)) onFechar();
  });

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="equipe-nome">Nome</Label>
        <Input id="equipe-nome" placeholder="Ex.: Comercial SP" autoFocus {...form.register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="equipe-descricao">Descrição (opcional)</Label>
        <Textarea id="equipe-descricao" rows={3} {...form.register("description")} />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {inicial ? "Salvar" : "Criar equipe"}
        </Button>
      </DialogFooter>
    </form>
  );
}
