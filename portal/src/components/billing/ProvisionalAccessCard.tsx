import { useState, type FormEvent } from "react";
import { Loader2, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const TIPOS_ACEITOS = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

interface Props {
  orgId: string;
  /** Prazo da liberação, em horas (`billing_settings`). */
  hours: number;
  pending: boolean;
  /** Chamado com o caminho do comprovante já enviado ao bucket. */
  onRequest: (receiptPath: string) => void;
}

/**
 * Liberação provisória enquanto o boleto compensa (0025): o comprovante vai
 * para o bucket privado `billing-receipts`, e a manage-billing confere no
 * Stripe que a fatura em aberto é mesmo de boleto antes de liberar.
 */
export const ProvisionalAccessCard = ({ orgId, hours, pending, onRequest }: Props) => {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [declarou, setDeclarou] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!arquivo || !declarou) return;
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      toast.error("Envie o comprovante em PDF, PNG, JPG ou WEBP.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      toast.error("O comprovante deve ter até 10 MB.");
      return;
    }

    setEnviando(true);
    const nome = arquivo.name.replace(/[^\w.-]+/g, "_");
    const caminho = `${orgId}/${Date.now()}-${nome}`;
    const { error } = await supabase.storage.from("billing-receipts").upload(caminho, arquivo, {
      contentType: arquivo.type,
    });
    setEnviando(false);
    if (error) {
      toast.error("Não foi possível enviar o comprovante.", { description: error.message });
      return;
    }
    onRequest(caminho);
  };

  const ocupado = enviando || pending;

  return (
    <Card className="border-warning/40">
      <form onSubmit={enviar}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Unlock className="h-5 w-5" /> Já pagou o boleto?
          </CardTitle>
          <CardDescription>
            O boleto leva até 1 dia útil para compensar depois de pago. Enquanto isso, você pode liberar o acesso da
            equipe por {hours} horas anexando o comprovante. Vale uma vez por fatura.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="comprovante">Comprovante de pagamento</Label>
            <Input
              id="comprovante"
              type="file"
              accept={TIPOS_ACEITOS.join(",")}
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              disabled={ocupado}
            />
            <p className="text-xs text-muted-foreground">PDF ou imagem, até 10 MB.</p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="declaracao"
              checked={declarou}
              onCheckedChange={(v) => setDeclarou(v === true)}
              disabled={ocupado}
            />
            <Label htmlFor="declaracao" className="text-sm font-normal leading-snug">
              Declaro que o boleto desta contratação já foi pago.
            </Label>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={!arquivo || !declarou || ocupado}>
            {ocupado && <Loader2 className="animate-spin" />}
            Liberar acesso por {hours} horas
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};
