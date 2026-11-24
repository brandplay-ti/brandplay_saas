import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

export type InclusaoPendente = {
  titulo: string;
  valor: number;
  /** Motivo de atenção (`riscoDeDuplicar`), ou `null`. */
  aviso: string | null;
};

type Props = {
  inclusoes: InclusaoPendente[] | null;
  onCancelar: () => void;
  onConfirmar: () => void;
  /** Texto do botão de confirmar (o assistente inclui ao salvar). */
  rotuloConfirmar?: string;
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Confirmação antes de levar ativações para os itens (BP-9): mostra o que entra,
 * quanto o total sobe e o que pode estar duplicado. Quem decide é o usuário.
 */
export function ConfirmarAtivacoesDialog({ inclusoes, onCancelar, onConfirmar, rotuloConfirmar = "Incluir nos itens" }: Props) {
  const lista = inclusoes ?? [];
  const acrescimo = lista.reduce((s, i) => s + i.valor, 0);
  const comAviso = lista.filter((i) => i.aviso).length;

  return (
    <AlertDialog open={inclusoes !== null} onOpenChange={(v) => !v && onCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {lista.length === 1 ? "Incluir a ativação nos itens?" : `Incluir ${lista.length} ativações nos itens?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {comAviso > 0
              ? "Confira os avisos: incluir uma ativação que já está coberta por outro item cobra a mesma entrega duas vezes."
              : "Cada ativação vira um item livre, com quantidade 1 e o valor informado."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {lista.map((i, idx) => (
            <li key={idx} className="rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{i.titulo}</span>
                <span className="shrink-0">{i.valor > 0 ? fmtBRL(i.valor) : "Sem valor"}</span>
              </div>
              {i.aviso && (
                <p className="mt-1 flex items-center gap-1 text-xs text-warning-strong">
                  <AlertTriangle className="h-3 w-3" /> {i.aviso}
                </p>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Acréscimo nos itens: <span className="font-semibold text-foreground">{fmtBRL(acrescimo)}</span>
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>{rotuloConfirmar}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
