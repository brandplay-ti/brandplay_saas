import { useEffect, useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ProposalMessageFieldProps {
  /** Mensagem gravada na proposta. */
  value: string | null;
  /** Grava a mensagem; recebe `null` quando o campo fica vazio. */
  onSave: (message: string | null) => unknown;
}

/**
 * Mensagem da proposta na aba Info (BP-8). Grava ao sair do campo, como os
 * demais campos da aba, e só quando o texto mudou.
 */
export function ProposalMessageField({ value, onSave }: ProposalMessageFieldProps) {
  const id = useId();
  const [rascunho, setRascunho] = useState(value ?? "");

  // A mensagem pode mudar por fora (assistente da aba Versões IA).
  useEffect(() => {
    setRascunho(value ?? "");
  }, [value]);

  const gravar = () => {
    const nova = rascunho.trim() === "" ? null : rascunho;
    if (nova === (value ?? null)) return;
    void onSave(nova);
  };

  return (
    <div className="space-y-1 p-1" data-field="mensagem">
      <Label htmlFor={id} className="text-xs text-muted-foreground">Mensagem</Label>
      <Textarea
        id={id}
        rows={6}
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={gravar}
        placeholder="Mensagem de apresentação da proposta"
      />
      <p className="text-xs text-muted-foreground">
        Salva ao sair do campo. Gere o PDF de novo para levar a mudança ao documento.
      </p>
    </div>
  );
}
