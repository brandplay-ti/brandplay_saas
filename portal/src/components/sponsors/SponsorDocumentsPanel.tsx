import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FileUp, Download, Trash2, Sparkles, Loader2, FileText } from "lucide-react";

const db = supabase as any;
const BUCKET = "sponsor-documents";
const MAX_SIZE = 20 * 1024 * 1024;

export const DOC_CATEGORIES = [
  { value: "briefing", label: "Briefing / RFP" },
  { value: "apresentacao", label: "Apresentação" },
  { value: "proposta", label: "Proposta" },
  { value: "contrato", label: "Contrato / Jurídico" },
  { value: "midia_kit", label: "Mídia kit" },
  { value: "relatorio", label: "Relatório / Resultados" },
  { value: "ata", label: "Ata de reunião" },
  { value: "financeiro", label: "Financeiro" },
  { value: "outro", label: "Outro" },
];

export const DOC_STAGES = [
  { value: "prospeccao", label: "Prospecção" },
  { value: "negociacao", label: "Negociação" },
  { value: "contrato", label: "Contratação" },
  { value: "ativacao", label: "Ativação / Entregas" },
  { value: "renovacao", label: "Renovação" },
];

const labelOf = (list: { value: string; label: string }[], v?: string | null) =>
  list.find((i) => i.value === v)?.label ?? v ?? "—";

const formatSize = (bytes?: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

interface SponsorDocument {
  id: string;
  title: string;
  category: string;
  description: string | null;
  journey_stage: string | null;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  ai_enabled: boolean;
  created_at: string;
}

interface Props {
  sponsorId: string;
  organizationId: string;
  editable: boolean;
}

export function SponsorDocumentsPanel({ sponsorId, organizationId, editable }: Props) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<SponsorDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("briefing");
  const [stage, setStage] = useState("prospeccao");
  const [description, setDescription] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db
      .from("sponsor_documents")
      .select("*")
      .eq("sponsor_id", sponsorId)
      .order("created_at", { ascending: false });
    setDocs((data ?? []) as SponsorDocument[]);
    setLoading(false);
  }, [sponsorId]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setFile(null); setTitle(""); setCategory("briefing");
    setStage("prospeccao"); setDescription(""); setAiEnabled(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Selecione um arquivo", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: "Arquivo muito grande", description: "Limite de 20 MB por arquivo.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${organizationId}/${sponsorId}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type || undefined,
    });
    if (upErr) {
      setSaving(false);
      toast({ title: "Falha no upload", description: upErr.message, variant: "destructive" });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from("sponsor_documents").insert({
      organization_id: organizationId,
      sponsor_id: sponsorId,
      title: title.trim() || file.name,
      category,
      journey_stage: stage,
      description: description.trim() || null,
      file_path: path,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
      ai_enabled: aiEnabled,
      uploaded_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Arquivo enviado" });
    setOpen(false);
    resetForm();
    load();
  };

  const handleDownload = async (doc: SponsorDocument) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast({ title: "Não foi possível abrir o arquivo", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (doc: SponsorDocument) => {
    if (!confirm(`Excluir "${doc.title}"?`)) return;
    const { error } = await db.from("sponsor_documents").delete().eq("id", doc.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.storage.from(BUCKET).remove([doc.file_path]);
    toast({ title: "Arquivo excluído" });
    load();
  };

  const toggleAi = async (doc: SponsorDocument, value: boolean) => {
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, ai_enabled: value } : d)));
    const { error } = await db.from("sponsor_documents").update({ ai_enabled: value }).eq("id", doc.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      load();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Documentos da conta
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Envie briefings, apresentações, atas e relatórios. Os arquivos marcados com IA
            entram no contexto das análises e da preparação de reuniões.
          </p>
        </div>
        {editable && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <FileUp className="h-4 w-4 mr-2" /> Enviar arquivo
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum arquivo enviado para esta conta.</p>
        ) : (
          docs.map((doc) => (
            <div key={doc.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-[200px] flex-1">
                <p className="font-medium text-sm">{doc.title}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.file_name} · {formatSize(doc.file_size)} ·{" "}
                  {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                </p>
                {doc.description && (
                  <p className="text-xs text-muted-foreground mt-1">{doc.description}</p>
                )}
              </div>
              <Badge variant="secondary">{labelOf(DOC_CATEGORIES, doc.category)}</Badge>
              <Badge variant="outline">{labelOf(DOC_STAGES, doc.journey_stage)}</Badge>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                <Switch
                  checked={doc.ai_enabled}
                  disabled={!editable}
                  onCheckedChange={(v) => toggleAi(doc, v)}
                  aria-label="Usar na IA"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => handleDownload(doc)}>
                <Download className="h-4 w-4" />
              </Button>
              {editable && (
                <Button variant="ghost" size="sm" onClick={() => handleDelete(doc)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar arquivo</DialogTitle>
            <DialogDescription>
              PDF, Word, Excel, PowerPoint ou imagem — até 20 MB.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Arquivo</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Briefing de patrocínio 2027" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Etapa da jornada</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Resumo para a IA (opcional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pontos-chave do documento que a IA deve considerar."
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Usar nas análises de IA</p>
                <p className="text-xs text-muted-foreground">Inclui título, categoria e resumo no contexto.</p>
              </div>
              <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
