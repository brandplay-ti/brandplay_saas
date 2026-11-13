import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/CurrencyInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wand2, Loader2, Copy, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { avisarErroDeIA } from "@/lib/erroDeIA";
import { formatarNumero } from "@/lib/mascaras";

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

/**
 * Proposta que já existe (ex.: criada a partir do pipeline). Com ela, o
 * assistente não cria outra proposta: gera só as versões (conceito, deck,
 * WhatsApp, e-mail) para ela. Marca, patrocinador, projeto e valor vêm da
 * proposta; os itens dela (ex.: copiados da cota) não são tocados.
 */
export type PropostaExistente = {
  id: string;
  organization_id: string;
  brand: string | null;
  sponsor_id: string | null;
  property_id: string | null;
  total_value: number | null;
  message: string | null;
};

type Props = {
  sponsors?: Sponsor[];
  properties?: Property[];
  proposta?: PropostaExistente;
  onSaved: () => void;
};

const sanitizeEmailHtml = (html: string) => DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "span", "div", "h1", "h2", "h3", "blockquote"],
  ALLOWED_ATTR: ["href", "title", "target", "rel"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
});

export function ProposalWizardDialog({ sponsors = [], properties = [], proposta, onSaved }: Props) {
  const { orgId: orgAtiva } = useOrganization();
  const orgId = proposta?.organization_id ?? orgAtiva;
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
    setStep(1); setObjective("branding"); setExtra(""); setOut(null);
    setBrand(proposta?.brand ?? "");
    setBudget(proposta && Number(proposta.total_value) > 0 ? String(proposta.total_value) : "");
    setSponsorId(proposta?.sponsor_id ?? "none");
    setPropertyId(proposta?.property_id ?? "none");
  };

  // Ao abrir sobre uma proposta existente, parte dos dados dela e lista as
  // entregas que ela já tem (ex.: as da cota) como contexto para a IA.
  useEffect(() => {
    if (!open || !proposta) return;
    reset();
    let cancelado = false;
    supabase
      .from("proposal_items")
      .select("name,quantity")
      .eq("proposal_id", proposta.id)
      .order("position")
      .then(({ data }) => {
        if (cancelado || !data?.length) return;
        setExtra(`Entregas já incluídas na proposta: ${data.map((i) => `${i.quantity}x ${i.name}`).join("; ")}.`);
      });
    return () => { cancelado = true; };
    // Só ao abrir (ou trocar de proposta): o objeto `proposta` é recriado a cada
    // edição na tela e não pode apagar o briefing que está sendo preenchido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proposta?.id]);

  const generate = async () => {
    if (!orgId) return;
    if (!brand.trim()) { toast.error("Informe a marca."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-proposal-wizard", {
        body: {
          organization_id: orgId,
          brand,
          objective,
          budget: budget ? Number(budget) : undefined,
          sponsor_id: sponsorId === "none" ? null : sponsorId,
          property_id: propertyId === "none" ? null : propertyId,
          extra_context: extra,
        },
      });
      if (error || data?.error) {
        await avisarErroDeIA(error, data, "Falha ao gerar a proposta");
        return;
      }
      setOut(data as WizardOutput);
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  // O editor de versões mostra a mais recente de cada canal: as novas passam a
  // ser as exibidas, e as anteriores continuam gravadas.
  const salvarVersoes = async (proposalId: string, userId: string) => {
    if (!out || !orgId) return;
    const versions = [
      { channel: "concept", title: "Conceito Scout", content: out.concept, metadata: { activations: out.activations } },
      { channel: "deck", title: "Estrutura do Deck", content: out.deck, metadata: {} },
      { channel: "whatsapp", title: "WhatsApp", content: out.whatsapp, metadata: {} },
      { channel: "email", title: out.email.subject, content: sanitizeEmailHtml(out.email.body_html), metadata: { subject: out.email.subject } },
    ];
    const { error } = await supabase.from("proposal_versions").insert(versions.map((v) => ({
      proposal_id: proposalId,
      owner_id: userId,
      organization_id: orgId,
      ...v,
      model: "google/gemini-2.5-pro",
    })));
    if (error) throw error;
  };

  const save = async () => {
    if (!out || !orgId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      if (proposta) {
        await salvarVersoes(proposta.id, user.id);
        // A mensagem comercial só é preenchida se a proposta ainda não tiver uma.
        if (!proposta.message?.trim() && out.summary_message.trim()) {
          const { error } = await supabase.from("proposals")
            .update({ message: out.summary_message })
            .eq("id", proposta.id)
            .eq("organization_id", proposta.organization_id);
          if (error) throw error;
        }
        toast.success("Versões multi-canal geradas!");
        setOpen(false);
        onSaved();
        return;
      }

      const total = out.items.reduce((s, i) => s + i.quantity * i.unit_value, 0);
      const { data: prop, error: pErr } = await supabase.from("proposals").insert({
        owner_id: user.id,
        organization_id: orgId,
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

      // A proposta já existe: uma falha aqui não pode levar a salvar de novo e duplicá-la.
      const versoesSalvas = await salvarVersoes(proposalId, user.id).then(() => true, () => false);
      if (versoesSalvas) toast.success("Proposta criada com versões multi-canal!");
      else toast.error("Proposta criada, mas as versões multi-canal não foram salvas");
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
            {proposta
              ? (step === 1
                ? "A IA gera conceito Scout, ativações, deck, WhatsApp e e-mail para esta proposta, a partir dos dados dela."
                : "Revise e salve. As versões geradas substituem as exibidas na aba Versões IA; os itens da proposta não mudam.")
              : (step === 1 ? "Briefing → IA gera conceito Scout, ativações, deck, WhatsApp e e-mail." : "Revise e salve a proposta com versões multi-canal.")}
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
                <CurrencyInput placeholder="Ex: R$ 80.000,00" value={budget} onValueChange={setBudget} />
              </div>
              {!proposta && <>
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
                <Label>Projeto</Label>
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              </>}
            </div>
            {proposta && (
              <p className="text-xs text-muted-foreground">Patrocinador e projeto vêm da proposta.</p>
            )}
            <div className="space-y-2">
              <Label>Contexto adicional (opcional)</Label>
              <Textarea rows={3} placeholder="Ângulos, restrições, momentos da marca..." value={extra} onChange={(e) => setExtra(e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && out && (
          <Tabs defaultValue="concept">
            <TabsList className={proposta ? "grid grid-cols-4" : "grid grid-cols-5"}>
              <TabsTrigger value="concept">Conceito</TabsTrigger>
              {!proposta && <TabsTrigger value="items">Entregas</TabsTrigger>}
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
                  <div className="col-span-2 text-center">{formatarNumero(it.quantity)}x</div>
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
            <Button onClick={generate} disabled={loading || !orgId}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
              Gerar com IA <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={save} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {proposta ? "Salvar versões" : "Salvar proposta + versões"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
