import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Sponsor = { id: string; name: string };
type Property = { id: string; name: string };

export type GeneratedProposal = {
  title: string;
  message: string;
  items: { name: string; description?: string; quantity: number; unit_value: number }[];
};

type Props = {
  sponsors: Sponsor[];
  properties: Property[];
  onGenerated: (data: GeneratedProposal & { sponsor_id: string | null; property_id: string | null }) => void;
};

export function GenerateProposalAIDialog({ sponsors, properties, onGenerated }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState("");
  const [objective, setObjective] = useState("");
  const [sponsorId, setSponsorId] = useState<string>("none");
  const [propertyId, setPropertyId] = useState<string>("none");

  const handleGenerate = async () => {
    if (!briefing.trim() && !objective.trim()) {
      toast.error("Preencha o briefing ou o objetivo.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-proposal-ai", {
        body: {
          briefing,
          objective,
          sponsor_id: sponsorId === "none" ? null : sponsorId,
          property_id: propertyId === "none" ? null : propertyId,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      onGenerated({
        ...(data as GeneratedProposal),
        sponsor_id: sponsorId === "none" ? null : sponsorId,
        property_id: propertyId === "none" ? null : propertyId,
      });
      setOpen(false);
      setBriefing("");
      setObjective("");
      toast.success("Proposta gerada! Revise e salve.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar proposta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="h-4 w-4 mr-1" /> Gerar com IA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar proposta com IA</DialogTitle>
          <DialogDescription>
            A IA cria título, mensagem e itens. Você revisa antes de salvar.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="briefing">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="briefing">Briefing livre</TabsTrigger>
            <TabsTrigger value="guided">Guiado</TabsTrigger>
          </TabsList>

          <TabsContent value="briefing" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>Briefing</Label>
              <Textarea
                rows={6}
                placeholder="Ex: Patrocinador do segmento bancário interessado em ativação de marca em jogos do estadual. Orçamento R$ 80k, foco em naming de cota e ativações em jogo..."
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Patrocinador (opcional)</Label>
                <Select value={sponsorId} onValueChange={setSponsorId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {sponsors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Propriedade (opcional)</Label>
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="guided" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Patrocinador</Label>
                <Select value={sponsorId} onValueChange={setSponsorId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {sponsors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Propriedade</Label>
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Objetivo</Label>
              <Input
                placeholder="Ex: ativação de marca + naming da cota Master"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Contexto adicional (opcional)</Label>
              <Textarea
                rows={3}
                placeholder="Detalhes sobre o cliente, restrições, prazo..."
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Gerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
