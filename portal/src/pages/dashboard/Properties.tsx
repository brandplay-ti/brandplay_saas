import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trophy, Calendar, Users, Loader2, Search, Boxes, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  SponsorProfileFields,
  emptySponsorProfile,
  sponsorProfileFromRow,
  sponsorProfileToPayloadBase,
  type SponsorProfileValue,
} from "@/components/sponsors/SponsorProfileFields";

interface AllocatedAsset {
  id: string;
  name: string;
  category: string;
  unit_value: number;
  quantity: number;
  cover_url: string | null;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Property {
  id: string;
  name: string;
  category: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  audience_estimate: number | null;
  description: string | null;
  created_at: string;
}

const CATEGORIES = ["Evento", "Campeonato", "Projeto", "Equipe", "Atleta"];
const STATUSES: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  ativo: { label: "Ativo", variant: "default" },
  planejamento: { label: "Planejamento", variant: "secondary" },
  encerrado: { label: "Encerrado", variant: "outline" },
};

const Properties = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);

  const [form, setForm] = useState({
    name: "",
    category: "Evento",
    status: "planejamento",
    start_date: "",
    end_date: "",
    audience_estimate: "",
    description: "",
  });
  const [profile, setProfile] = useState<SponsorProfileValue>(emptySponsorProfile());

  const [selected, setSelected] = useState<Property | null>(null);
  const [allocatedAssets, setAllocatedAssets] = useState<AllocatedAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sports_properties")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setProperties((data as Property[]) ?? []);
    setLoading(false);
  };

  const openProperty = async (p: Property) => {
    setSelected(p);
    setLoadingAssets(true);
    const { data, error } = await supabase
      .from("asset_allocations")
      .select("asset:assets(id,name,category,unit_value,quantity), photos:assets(asset_photos(storage_path,is_cover,position))")
      .eq("property_id", p.id);

    if (error) {
      toast.error(error.message);
      setAllocatedAssets([]);
      setLoadingAssets(false);
      return;
    }

    const mapped: AllocatedAsset[] = (data ?? []).map((row: any) => {
      const photos = row.photos?.asset_photos ?? [];
      const cover =
        photos.find((ph: any) => ph.is_cover) ??
        [...photos].sort((a: any, b: any) => a.position - b.position)[0];
      const url = cover
        ? supabase.storage.from("asset-photos").getPublicUrl(cover.storage_path).data.publicUrl
        : null;
      return {
        id: row.asset.id,
        name: row.asset.name,
        category: row.asset.category,
        unit_value: Number(row.asset.unit_value),
        quantity: row.asset.quantity,
        cover_url: url,
      };
    });
    setAllocatedAssets(mapped);
    setLoadingAssets(false);
  };

  useEffect(() => {
    load();
  }, []);

  const emptyForm = {
    name: "",
    category: "Evento",
    status: "planejamento",
    start_date: "",
    end_date: "",
    audience_estimate: "",
    description: "",
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setProfile(emptySponsorProfile());
    setOpen(true);
  };

  const openEdit = (p: Property) => {
    setEditing(p);
    setForm({
      name: p.name,
      category: p.category,
      status: p.status,
      start_date: p.start_date ?? "",
      end_date: p.end_date ?? "",
      audience_estimate: p.audience_estimate != null ? String(p.audience_estimate) : "",
      description: p.description ?? "",
    });
    setProfile(sponsorProfileFromRow(p));
    setOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const payload = {
      name: form.name,
      category: form.category,
      status: form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      audience_estimate: form.audience_estimate ? parseInt(form.audience_estimate) : null,
      description: form.description || null,
      ...sponsorProfileToPayloadBase(profile),
    };
    const { error } = editing
      ? await supabase.from("sports_properties").update(payload).eq("id", editing.id)
      : await supabase.from("sports_properties").insert({ owner_id: user.id, ...payload });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Propriedade atualizada!" : "Propriedade criada!");
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    load();
  };

  const filtered = properties.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Propriedades esportivas</h1>
          <p className="text-muted-foreground mt-1">
            Eventos, campeonatos e projetos que você comercializa.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="bg-gradient-brand hover:opacity-90 shadow-glow">
              <Plus className="h-4 w-4 mr-2" /> Nova propriedade
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar propriedade esportiva" : "Nova propriedade esportiva"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Atualize as informações desta propriedade."
                  : "Estruture um evento, campeonato ou projeto patrocinável."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Copa Sul 2025"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planejamento">Planejamento</SelectItem>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="encerrado">Encerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Início</Label>
                  <Input id="start_date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">Fim</Label>
                  <Input id="end_date" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">Público estimado</Label>
                <Input
                  id="audience"
                  type="number"
                  min="0"
                  value={form.audience_estimate}
                  onChange={(e) => setForm({ ...form, audience_estimate: e.target.value })}
                  placeholder="Ex: 25000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Breve descrição da propriedade..."
                />
              </div>

              <div className="pt-2 border-t">
                <SponsorProfileFields showRegistration={false} value={profile} onChange={setProfile} />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={submitting} className="bg-gradient-brand hover:opacity-90">
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editing ? "Salvar alterações" : "Criar propriedade"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar propriedade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Trophy className="h-12 w-12 mx-auto text-primary mb-4" />
            <h3 className="font-semibold text-lg">
              {properties.length === 0 ? "Nenhuma propriedade ainda" : "Nada encontrado"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {properties.length === 0
                ? "Crie sua primeira propriedade esportiva para começar a estruturar suas cotas e ativos."
                : "Tente buscar por outro termo."}
            </p>
            {properties.length === 0 && (
              <Button
                onClick={() => setOpen(true)}
                className="mt-6 bg-gradient-brand hover:opacity-90 shadow-glow"
              >
                <Plus className="h-4 w-4 mr-2" /> Criar primeira propriedade
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const status = STATUSES[p.status] ?? { label: p.status, variant: "outline" as const };
            return (
              <Card
                key={p.id}
                onClick={() => navigate(`/dashboard/propriedades/${p.id}`)}
                className="hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-brand text-primary-foreground flex items-center justify-center">
                      <Trophy className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Editar ${p.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(p);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-lg leading-tight">{p.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{p.category}</p>
                  {p.description && (
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{p.description}</p>
                  )}
                  <div className="mt-4 pt-4 border-t border-border space-y-1.5 text-xs text-muted-foreground">
                    {(p.start_date || p.end_date) && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {p.start_date ?? "?"} → {p.end_date ?? "?"}
                      </div>
                    )}
                    {p.audience_estimate != null && (
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {p.audience_estimate.toLocaleString("pt-BR")} pessoas
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.category}
                  {selected.status && ` · ${STATUSES[selected.status]?.label ?? selected.status}`}
                </SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="overview" className="mt-6">
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="overview">Visão geral</TabsTrigger>
                  <TabsTrigger value="assets">
                    Ativos alocados
                    {allocatedAssets.length > 0 && (
                      <Badge variant="secondary" className="ml-2">{allocatedAssets.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3 pt-4">
                  {selected.description && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Descrição</Label>
                      <p className="text-sm whitespace-pre-wrap">{selected.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">Início</Label>
                      <div>{selected.start_date ?? "—"}</div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Fim</Label>
                      <div>{selected.end_date ?? "—"}</div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Público estimado</Label>
                      <div>
                        {selected.audience_estimate != null
                          ? selected.audience_estimate.toLocaleString("pt-BR")
                          : "—"}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="assets" className="pt-4">
                  {loadingAssets ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </div>
                  ) : allocatedAssets.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-md">
                      <Boxes className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      Nenhum ativo alocado nesta propriedade ainda.
                      <br />
                      Vá em <strong>Ativos</strong> e marque esta propriedade na alocação.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {allocatedAssets.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/40 transition-colors"
                        >
                          <div className="h-12 w-12 rounded-md bg-muted overflow-hidden flex items-center justify-center shrink-0">
                            {a.cover_url ? (
                              <img src={a.cover_url} alt={a.name} className="w-full h-full object-cover" />
                            ) : (
                              <Boxes className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium truncate">{a.name}</p>
                              <Badge variant="outline" className="shrink-0">{a.category}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {fmtBRL(a.unit_value)} · qtd {a.quantity}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t text-sm flex items-center justify-between">
                        <span className="text-muted-foreground">Valor potencial somado</span>
                        <span className="font-medium">
                          {fmtBRL(allocatedAssets.reduce((s, a) => s + a.unit_value * a.quantity, 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Properties;
