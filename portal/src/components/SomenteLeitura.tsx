import { Eye } from "lucide-react";
import { mensagemSemEdicao, type ModuloDePermissao } from "@/lib/permissoes";

/**
 * Aviso para quem só lê o módulo: no lugar dos botões de criar e alterar.
 * Só experiência; quem recusa a gravação é a RLS (`can_access_module(..., true)`).
 */
export function SomenteLeitura({ module }: { module: ModuloDePermissao }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span><span className="font-medium text-foreground">Somente leitura.</span> {mensagemSemEdicao(module)}</span>
    </p>
  );
}
