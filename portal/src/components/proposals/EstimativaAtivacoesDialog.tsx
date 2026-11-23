import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { avisarErroDeIA } from "@/lib/erroDeIA";
import type { Ativacao, SugestaoDeValor, ValorConfirmado } from "@/lib/propostaAtivacoes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/CurrencyInput";
import { AlertTriangle, Info, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

/** Item da proposta nova do assistente, ainda não gravado (só contexto para a IA). */
type ItemNaoGravado = { name: string; description?: string; quantity: number; unit_value: number };

type Props = {
  organizationId: string | null;
  ativacoes: Ativacao[];
  /** Proposta já gravada: a função lê os itens e o projeto dela no banco. */
  proposalId?: string | null;
  propertyId?: string | null;
  itensNaoGravados?: ItemNaoGravado[];
  onAplicar: (escolhas: ValorConfirmado[]) => void;
};

type Linha = SugestaoDeValor & { valor: string; usar: boolean };

export const AVISO_DA_ESTIMATIVA =
  "A sugestão usa a base da sua organização: projetos e propostas já cadastrados. Não é uma avaliação de mercado — é apenas uma sugestão para você revisar.";

const formatarMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const temConteudo = (a: Ativacao) => !!(a.title.trim() || a.description.trim());

/**
 * Sugestão de valor das ativações pela IA (BP-9). Opcional: nada é aplicado sem
 * o usuário marcar e confirmar cada valor, e uma ativação que pode duplicar um
 * item já vem desmarcada.
 */
export function EstimativaAtivacoesDialog({ organizationId, ativacoes, proposalId, propertyId, itensNaoGravados, onAplicar }: Props) {
  const [open, setOpen] = useState(false);
  const [escolhidas, setEscolhidas] = useState<Set<number>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [semBase, setSemBase] = useState(false);

  const abrir = (v: boolean) => {
    setOpen(v);
    if (!v) return;
    setLinhas(null);
    setSemBase(false);
    setEscolhidas(new Set(ativacoes.map((a, i) => (temConteudo(a) ? i : -1)).filter((i) => i >= 0)));
  };

  const alternar = (i: number) =>
    setEscolhidas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(i)) proxima.delete(i);
      else proxima.add(i);
      return proxima;
    });

  const gerar = async () => {
    if (!organizationId) return;
    const indices = [...escolhidas].sort((a, b) => a - b);
    if (indices.length === 0) { toast.error("Escolha ao menos uma ativação."); return; }
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke("estimate-activation-values", {
        body: {
          organization_id: organizationId,
          proposal_id: proposalId ?? null,
          property_id: propertyId ?? null,
          activations: indices.map((i) => ({ title: ativacoes[i].title, description: ativacoes[i].description })),
          items: proposalId ? undefined : itensNaoGravados,
        },
      });
      if (error || data?.error) {
        await avisarErroDeIA(error, data, "Falha ao sugerir os valores");
        return;
      }
      const sugestoes = (Array.isArray(data?.suggestions) ? data.suggestions : []) as SugestaoDeValor[];
      // A função devolve na ordem do que foi enviado: volta para o índice da lista toda.
      setLinhas(indices.map((original, posicao) => {
        const s = sugestoes[posicao];
        const valor = s?.suggested_value ?? null;
        return {
          index: original,
          suggested_value: valor,
          rationale: s?.rationale ?? "",
          overlaps_with: s?.overlaps_with ?? null,
          valor: valor === null ? "" : String(valor),
          usar: valor !== null && !s?.overlaps_with,
        };
      }));
      setSemBase(data?.sem_base === true);
    } finally {
      setCarregando(false);
    }
  };

  const atualizar = (index: number, patch: Partial<Linha>) =>
    setLinhas((atual) => atual?.map((l) => (l.index === index ? { ...l, ...patch } : l)) ?? null);

  const confirmadas = (linhas ?? []).filter((l) => l.usar && Number(l.valor) > 0);

  const aplicar = () => {
    onAplicar(confirmadas.map((l) => ({ index: l.index, value: Number(l.valor), overlaps_with: l.overlaps_with })));
    toast.success(confirmadas.length === 1 ? "Valor aplicado à ativação." : `Valores aplicados a ${confirmadas.length} ativações.`, {
      description: "Revise antes de incluir nos itens.",
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!organizationId || !ativacoes.some(temConteudo)}>
          <Sparkles className="h-3 w-3 mr-1" /> Sugerir valores com IA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sugerir valores das ativações</DialogTitle>
          <DialogDescription>
            Opcional. Você confirma cada valor antes de ele ir para a ativação.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Sugestão a partir da sua base</AlertTitle>
          <AlertDescription>{AVISO_DA_ESTIMATIVA}</AlertDescription>
        </Alert>

        {linhas === null ? (
          <div className="space-y-2">
            <Label className="text-xs">Ativações para estimar</Label>
            <ul className="space-y-1">
              {ativacoes.map((a, i) => temConteudo(a) && (
                <li key={i} className="flex items-start gap-2 rounded-md border p-2">
                  <Checkbox id={`estimar-${i}`} checked={escolhidas.has(i)} onCheckedChange={() => alternar(i)} className="mt-0.5" />
                  <Label htmlFor={`estimar-${i}`} className="font-normal leading-snug cursor-pointer">
                    <span className="font-medium">{a.title || "Ativação sem título"}</span>
                    {a.value ? <span className="text-xs text-muted-foreground"> · valor atual {formatarMoeda(a.value)}</span> : null}
                  </Label>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-2">
            {semBase && (
              <p className="text-sm text-muted-foreground">
                A sua organização ainda não tem propostas enviadas ou aceitas nem ativos com valor para comparar, então não há sugestão.
              </p>
            )}
            <ul className="space-y-2">
              {linhas.map((l) => {
                const a = ativacoes[l.index];
                return (
                  <li key={l.index} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{a?.title || "Ativação sem título"}</span>
                      {l.suggested_value === null
                        ? <Badge variant="outline">Sem referência na sua base</Badge>
                        : <Badge variant="secondary">Sugestão: {formatarMoeda(l.suggested_value)}</Badge>}
                    </div>
                    {/* Sem base, o motivo já está no aviso acima: não repete em cada linha. */}
                    {l.rationale && !semBase && <p className="text-xs text-muted-foreground">{l.rationale}</p>}
                    {l.overlaps_with && (
                      <p className="flex items-center gap-1 text-xs text-warning-strong">
                        <AlertTriangle className="h-3 w-3" /> Pode duplicar o item "{l.overlaps_with}" da proposta.
                      </p>
                    )}
                    {l.suggested_value !== null && (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`usar-${l.index}`}
                            checked={l.usar}
                            onCheckedChange={(v) => atualizar(l.index, { usar: v === true })}
                          />
                          <Label htmlFor={`usar-${l.index}`} className="text-xs font-normal cursor-pointer">Usar este valor</Label>
                        </div>
                        <CurrencyInput
                          aria-label={`Valor para ${a?.title || "a ativação"}`}
                          className="w-44 h-8"
                          value={l.valor}
                          onValueChange={(v) => atualizar(l.index, { valor: v })}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={carregando}>Cancelar</Button>
          {linhas === null ? (
            <Button onClick={gerar} disabled={carregando || escolhidas.size === 0}>
              {carregando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Gerar sugestão
            </Button>
          ) : (
            <Button onClick={aplicar} disabled={confirmadas.length === 0}>
              Aplicar valores selecionados ({confirmadas.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
