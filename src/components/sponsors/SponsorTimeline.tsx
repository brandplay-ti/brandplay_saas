import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Phone, Mail, MessageSquare, StickyNote, Users as UsersIcon,
  FileText, FileSignature, Target, Package, DollarSign, Sparkles,
  Plus, Paperclip, Bell, Trash2, Check,
} from "lucide-react";

type Type =
  | "reuniao" | "ligacao" | "email" | "whatsapp" | "nota"
  | "proposta" | "contrato" | "oportunidade" | "entrega" | "parcela" | "sistema";

interface Interaction {
  id: string;
  sponsor_id: string;
  type: Type;
  source: "manual" | "auto";
  title: string;
  description: string | null;
  occurred_at: string;
  attachment_url: string | null;
  next_action: string | null;
  next_action_at: string | null;
  next_action_done: boolean;
  metadata: any;
}

const TYPE_UI: Record<Type, { label: string; icon: any; cls: string }> = {
  reuniao:     { label: "Reunião",     icon: UsersIcon,     cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  ligacao:     { label: "Ligação",     icon: Phone,         cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  email:       { label: "E-mail",      icon: Mail,          cls: "bg-violet-500/15 text-violet-600 border-violet-500/30" },
  whatsapp:    { label: "WhatsApp",    icon: MessageSquare, cls: "bg-green-500/15 text-green-600 border-green-500/30" },
  nota:        { label: "Nota",        icon: StickyNote,    cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  proposta:    { label: "Proposta",    icon: FileText,      cls: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30" },
  contrato:    { label: "Contrato",    icon: FileSignature, cls: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  oportunidade:{ label: "Oportunidade",icon: Target,        cls: "bg-pink-500/15 text-pink-600 border-pink-500/30" },
  entrega:     { label: "Entrega",     icon: Package,       cls: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  parcela:     { label: "Parcela",     icon: DollarSign,    cls: "bg-teal-500/15 text-teal-600 border-teal-500/30" },
  sistema:     { label: "Sistema",     icon: Sparkles,      cls: "bg-muted text-muted-foreground border-border" },
};

const MANUAL_TYPES: Type[] = ["reuniao", "ligacao", "email", "whatsapp", "nota"];

interface Props { sponsorId: string }

export function SponsorTimeline({ sponsorId }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "manual" | "auto">("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    type: "reuniao" as Type,
    title: "",
    description: "",
    occurred_at: new Date().toISOString().slice(0, 16),
    next_action: "",
    next_action_at: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sponsor_interactions")
      .select("*")
      .eq("sponsor_id", sponsorId)
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) toast.error("Falha ao carregar timeline");
    setItems((data ?? []) as Interaction[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [sponsorId]);

  const reset = () => {
    setForm({
      type: "reuniao", title: "", description: "",
      occurred_at: new Date().toISOString().slice(0, 16),
      next_action: "", next_action_at: "",
    });
    setFile(null);
  };

  const save = async () => {
    if (!user || !form.title.trim()) {
      toast.error("Informe um título");
      return;
    }
    setSaving(true);
    try {
      let attachment_url: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${sponsorId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("sponsor-interactions").upload(path, file);
        if (upErr) throw upErr;
        attachment_url = path;
      }

      const { error } = await supabase.from("sponsor_interactions").insert({
        sponsor_id: sponsorId,
        owner_id: user.id,
        created_by: user.id,
        type: form.type,
        source: "manual",
        title: form.title.trim(),
        description: form.description.trim() || null,
        occurred_at: new Date(form.occurred_at).toISOString(),
        attachment_url,
        next_action: form.next_action.trim() || null,
        next_action_at: form.next_action_at
          ? new Date(form.next_action_at).toISOString() : null,
      });
      if (error) throw error;

      toast.success("Interação registrada");
      setOpen(false);
      reset();
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao registrar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("sponsor_interactions").delete().eq("id", id);
    if (error) toast.error("Falha ao excluir");
    else { toast.success("Removido"); load(); }
  };

  const toggleNextAction = async (it: Interaction) => {
    const { error } = await supabase.from("sponsor_interactions")
      .update({ next_action_done: !it.next_action_done })
      .eq("id", it.id);
    if (!error) load();
  };

  const getAttachUrl = async (path: string) => {
    const { data } = await supabase.storage.from("sponsor-interactions")
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const filtered = items.filter((i) =>
    filter === "all" ? true : i.source === filter,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1">
          {(["all", "manual", "auto"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}>
              {f === "all" ? "Tudo" : f === "manual" ? "Manuais" : "Automáticos"}
            </Button>
          ))}
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Registrar interação</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova interação</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Type })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MANUAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{TYPE_UI[t].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quando</Label>
                  <Input type="datetime-local" value={form.occurred_at}
                    onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Título</Label>
                <Input value={form.title} placeholder="Ex.: Call de alinhamento sobre ativações"
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea rows={3} value={form.description}
                  placeholder="Resumo do que foi conversado, próximos passos…"
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <Label className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> Anexo (opcional)</Label>
                <Input ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="border-t pt-3 space-y-2">
                <Label className="flex items-center gap-1 text-sm font-medium">
                  <Bell className="h-3 w-3" /> Próxima ação (opcional)
                </Label>
                <Input value={form.next_action} placeholder="Ex.: Enviar proposta revisada"
                  onChange={(e) => setForm({ ...form, next_action: e.target.value })} />
                <Input type="datetime-local" value={form.next_action_at}
                  onChange={(e) => setForm({ ...form, next_action_at: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Registrar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma interação registrada ainda.
        </Card>
      ) : (
        <div className="relative pl-6 space-y-3">
          <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
          {filtered.map((it) => {
            const Icon = TYPE_UI[it.type].icon;
            return (
              <div key={it.id} className="relative">
                <div className={`absolute -left-[18px] top-3 h-5 w-5 rounded-full border ${TYPE_UI[it.type].cls} flex items-center justify-center`}>
                  <Icon className="h-3 w-3" />
                </div>
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${TYPE_UI[it.type].cls}`}>
                          {TYPE_UI[it.type].label}
                        </Badge>
                        {it.source === "auto" && (
                          <Badge variant="secondary" className="text-[10px]">auto</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(it.occurred_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="font-medium text-sm mt-1">{it.title}</p>
                      {it.description && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                          {it.description}
                        </p>
                      )}
                      {it.attachment_url && (
                        <Button variant="link" size="sm" className="px-0 h-auto mt-1"
                          onClick={() => getAttachUrl(it.attachment_url!)}>
                          <Paperclip className="h-3 w-3 mr-1" /> Ver anexo
                        </Button>
                      )}
                      {it.next_action && (
                        <div className="mt-2 rounded-md border border-dashed p-2 flex items-start gap-2">
                          <Checkbox checked={it.next_action_done}
                            onCheckedChange={() => toggleNextAction(it)} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${it.next_action_done ? "line-through text-muted-foreground" : ""}`}>
                              {it.next_action}
                            </p>
                            {it.next_action_at && (
                              <p className="text-xs text-muted-foreground">
                                <Bell className="h-3 w-3 inline mr-1" />
                                {new Date(it.next_action_at).toLocaleString("pt-BR")}
                              </p>
                            )}
                          </div>
                          {it.next_action_done && <Check className="h-4 w-4 text-emerald-600" />}
                        </div>
                      )}
                    </div>
                    {it.source === "manual" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => remove(it.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
