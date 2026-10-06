import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImagePlus, Plus, Search, Trash2, Users, WandSparkles } from "lucide-react";
import { LogoFrame, logoFrameIconClass } from "@/components/LogoFrame";
import { toast } from "sonner";
import { validateLogoFile, LOGO_ACCEPT, LOGO_HINT } from "@/lib/logoValidation";

type EventRow = { id: string; name: string };
type SponsorRow = { id: string; name: string; logo_path: string | null; tags: string[]; score: string; segment: string | null };
type ExpectedBrand = {
  id: string;
  event_id: string;
  brand_id: string | null;
  brandtrack_brands?: { logo_path: string | null } | null;
  sponsor_id: string | null;
  display_name: string;
  aliases: string[];
  sponsor_status: string;
  priority: number;
  is_active: boolean;
};

type FormState = {
  sponsorId: string;
  displayName: string;
  aliases: string;
  sponsorStatus: string;
  priority: string;
  isActive: boolean;
};

const db = supabase as any;

const statusLabels: Record<string, string> = {
  patrocinador: "Patrocinador",
  nao_patrocinador: "Não patrocinador",
  concorrente: "Concorrente",
  parceiro: "Parceiro",
  prospect: "Prospect",
};

const emptyForm: FormState = {
  sponsorId: "none",
  displayName: "",
  aliases: "",
  sponsorStatus: "patrocinador",
  priority: "1",
  isActive: true,
};

const normalizeList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const logoUrl = (path: string | null) =>
  path ? supabase.storage.from("sponsor-logos").getPublicUrl(path).data.publicUrl : null;

const LogoPlaceholder = ({ className = "h-4 w-4" }: { className?: string }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/60 text-muted-foreground">
    <ImagePlus className={className} />
    <span className="text-[10px] font-medium">Sem logo</span>
  </div>
);

