import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Copy, Loader2, Save, Wand2, Plus } from "lucide-react";
import { toast } from "sonner";

type Channel = "concept" | "deck" | "whatsapp" | "email";

type Version = {
  id?: string;
  channel: Channel;
  title: string | null;
  content: string;
  metadata: any;
};

const CHANNEL_LABEL: Record<Channel, string> = {
  concept: "Conceito",
  deck: "Proposta",
  whatsapp: "WhatsApp",
  email: "E-mail",
};

const EMPTY: Record<Channel, Version> = {
  concept: { channel: "concept", title: "Conceito Scout", content: "", metadata: { activations: [] } },
  deck: { channel: "deck", title: "Estrutura da Proposta", content: "", metadata: {} },
  whatsapp: { channel: "whatsapp", title: "WhatsApp", content: "", metadata: {} },
  email: { channel: "email", title: "", content: "", metadata: { subject: "" } },
};

const sanitizeEmailHtml = (html: string) => DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "span", "div", "h1", "h2", "h3", "blockquote"],
  ALLOWED_ATTR: ["href", "title", "target", "rel"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
});

export function ProposalVersionsEditor({ proposalId }: { proposalId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Channel | null>(null);
  const [versions, setVersions] = useState<Record<Channel, Version>>(EMPTY);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("proposal_versions")
      .select("id,channel,title,content,metadata")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: false });

    const next: Record<Channel, Version> = { ...EMPTY };
    (data ?? []).forEach((row: any) => {
      const ch = row.channel as Channel;
      if (!next[ch]?.id) next[ch] = { ...row, channel: ch, metadata: row.metadata ?? {} };
    });
    setVersions(next);
    setLoading(false);
  };

  useEffect(() => { load(); }, [proposalId]);

  const update = (ch: Channel, patch: Partial<Version>) =>
    setVersions((v) => ({ ...v, [ch]: { ...v[ch], ...patch } }));

  const save = async (ch: Channel) => {
    setSaving(ch);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const v = versions[ch];
      const safeContent = ch === "email" ? sanitizeEmailHtml(v.content) : v.content;
      if (v.id) {
        const { error } = await supabase.from("proposal_versions")
          .update({ title: v.title, content: safeContent, metadata: v.metadata })
          .eq("id", v.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("proposal_versions").insert({
          proposal_id: proposalId,
          owner_id: user.id,
          channel: ch,
          title: v.title,
          content: safeContent,
          metadata: v.metadata,
        }).select("id").single();
        if (error) throw error;
        update(ch, { id: data.id });
      }
      toast.success(`${CHANNEL_LABEL[ch]} salvo!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(null);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const regenerate = async () => {
    toast.info("Use o botão 'Proposta Inteligente' na lista para gerar novamente.");
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando versões…</div>;
  }

  const concept = versions.concept;
  const activations: { title: string; description: string }[] = concept.metadata?.activations ?? [];

  return (
    <Tabs defaultValue="concept" className="mt-2">
      <TabsList className="grid grid-cols-4 w-full">
        <TabsTrigger value="concept">Conceito</TabsTrigger>
        <TabsTrigger value="deck">Proposta</TabsTrigger>
        <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        <TabsTrigger value="email">E-mail</TabsTrigger>
      </TabsList>

      <TabsContent value="concept" className="space-y-3 pt-3">
        <div>
          <Label className="text-xs">Título</Label>
          <Input value={concept.title ?? ""} onChange={(e) => update("concept", { title: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Conceito Scout</Label>
          <Textarea rows={6} value={concept.content} onChange={(e) => update("concept", { content: e.target.value })} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Ativações ({activations.length})</Label>
            <Button size="sm" variant="ghost" onClick={() => update("concept", {
              metadata: { ...concept.metadata, activations: [...activations, { title: "Nova ativação", description: "" }] }
            })}><Plus className="h-3 w-3 mr-1" /> Adicionar</Button>
          </div>
          <ul className="space-y-2 mt-2">
            {activations.map((a, i) => (
              <li key={i} className="border border-border rounded-md p-2 space-y-1">
                <Input value={a.title} onChange={(e) => {
                  const next = [...activations];
                  next[i] = { ...next[i], title: e.target.value };
                  update("concept", { metadata: { ...concept.metadata, activations: next } });
                }} placeholder="Título" />
                <Textarea rows={2} value={a.description} onChange={(e) => {
                  const next = [...activations];
                  next[i] = { ...next[i], description: e.target.value };
                  update("concept", { metadata: { ...concept.metadata, activations: next } });
                }} placeholder="Descrição" />
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                  const next = activations.filter((_, idx) => idx !== i);
                  update("concept", { metadata: { ...concept.metadata, activations: next } });
                }}>Remover</Button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => save("concept")} disabled={saving === "concept"}>
            {saving === "concept" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Salvar
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="deck" className="space-y-2 pt-3">
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => copy(versions.deck.content, "Proposta")}><Copy className="h-3 w-3 mr-1" /> Copiar</Button>
          <Button size="sm" onClick={() => save("deck")} disabled={saving === "deck"}>
            {saving === "deck" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Salvar
          </Button>
        </div>
        <Textarea rows={14} value={versions.deck.content} onChange={(e) => update("deck", { content: e.target.value })} className="font-mono text-xs" placeholder="Estrutura do deck em bullets..." />
      </TabsContent>

      <TabsContent value="whatsapp" className="space-y-2 pt-3">
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => copy(versions.whatsapp.content, "WhatsApp")}><Copy className="h-3 w-3 mr-1" /> Copiar</Button>
          <Button size="sm" onClick={() => save("whatsapp")} disabled={saving === "whatsapp"}>
            {saving === "whatsapp" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Salvar
          </Button>
        </div>
        <Textarea rows={6} value={versions.whatsapp.content} onChange={(e) => update("whatsapp", { content: e.target.value })} placeholder="Mensagem curta para WhatsApp..." />
        <p className="text-xs text-muted-foreground">{versions.whatsapp.content.length} caracteres</p>
      </TabsContent>

      <TabsContent value="email" className="space-y-2 pt-3">
        <div>
          <Label className="text-xs">Assunto</Label>
          <Input
            value={versions.email.metadata?.subject ?? versions.email.title ?? ""}
            onChange={(e) => update("email", { title: e.target.value, metadata: { ...versions.email.metadata, subject: e.target.value } })}
          />
        </div>
        <div>
          <Label className="text-xs">Corpo (HTML)</Label>
          <Textarea rows={10} value={versions.email.content} onChange={(e) => update("email", { content: e.target.value })} className="font-mono text-xs" />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => copy(versions.email.content, "E-mail HTML")}><Copy className="h-3 w-3 mr-1" /> Copiar HTML</Button>
          <Button size="sm" onClick={() => save("email")} disabled={saving === "email"}>
            {saving === "email" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Salvar
          </Button>
        </div>
        {versions.email.content && (
          <div>
            <Label className="text-xs">Pré-visualização</Label>
            <div className="border border-border rounded-md p-3 max-h-64 overflow-y-auto bg-background mt-1"
                 dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(versions.email.content) }} />
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
