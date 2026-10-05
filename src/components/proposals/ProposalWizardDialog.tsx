import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wand2, Loader2, Copy, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

type Sponsor = { id: string; name: string };
type Property = { id: string; name: string };

type WizardOutput = {
  title: string;
  summary_message: string;
  concept: string;
  activations: { title: string; description: string }[];
  items: { name: string; description?: string; quantity: number; unit_value: number }[];
  deck: string;
  whatsapp: string;
  email: { subject: string; body_html: string };
};

type Props = {
  sponsors: Sponsor[];
  properties: Property[];
  onSaved: () => void;
};

const sanitizeEmailHtml = (html: string) => DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "span", "div", "h1", "h2", "h3", "blockquote"],
  ALLOWED_ATTR: ["href", "title", "target", "rel"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
});

export function ProposalWizardDialog({ sponsors, properties, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Inputs
  const [brand, setBrand] = useState("");
  const [objective, setObjective] = useState("branding");
  const [budget, setBudget] = useState("");
  const [sponsorId, setSponsorId] = useState("none");
  const [propertyId, setPropertyId] = useState("none");
  const [extra, setExtra] = useState("");

  // Output
  const [out, setOut] = useState<WizardOutput | null>(null);

  const reset = () => {
    setStep(1); setBrand(""); setObjective("branding"); setBudget(""); setSponsorId("none");
    setPropertyId("none"); setExtra(""); setOut(null);
  };

  const generate = async () => {
    if (!brand.trim()) { toast.error("Informe a marca."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-proposal-wizard", {
        body: {
          brand,
          objective,
          budget: budget ? Number(budget) : undefined,
          sponsor_id: sponsorId === "none" ? null : sponsorId,
          property_id: propertyId === "none" ? null : propertyId,
          extra_context: extra,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setOut(data as WizardOutput);
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!out) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const total = out.items.reduce((s, i) => s + i.quantity * i.unit_value, 0);
      const { data: prop, error: pErr } = await supabase.from("proposals").insert({
        owner_id: user.id,
        title: out.title,
        brand,
        sponsor_id: sponsorId === "none" ? null : sponsorId,
        property_id: propertyId === "none" ? null : propertyId,
        message: out.summary_message,
        total_value: total,
        status: "rascunho" as const,
      }).select("id").single();
      if (pErr) throw pErr;
      const proposalId = prop.id;

      // Items
      if (out.items.length) {
        await supabase.from("proposal_items").insert(out.items.map((it, idx) => ({
          proposal_id: proposalId,
          name: it.name,
          description: it.description ?? null,
          quantity: it.quantity,
          unit_value: it.unit_value,
          position: idx,
        })));
      }

      // Versions
      const versions = [
        { channel: "concept", title: "Conceito Scout", content: out.concept, metadata: { activations: out.activations } },
        { channel: "deck", title: "Estrutura do Deck", content: out.deck, metadata: {} },
        { channel: "whatsapp", title: "WhatsApp", content: out.whatsapp, metadata: {} },
        { channel: "email", title: out.email.subject, content: sanitizeEmailHtml(out.email.body_html), metadata: { subject: out.email.subject } },
      ];
      await supabase.from("proposal_versions").insert(versions.map((v) => ({
        proposal_id: proposalId,
        owner_id: user.id,
        ...v,
        model: "google/gemini-2.5-pro",
      })));

      toast.success("Proposta criada com versões multi-canal!");
      setOpen(false);
      reset();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <Wand2 className="h-4 w-4 mr-1" /> Proposta Inteligente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" /> Proposta Inteligente</DialogTitle>
          <DialogDescription>
            {step === 1 ? "Briefing → IA gera conceito Scout, ativações, deck, WhatsApp e e-mail." : "Revise e salve a proposta com versões multi-canal."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Marca *</Label>
                <Input placeholder="Ex: Pepsi Black" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Objetivo *</Label>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="branding">Branding</SelectItem>
                    <SelectItem value="venda">Venda / Conversão</SelectItem>
                    <SelectItem value="esg">ESG / Propósito</SelectItem>
                    <SelectItem value="lancamento">Lançamento de produto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Budget alvo (R$)</Label>
                <Input type="number" placeholder="Ex: 80000" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Patrocinador</Label>
                <Select value={sponsorId} onValueChange={setSponsorId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {sponsors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Propriedade</Label>
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contexto adicional (opcional)</Label>
              <Textarea rows={3} placeholder="Ângulos, restrições, momentos da marca..." value={extra} onChange={(e) => setExtra(e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && out && (
          <Tabs defaultValue="concept">
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="concept">Conceito</TabsTrigger>
              <TabsTrigger value="items">Entregas</TabsTrigger>
              <TabsTrigger value="deck">Deck</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              <TabsTrigger value="email">E-mail</TabsTrigger>
            </TabsList>

            <TabsContent value="concept" className="space-y-3 pt-3">
              <div>
                <Label className="text-xs">Título</Label>
                <Input value={out.title} onChange={(e) => setOut({ ...out, title: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Conceito Scout</Label>
                <Textarea rows={6} value={out.concept} onChange={(e) => setOut({ ...out, concept: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Ativações ({out.activations.length})</Label>
                <ul className="space-y-2 mt-2">
                  {out.activations.map((a, i) => (
                    <li key={i} className="border border-border rounded-md p-2 text-sm">
                      <div className="font-semibold">{a.title}</div>
                      <div className="text-xs text-muted-foreground">{a.description}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="items" className="space-y-2 pt-3">
              {out.items.map((it, i) => (
                <div key={i} className="border border-border rounded-md p-2 grid grid-cols-12 gap-2 items-center text-sm">
                  <div className="col-span-6 font-medium">{it.name}</div>
                  <div className="col-span-2 text-center">{it.quantity}x</div>
                  <div className="col-span-4 text-right">R$ {Number(it.unit_value).toLocaleString("pt-BR")}</div>
                  {it.description && <div className="col-span-12 text-xs text-muted-foreground">{it.description}</div>}
                </div>
              ))}
              <div className="text-right font-bold pt-2">
                Total: R$ {out.items.reduce((s, i) => s + i.quantity * i.unit_value, 0).toLocaleString("pt-BR")}
              </div>
            </TabsContent>

            <TabsContent value="deck" className="space-y-2 pt-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => copy(out.deck, "Deck")}><Copy className="h-3 w-3 mr-1" /> Copiar</Button>
              </div>
              <Textarea rows={14} value={out.deck} onChange={(e) => setOut({ ...out, deck: e.target.value })} className="font-mono text-xs" />
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-2 pt-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => copy(out.whatsapp, "WhatsApp")}><Copy className="h-3 w-3 mr-1" /> Copiar</Button>
              </div>
              <Textarea rows={6} value={out.whatsapp} onChange={(e) => setOut({ ...out, whatsapp: e.target.value })} />
              <p className="text-xs text-muted-foreground">{out.whatsapp.length} caracteres</p>
            </TabsContent>

            <TabsContent value="email" className="space-y-2 pt-3">
              <div>
                <Label className="text-xs">Assunto</Label>
                <Input value={out.email.subject} onChange={(e) => setOut({ ...out, email: { ...out.email, subject: e.target.value } })} />
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => copy(out.email.body_html, "E-mail")}><Copy className="h-3 w-3 mr-1" /> Copiar HTML</Button>
              </div>
              <div className="border border-border rounded-md p-3 max-h-64 overflow-y-auto bg-background"
                   dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(out.email.body_html) }} />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="gap-2">
          {step === 2 && (
            <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          {step === 1 ? (
            <Button onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
              Gerar com IA <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={save} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Salvar proposta + versões
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