const BrandTrackExpectedBrands = () => {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [expectedBrands, setExpectedBrands] = useState<ExpectedBrand[]>([]);
  const [eventId, setEventId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpectedBrand | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);

  useEffect(() => {
    void loadBase();
  }, []);

  useEffect(() => {
    if (eventId) void loadExpected(eventId);
  }, [eventId]);

  const loadBase = async () => {
    const [{ data: ev }, { data: sp }] = await Promise.all([
      db.from("brandtrack_events").select("id,name").order("created_at", { ascending: false }),
      supabase.from("sponsors").select("id,name,logo_path,sponsor_crm_profiles(tags,score,segment),sponsor_brandtrack_profiles(detection_aliases)").order("name"),
    ]);
    setEvents(ev ?? []);
    setSponsors(((sp ?? []) as any[]).map((s) => {
      const crm = Array.isArray(s.sponsor_crm_profiles) ? s.sponsor_crm_profiles[0] : s.sponsor_crm_profiles;
      const bt = Array.isArray(s.sponsor_brandtrack_profiles) ? s.sponsor_brandtrack_profiles[0] : s.sponsor_brandtrack_profiles;
      return { id: s.id, name: s.name, logo_path: s.logo_path, tags: bt?.detection_aliases?.length ? bt.detection_aliases : crm?.tags ?? [], score: crm?.score ?? "morno", segment: crm?.segment ?? null };
    }));
    if ((ev ?? []).length > 0) setEventId((ev ?? [])[0].id);
  };

  const loadExpected = async (selectedEventId: string) => {
    const { data, error } = await db
      .from("brandtrack_event_brands")
      .select("*, brandtrack_brands(logo_path)")
      .eq("event_id", selectedEventId)
      .order("priority", { ascending: false })
      .order("display_name");
    if (error) {
      toast.error(error.message);
      return;
    }
    setExpectedBrands(data ?? []);
  };

  const sponsorMap = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return expectedBrands.filter((item) => {
      if (statusFilter !== "all" && item.sponsor_status !== statusFilter) return false;
      if (!term) return true;
      return (
        item.display_name.toLowerCase().includes(term) ||
        item.aliases.some((alias) => alias.toLowerCase().includes(term)) ||
        sponsorMap.get(item.sponsor_id ?? "")?.name.toLowerCase().includes(term)
      );
    });
  }, [expectedBrands, search, sponsorMap, statusFilter]);

  const applySponsor = (sponsorId: string) => {
    const sponsor = sponsorMap.get(sponsorId);
    if (!sponsor) {
      setForm((prev) => ({ ...prev, sponsorId }));
      return;
    }
    const suggestedAliases = [sponsor.segment, ...sponsor.tags].filter(Boolean).join(", ");
    setForm((prev) => ({
      ...prev,
      sponsorId,
      displayName: prev.displayName || sponsor.name,
      aliases: prev.aliases || suggestedAliases,
      sponsorStatus: "patrocinador",
    }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoRemoved(false);
    setOpen(true);
  };

  const openEdit = (item: ExpectedBrand) => {
    setEditing(item);
    setForm({
      sponsorId: item.sponsor_id ?? "none",
      displayName: item.display_name,
      aliases: item.aliases.join(", "),
      sponsorStatus: item.sponsor_status,
      priority: String(item.priority),
      isActive: item.is_active,
    });
    setLogoFile(null);
    setLogoPreview(logoUrl(item.brandtrack_brands?.logo_path ?? null));
    setLogoRemoved(false);
    setOpen(true);
  };

  const uploadExpectedLogo = async (brandId: string, file: File) => {
    if (!user) return null;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${user.id}/brandtrack-expected/${brandId}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("sponsor-logos").upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    return path;
  };

  const ensureBrand = async (name: string, sponsorId: string | null) => {
    const { data: existing } = await db
      .from("brandtrack_brands")
      .select("id")
      .eq("organization_id", orgId)
      .ilike("name", name)
      .maybeSingle();
    if (existing?.id) return existing.id;

    const sponsor = sponsorId ? sponsorMap.get(sponsorId) : null;
    const { data, error } = await db
      .from("brandtrack_brands")
      .insert({
        owner_id: user?.id,
        organization_id: orgId,
        sponsor_id: sponsorId,
        name,
        logo_path: sponsor?.logo_path ?? null,
        color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  };

  const save = async () => {
    if (!user || !eventId || !form.displayName.trim()) return;
    const sponsorId = form.sponsorId !== "none" ? form.sponsorId : null;
    try {
      const brandId = await ensureBrand(form.displayName.trim(), sponsorId);
      if (logoFile) {
        const logoPath = await uploadExpectedLogo(brandId, logoFile);
        const { error: logoUpdateError } = await db.from("brandtrack_brands").update({ logo_path: logoPath }).eq("id", brandId);
        if (logoUpdateError) {
          if (logoPath) await supabase.storage.from("sponsor-logos").remove([logoPath]);
          throw logoUpdateError;
        }
        const oldPath = editing?.brandtrack_brands?.logo_path ?? null;
        if (oldPath?.includes("/brandtrack-expected/") && oldPath !== logoPath) {
          await supabase.storage.from("sponsor-logos").remove([oldPath]);
        }
      } else if (logoRemoved) {
        const oldPath = editing?.brandtrack_brands?.logo_path ?? null;
        const { error: logoRemoveError } = await db.from("brandtrack_brands").update({ logo_path: null }).eq("id", brandId);
        if (logoRemoveError) throw logoRemoveError;
        if (oldPath?.includes("/brandtrack-expected/")) {
          await supabase.storage.from("sponsor-logos").remove([oldPath]);
        }
      }
      const payload = {
        owner_id: user.id,
        organization_id: orgId,
        event_id: eventId,
        brand_id: brandId,
        sponsor_id: sponsorId,
        display_name: form.displayName.trim(),
        aliases: normalizeList(form.aliases),
        sponsor_status: form.sponsorStatus,
        priority: Number(form.priority) || 1,
        is_active: form.isActive,
      };

      const query = editing
        ? db.from("brandtrack_event_brands").update(payload).eq("id", editing.id)
        : db.from("brandtrack_event_brands").insert(payload);
      const { error } = await query;
      if (error) throw error;
      toast.success(editing ? "Marca esperada atualizada" : "Marca esperada cadastrada");
      setOpen(false);
      setLogoFile(null);
      setLogoPreview(null);
      setLogoRemoved(false);
      void loadExpected(eventId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar");
    }
  };

  const importSponsors = async () => {
    if (!user || !eventId) return;
    const existingNames = new Set(expectedBrands.map((b) => b.display_name.toLowerCase()));
    let imported = 0;
    for (const sponsor of sponsors) {
      if (existingNames.has(sponsor.name.toLowerCase())) continue;
      try {
        const brandId = await ensureBrand(sponsor.name, sponsor.id);
        const { error } = await db.from("brandtrack_event_brands").insert({
          owner_id: user.id,
          organization_id: orgId,
          event_id: eventId,
          brand_id: brandId,
          sponsor_id: sponsor.id,
          display_name: sponsor.name,
          aliases: [sponsor.segment, ...sponsor.tags].filter(Boolean),
          sponsor_status: "patrocinador",
          priority: sponsor.score === "quente" ? 3 : sponsor.score === "morno" ? 2 : 1,
          is_active: true,
        });
        if (!error) imported += 1;
      } catch {
        continue;
      }
    }
    toast.success(`${imported} patrocinadores importados`);
    void loadExpected(eventId);
  };

  const remove = async (item: ExpectedBrand) => {
    if (!confirm(`Remover ${item.display_name} deste evento?`)) return;
    const { error } = await db.from("brandtrack_event_brands").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Marca removida");
    void loadExpected(eventId);
  };

  const selectedEvent = events.find((event) => event.id === eventId);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Marcas esperadas</h1>
          <p className="text-muted-foreground">Cadastre patrocinadores, aliases e concorrentes para orientar a IA por evento.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={importSponsors} disabled={!eventId || sponsors.length === 0}>
            <Users className="mr-2 h-4 w-4" /> Importar patrocinadores
          </Button>
          <Button onClick={openCreate} disabled={!eventId}>
            <Plus className="mr-2 h-4 w-4" /> Nova marca
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contexto do evento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2">
            <Label>Evento</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger><SelectValue placeholder="Selecione um evento" /></SelectTrigger>
              <SelectContent>
                {events.map((event) => <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Busca</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Marca, alias ou patrocinador…" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{selectedEvent?.name ?? "Evento"} · {filtered.length} marcas</CardTitle>
          <Badge variant="secondary" className="gap-1"><WandSparkles className="h-3 w-3" /> Contexto IA</Badge>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Crie um evento em Uploads para cadastrar marcas esperadas.</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma marca esperada cadastrada para este filtro.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marca</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <LogoFrame src={item.brandtrack_brands?.logo_path ? logoUrl(item.brandtrack_brands.logo_path) : null} alt={item.display_name} size="sm" fallback={<LogoPlaceholder />} />
                        <div>
                          <button className="text-left font-medium hover:underline" onClick={() => openEdit(item)}>{item.display_name}</button>
                          {item.sponsor_id && <div className="text-xs text-muted-foreground">CRM: {sponsorMap.get(item.sponsor_id)?.name}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{statusLabels[item.sponsor_status]}</Badge></TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {item.aliases.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : item.aliases.map((alias) => <Badge key={alias} variant="secondary" className="text-xs">{alias}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>{item.priority}</TableCell>
                    <TableCell>{item.is_active ? "Sim" : "Não"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Editar marca esperada" : "Nova marca esperada"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Buscar patrocinador do CRM</Label>
              <Select value={form.sponsorId} onValueChange={applySponsor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
                  {sponsors.map((sponsor) => <SelectItem key={sponsor.id} value={sponsor.id}>{sponsor.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.sponsorStatus} onValueChange={(value) => setForm((prev) => ({ ...prev, sponsorStatus: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Nome oficial da marca *</Label>
              <Input value={form.displayName} onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))} placeholder="Ex: Coca-Cola" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Aliases / variações</Label>
              <Input value={form.aliases} onChange={(event) => setForm((prev) => ({ ...prev, aliases: event.target.value }))} placeholder="Ex: Coca Cola, Coke, Coca" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Logo esperado</Label>
              <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                <LogoFrame src={logoPreview} alt="Logo esperado" size="lg" fallback={<LogoPlaceholder className={logoFrameIconClass("lg")} />} />
                <Input
                  className="max-w-sm"
                  type="file"
                  accept={LOGO_ACCEPT}
                  onChange={async (event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file) {
                      const check = await validateLogoFile(file);
                      if (!check.ok) {
                        toast.error(check.error!);
                        event.target.value = "";
                        return;
                      }
                      if (check.warning) toast.warning(check.warning);
                    }
                    setLogoFile(file);
                    setLogoRemoved(false);
                    setLogoPreview(file ? URL.createObjectURL(file) : logoUrl(editing?.brandtrack_brands?.logo_path ?? null));
                  }}
                />
                {logoPreview && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!confirm("Remover o logo esperado desta marca? A exclusão será aplicada ao salvar.")) return;
                      setLogoFile(null);
                      setLogoPreview(null);
                      setLogoRemoved(true);
                    }}
                  >
                    Remover logo
                  </Button>
                )}
                <p className="w-full text-xs text-muted-foreground">{LOGO_HINT}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prioridade IA</Label>
              <Input type="number" min={1} max={5} value={form.priority} onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Ativa no reconhecimento</Label>
              <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!form.displayName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BrandTrackExpectedBrands;
