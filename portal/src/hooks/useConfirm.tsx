import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
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
import { buttonVariants } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Texto do botão de confirmação. Padrão: "Confirmar". */
  confirmLabel?: string;
  /** Texto do botão de cancelar. Padrão: "Cancelar". */
  cancelLabel?: string;
  /** Ação irreversível (excluir, revogar): botão vermelho. */
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * Diálogo de confirmação da aplicação, no lugar do `confirm()` nativo do
 * navegador (que não segue a identidade visual, não é traduzido pelo sistema
 * e bloqueia a página). Um só diálogo para o app inteiro, montado em `App.tsx`.
 */
export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  // As opções ficam guardadas depois de fechar para o texto não sumir durante
  // a animação de saída.
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => !next && finish(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{options.cancelLabel ?? "Cancelar"}</AlertDialogCancel>
            <AlertDialogAction
              className={options.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
              onClick={() => finish(true)}
            >
              {options.confirmLabel ?? "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
};

/** `const confirm = useConfirm(); if (!(await confirm({ title: "Excluir?" }))) return;` */
export const useConfirm = (): Confirm => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>");
  return ctx;
};
