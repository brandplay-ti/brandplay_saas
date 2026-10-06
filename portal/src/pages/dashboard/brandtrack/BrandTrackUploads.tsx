import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Image as ImageIcon, Video, Loader2, CheckCircle2, AlertCircle, Clock, Trash2, BarChart3, Instagram, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import FieldEvidenceImportDialog from "@/components/brandtrack/FieldEvidenceImportDialog";

type Media = {
  id: string;
  title: string;
  media_type: string;
  storage_path: string | null;
  external_url?: string | null;
  source_platform?: string | null;
  status: string;
  progress: number;
  error_message: string | null;
  event_id: string | null;
  created_at: string;
  detections?: MediaDetection[];
};

type MediaDetection = {
  id: string;
  brand_name: string;
  corrected_brand_name: string | null;
  bes_score: number;
  confidence: number;
  screen_percentage: number;
  exposure_type: string;
  start_time: number;
  evidence_path: string | null;
  review_status: string;
};

type EventRow = { id: string; name: string; property_id?: string | null };
const FILTERS_KEY = "brandtrack-uploads-filters";

type ExpectedBrand = { id: string; display_name: string; aliases: string[]; sponsor_status: string; priority: number; is_active: boolean };
const db = supabase as any;

const exposureLabels: Record<string, string> = {
  placa: "Placa / placar",
  uniforme: "Uniforme",
  led: "LED / mídia digital",
  transmissao: "Transmissão",
  backdrop: "Backdrop",
  outro: "Outro",
};

const BrandTrackUploads = () => {
  const { user } = useAuth();
  const [medias, setMedias] = useState<Media[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [properties, setProperties] = useState<EventRow[]>([]);
  const [expectedBrands, setExpectedBrands] = useState<ExpectedBrand[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string>("");
  const [resolvingProperty, setResolvingProperty] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [addingInstagram, setAddingInstagram] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({});
  const [importedFieldIds, setImportedFieldIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("brandtrack-imported-field-ids") || "[]") as string[]; } catch { return []; }
  });
  const [topBrandSearch, setTopBrandSearch] = useState<Record<string, string>>({});
  const [exposureFilter, setExposureFilter] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEvent, setBulkEvent] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Filtros da lista ----
  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (raw) {
        const f = JSON.parse(raw);
        setSearch(f.search ?? "");
        setFilterProperty(f.filterProperty ?? "all");
        setFilterStatus(f.filterStatus ?? "all");
        setFilterPeriod(f.filterPeriod ?? "all");
      }
    } catch { /* ignore */ }
    setFiltersLoaded(true);
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ search, filterProperty, filterStatus, filterPeriod })
    );
  }, [filtersLoaded, search, filterProperty, filterStatus, filterPeriod]);

  useEffect(() => {
    localStorage.setItem("brandtrack-imported-field-ids", JSON.stringify(importedFieldIds));
  }, [importedFieldIds]);


  useEffect(() => {
    void load();
    const ch = supabase
      .channel("bt-media")
      .on("postgres_changes", { event: "*", schema: "public", table: "brandtrack_media" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "brandtrack_detections" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const load = async () => {
    const [{ data: m }, { data: ev }, { data: props }] = await Promise.all([
      db.from("brandtrack_media").select("*, detections:brandtrack_detections(id,brand_name,corrected_brand_name,bes_score,confidence,screen_percentage,exposure_type,start_time,evidence_path,review_status)").order("created_at", { ascending: false }),
      supabase.from("brandtrack_events").select("id,name,property_id").order("created_at", { ascending: false }),
      supabase.from("sports_properties").select("id,name").order("name", { ascending: true }),
    ]);
    setMedias(m ?? []);
    setEvents((ev ?? []) as any);
    setProperties((props ?? []) as any);
  };

  useEffect(() => {
    if (!eventId) {
      setExpectedBrands([]);
      return;
    }
    db.from("brandtrack_event_brands")
      .select("id,display_name,aliases,sponsor_status,priority,is_active")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .then(({ data }: { data: ExpectedBrand[] | null }) => setExpectedBrands(data ?? []));
  }, [eventId]);

  /** Finds (or creates) the BrandTrack workspace linked to a registered property. */
  const resolveEventForProperty = async (propId: string): Promise<string | null> => {
    if (!user) return null;
    const { data: existing } = await db
      .from("brandtrack_events")
      .select("id")
      .eq("property_id", propId)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const property = properties.find((p) => p.id === propId);
    const { data, error } = await db
      .from("brandtrack_events")
      .insert({ name: property?.name ?? "Propriedade", owner_id: user.id, property_id: propId })
      .select("id,name,property_id")
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
    setEvents((p) => [data as any, ...p]);
    return data.id as string;
  };

  const selectProperty = async (propId: string) => {
    setPropertyId(propId);
    setResolvingProperty(true);
    const resolved = await resolveEventForProperty(propId);
    setResolvingProperty(false);
    setEventId(resolved ?? "");
  };


  const analyzeImage = async (mediaId: string) => {
    const { error } = await supabase.functions.invoke("brandtrack-detect-image", { body: { media_id: mediaId } });
    if (error) toast.error(`Análise falhou: ${error.message}`);
  };

  const analyzeVideo = async (mediaId: string, file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Não foi possível ler o vídeo"));
      });

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const totalFrames = Math.max(1, Math.min(8, Math.ceil(duration / 10)));
      const timestamps = Array.from({ length: totalFrames }, (_, index) => {
        if (totalFrames === 1) return Math.min(duration * 0.5, 1);
        return Math.min(duration - 0.2, (duration / (totalFrames + 1)) * (index + 1));
      }).map((t) => Math.max(0, t));

      const canvas = document.createElement("canvas");
      const maxWidth = 1280;
      const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível para extrair frames");

      for (let index = 0; index < timestamps.length; index++) {
        const timestamp = timestamps[index];
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = timestamp;
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameDataUrl = canvas.toDataURL("image/jpeg", 0.78);
        const { error } = await supabase.functions.invoke("brandtrack-detect-image", {
          body: {
            media_id: mediaId,
            frame_data_url: frameDataUrl,
            timestamp,
            frame_index: index,
            total_frames: timestamps.length,
            finalize: index === timestamps.length - 1,
          },
        });
        if (error) throw new Error(error.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Análise de vídeo falhou");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    if (!eventId) {
      toast.error("Escolha uma propriedade antes de subir arquivos.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setUploading(true);
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) {
        toast.error(`${file.name}: tipo não suportado`);
        continue;
      }
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("brandtrack-media")
        .upload(path, file, { contentType: file.type });
      if (upErr) {
        toast.error(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { data: media, error: insErr } = await supabase
        .from("brandtrack_media")
        .insert({
          owner_id: user.id,
          event_id: eventId,
          title: file.name,
          media_type: isImage ? "image" : "video",
          storage_path: path,
          file_size: file.size,
          status: "queued",
          progress: 0,
        })
        .select()
        .single();
      if (insErr) {
        toast.error(insErr.message);
        continue;
      }
      if (isImage) void analyzeImage(media.id);
      if (isVideo) void analyzeVideo(media.id, file);
    }
    setUploading(false);
    void load();
  };

  const addInstagramLink = async () => {
    const normalizedUrl = instagramUrl.trim();
    if (!user) return;
    if (!eventId) {
      toast.error("Escolha uma propriedade antes de adicionar links.");
      return;
    }
    if (!isInstagramPostUrl(normalizedUrl)) {
      toast.error("Informe um link válido do Instagram Reels ou Feed.");
      return;
    }
    setAddingInstagram(true);
    const { error } = await supabase.from("brandtrack_media").insert({
      owner_id: user.id,
      event_id: eventId,
      title: getInstagramTitle(normalizedUrl),
      media_type: "instagram" as any,
      storage_path: null as any,
      external_url: normalizedUrl,
      source_platform: "instagram",
      status: "queued",
      progress: 0,
    } as any);
    setAddingInstagram(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInstagramUrl("");
    toast.success("Link do Instagram adicionado");
    void load();
  };

  const removeMedia = async (id: string, path: string | null) => {
    if (!confirm("Remover este arquivo e suas detecções?")) return;
    if (path) await supabase.storage.from("brandtrack-media").remove([path]);
    await supabase.from("brandtrack_media").delete().eq("id", id);
    toast.success("Removido");
    void load();
  };

  const toggleSelected = (id: string) =>
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const eventPropertyMap = new Map(events.map((e) => [e.id, e.property_id ?? null]));
  const propertyNameMap = new Map(properties.map((p) => [p.id, p.name]));
  const periodDays: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const term = search.trim().toLowerCase();

  const visibleMedias = medias.filter((m) => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterProperty !== "all") {
      const propId = m.event_id ? eventPropertyMap.get(m.event_id) ?? null : null;
      if (propId !== filterProperty) return false;
    }
    const days = periodDays[filterPeriod];
    if (days) {
      const limit = Date.now() - days * 24 * 60 * 60 * 1000;
      if (new Date(m.created_at).getTime() < limit) return false;
    }
    if (term) {
      const propName = m.event_id ? propertyNameMap.get(eventPropertyMap.get(m.event_id) ?? "") : undefined;
      const brands = (m.detections ?? []).map((d) => d.corrected_brand_name || d.brand_name).join(" ");
      const haystack = [m.title, propName, m.source_platform, m.media_type, brands].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const filtersActive = Boolean(term) || filterProperty !== "all" || filterStatus !== "all" || filterPeriod !== "all";
  const clearFilters = () => { setSearch(""); setFilterProperty("all"); setFilterStatus("all"); setFilterPeriod("all"); };

  const allSelected = visibleMedias.length > 0 && visibleMedias.every((m) => selectedIds.includes(m.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : visibleMedias.map((m) => m.id));


  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Remover ${selectedIds.length} mídia(s) e suas detecções?`)) return;
    setBulkBusy(true);
    const paths = medias.filter((m) => selectedIds.includes(m.id) && m.storage_path).map((m) => m.storage_path as string);
    if (paths.length > 0) await supabase.storage.from("brandtrack-media").remove(paths);
    const { error } = await supabase.from("brandtrack_media").delete().in("id", selectedIds);
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${selectedIds.length} mídia(s) removida(s)`);
    setSelectedIds([]);
    void load();
  };

  const bulkMoveEvent = async (targetProperty: string) => {
    if (selectedIds.length === 0 || !targetProperty) return;
    setBulkBusy(true);
    const targetEvent = await resolveEventForProperty(targetProperty);
    if (!targetEvent) {
      setBulkBusy(false);
      return;
    }
    const { error } = await supabase.from("brandtrack_media").update({ event_id: targetEvent }).in("id", selectedIds);

    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Propriedade atualizada nas mídias selecionadas");
    setBulkEvent("");
    setSelectedIds([]);
    void load();
  };

  const bulkReanalyze = async () => {
    const targets = medias.filter((m) => selectedIds.includes(m.id) && m.media_type === "image");
    if (targets.length === 0) {
      toast.error("Selecione imagens para reanalisar.");
      return;
    }
    setBulkBusy(true);
    await supabase.from("brandtrack_media").update({ status: "queued", progress: 0, error_message: null }).in("id", targets.map((t) => t.id));
    for (const t of targets) await analyzeImage(t.id);
    setBulkBusy(false);
    toast.success(`${targets.length} imagem(ns) enviada(s) para nova análise`);
    void load();
  };

  const saveTitle = async (id: string) => {
    const title = editingTitle.trim();
    if (!title) {
      toast.error("Informe um título.");
      return;
    }
    const { error } = await supabase.from("brandtrack_media").update({ title }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditingId(null);
    setEditingTitle("");
    toast.success("Título atualizado");
    void load();
  };



  const toggleAnalysis = async (media: Media) => {
    const next = expandedAnalysisId === media.id ? null : media.id;
    setExpandedAnalysisId(next);
    if (!next) return;
    const missing = (media.detections ?? []).filter((d) => d.evidence_path && !evidenceUrls[d.id]);
    if (missing.length === 0) return;
    const entries = await Promise.all(
      missing.map(async (d) => {
        const { data } = await supabase.storage.from("brandtrack-media").createSignedUrl(d.evidence_path!, 3600);
        return [d.id, data?.signedUrl ?? ""] as const;
      })
    );
    setEvidenceUrls((current) => ({ ...current, ...Object.fromEntries(entries.filter(([, url]) => Boolean(url))) }));
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Uploads & Processamento</h1>
        <p className="text-muted-foreground">Envie imagens ou vídeos para análise automática de marcas.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Propriedade</Label>
              <Select value={propertyId} onValueChange={(v) => void selectProperty(v)}>
                <SelectTrigger className="md:w-96"><SelectValue placeholder="Selecionar propriedade" /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {properties.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma propriedade cadastrada. Cadastre no módulo Propriedades.</p>
              )}
              {resolvingProperty && (
                <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Preparando propriedade…</p>
              )}
            </div>
          </div>

          {expectedBrands.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 text-sm font-medium">Contexto IA da propriedade</div>
              <div className="flex flex-wrap gap-2">
                {expectedBrands.slice(0, 12).map((brand) => (
                  <Badge key={brand.id} variant="secondary" className="gap-1">
                    {brand.display_name}
                    <span className="text-muted-foreground">P{brand.priority}</span>
                  </Badge>
                ))}
                {expectedBrands.length > 12 && <Badge variant="outline">+{expectedBrands.length - 12}</Badge>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Essas marcas e aliases serão usados para reduzir variações e duplicidades na detecção.</p>
            </div>
          )}

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFiles(e.dataTransfer.files);
            }}
            onClick={() => {
              if (!eventId) {
                toast.error("Escolha uma propriedade antes de selecionar arquivos.");
                return;
              }
              inputRef.current?.click();
            }}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            }`}
          >
            <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <p className="font-medium">Arraste arquivos aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-1">Imagens (JPG, PNG) — vídeos (MP4, MOV) com análise por frames-chave e timestamps.</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>
          {uploading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Enviando…</p>}

          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <div className="mr-auto">
              <p className="text-sm font-medium">Evidências do app de campo</p>
              <p className="text-xs text-muted-foreground">Importe fotos e vídeos já registrados nos ativos das entregas.</p>
            </div>
            <FieldEvidenceImportDialog
              eventId={eventId}
              excludedIds={importedFieldIds}
              onImported={(mediaId, file, isImage, attachmentId) => {
                if (attachmentId) setImportedFieldIds((cur) => (cur.includes(attachmentId) ? cur : [...cur, attachmentId]));
                if (isImage) void analyzeImage(mediaId);
                else void analyzeVideo(mediaId, file);
              }}
              onFinished={() => void load()}
            />
          </div>



          <div className="space-y-2 rounded-lg border p-3">
            <Label>Link do Instagram</Label>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Input
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                placeholder="Cole um link de Reels ou Feed"
                inputMode="url"
              />
              <Button type="button" onClick={() => void addInstagramLink()} disabled={addingInstagram} className="gap-2">
                {addingInstagram ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
                Adicionar link
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Mídias ({visibleMedias.length}
            {visibleMedias.length !== medias.length ? ` de ${medias.length}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {medias.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum upload ainda.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-[1fr_repeat(3,minmax(0,180px))_auto]">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por título, propriedade ou marca detectada"
                />
                <Select value={filterProperty} onValueChange={setFilterProperty}>
                  <SelectTrigger><SelectValue placeholder="Propriedade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as propriedades</SelectItem>
                    {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                  <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo o período</SelectItem>
                    <SelectItem value="7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="queued">Na fila</SelectItem>
                    <SelectItem value="processing">Processando</SelectItem>
                    <SelectItem value="completed">Finalizado</SelectItem>
                    <SelectItem value="failed">Falhou</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" onClick={clearFilters} disabled={!filtersActive}>Limpar filtros</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={allSelected} onCheckedChange={() => toggleSelectAll()} />
                  Selecionar tudo
                </label>
                <span className="text-sm text-muted-foreground">{selectedIds.length} selecionada(s)</span>
                {selectedIds.length > 0 && (
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Select value={bulkEvent} onValueChange={(v) => { setBulkEvent(v); void bulkMoveEvent(v); }}>
                      <SelectTrigger className="w-56"><SelectValue placeholder="Mover para propriedade" /></SelectTrigger>
                      <SelectContent>
                        {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => void bulkReanalyze()} className="gap-2">
                      <BarChart3 className="h-4 w-4" /> Reanalisar
                    </Button>
                    <Button variant="destructive" size="sm" disabled={bulkBusy} onClick={() => void bulkDelete()} className="gap-2">
                      {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Limpar</Button>
                  </div>
                )}
              </div>
              {visibleMedias.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma mídia encontrada com esses filtros.</p>
              )}
              {visibleMedias.map((m) => {

                const selectedExposure = exposureFilter[m.id] ?? "all";
                const visibleDetections = (m.detections ?? []).filter((d) => selectedExposure === "all" || d.exposure_type === selectedExposure);
                const analysis = getBesAnalysis(visibleDetections);
                const topBrandTerm = (topBrandSearch[m.id] ?? "").toLowerCase();
                const filteredTopBrands = (analysis.topBrands ?? []).filter((brand) => brand.name.toLowerCase().includes(topBrandTerm));
                return (
                  <div key={m.id} className={`space-y-3 rounded-lg border p-3 ${selectedIds.includes(m.id) ? "border-primary bg-primary/5" : ""}`}>
                    <div className="flex items-center gap-3">
                      <Checkbox checked={selectedIds.includes(m.id)} onCheckedChange={() => toggleSelected(m.id)} />
                      {m.media_type === "instagram" ? <Instagram className="h-5 w-5 text-muted-foreground" /> : m.media_type === "image" ? <ImageIcon className="h-5 w-5 text-muted-foreground" /> : <Video className="h-5 w-5 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        {editingId === m.id ? (
                          <div className="flex items-center gap-2">
                            <Input value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} className="h-8" />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void saveTitle(m.id)}><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="truncate font-medium">{m.title}</div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              onClick={() => { setEditingId(m.id); setEditingTitle(m.title); }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {m.media_type === "instagram" && m.external_url ? "Instagram · " : ""}{new Date(m.created_at).toLocaleString("pt-BR")}
                        </div>
                        {m.media_type === "instagram" && m.external_url && (
                          <a href={m.external_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-primary hover:underline">
                            {m.external_url}
                          </a>
                        )}
                        {(m.status === "processing" || m.status === "queued") && (
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={m.progress} className="h-1" />
                            <span className="text-xs text-muted-foreground tabular-nums">{Math.round(m.progress)}%</span>
                          </div>
                        )}
                        {m.error_message && <div className="mt-1 text-xs text-destructive">{m.error_message}</div>}
                      </div>
                      <StatusBadge status={m.status} />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => void toggleAnalysis(m)}
                      >
                        <BarChart3 className="h-4 w-4" />
                        Análise
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void removeMedia(m.id, m.storage_path)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {expandedAnalysisId === m.id && (
                      <div className="space-y-3 border-t pt-3">
                        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                          <Select
                            value={exposureFilter[m.id] ?? "all"}
                            onValueChange={(value) => setExposureFilter((current) => ({ ...current, [m.id]: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Tipo de exposição" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos os tipos</SelectItem>
                              {getExposureTypes(m.detections ?? []).map((type) => (
                                <SelectItem key={type} value={type}>{exposureLabels[type] ?? type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setExposureFilter((current) => ({ ...current, [m.id]: "all" }))}
                            disabled={(exposureFilter[m.id] ?? "all") === "all"}
                          >
                            Limpar filtro
                          </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-4">
                          <Metric label="BES total" value={analysis.totalBes} />
                          <Metric label="Marcas" value={analysis.brandCount} />
                          <Metric label="Detecções" value={analysis.detectionCount} />
                          <Metric label="Confiança média" value={`${analysis.avgConfidence}%`} />
                        </div>
                        {(analysis.topBrands ?? []).length > 0 && (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input
                                value={topBrandSearch[m.id] ?? ""}
                                onChange={(event) => setTopBrandSearch((current) => ({ ...current, [m.id]: event.target.value }))}
                                placeholder="Buscar marca nas Top Brands…"
                                className="h-8"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setTopBrandSearch((current) => ({ ...current, [m.id]: "" }))}
                                disabled={!topBrandSearch[m.id]}
                              >
                                Limpar
                              </Button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <BarChart3 className="h-3.5 w-3.5" />
                              {filteredTopBrands.length === 0 ? (
                                <span>Nenhuma marca encontrada.</span>
                              ) : filteredTopBrands.map((brand) => (
                                <Badge key={brand.name} variant="secondary">{brand.name} · BES {brand.bes}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {(analysis.brandDetails ?? []).length > 0 && (
                          <div className="space-y-2">
                            {(analysis.brandDetails ?? []).map((brand) => (
                              <div key={brand.name} className="rounded-md border p-3">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-medium">{brand.name}</div>
                                  <Badge variant="outline">BES {brand.bes} · {brand.count} aparições</Badge>
                                </div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  {brand.detections.slice(0, 4).map((d) => (
                                    <div key={d.id} className="flex gap-3 rounded-md bg-muted/40 p-2 text-sm">
                                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded bg-muted">
                                        {evidenceUrls[d.id] ? (
                                          <img src={evidenceUrls[d.id]} alt={`Evidência de ${brand.name}`} className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                            <ImageIcon className="h-4 w-4" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap gap-1">
                                          <Badge variant="secondary">{d.exposure_type}</Badge>
                                          <Badge variant="outline">{formatTime(Number(d.start_time ?? 0))}</Badge>
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          BES {Math.round(Number(d.bes_score ?? 0))} · confiança {Math.round(Number(d.confidence ?? 0) * 100)}% · tela {Number(d.screen_percentage ?? 0).toFixed(2)}%
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "completed") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Finalizado</Badge>;
  if (status === "processing") return <Badge className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Processando</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Falhou</Badge>;
  return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Em fila</Badge>;
};

const getBesAnalysis = (detections: MediaDetection[]) => {
  const valid = detections.filter((d) => d.review_status !== "rejeitada");
  const byBrand = new Map<string, number>();
  const detectionsByBrand = new Map<string, MediaDetection[]>();
  valid.forEach((d) => {
    const name = d.corrected_brand_name || d.brand_name;
    byBrand.set(name, (byBrand.get(name) ?? 0) + Number(d.bes_score ?? 0));
    detectionsByBrand.set(name, [...(detectionsByBrand.get(name) ?? []), d]);
  });
  const topBrands = Array.from(byBrand.entries())
    .map(([name, bes]) => ({ name, bes: Math.round(bes) }))
    .sort((a, b) => b.bes - a.bes)
    .slice(0, 3);
  const brandDetails = Array.from(byBrand.entries())
    .map(([name, bes]) => ({
      name,
      bes: Math.round(bes),
      count: detectionsByBrand.get(name)?.length ?? 0,
      detections: (detectionsByBrand.get(name) ?? []).sort((a, b) => Number(b.bes_score ?? 0) - Number(a.bes_score ?? 0)),
    }))
    .sort((a, b) => b.bes - a.bes);

  return {
    totalBes: Math.round(valid.reduce((sum, d) => sum + Number(d.bes_score ?? 0), 0)),
    brandCount: byBrand.size,
    detectionCount: valid.length,
    avgConfidence: valid.length ? Math.round((valid.reduce((sum, d) => sum + Number(d.confidence ?? 0), 0) / valid.length) * 100) : 0,
    topBrands,
    brandDetails,
  };
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
};

const isInstagramPostUrl = (value: string) => {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    return host === "instagram.com" && /^\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?/.test(url.pathname);
  } catch {
    return false;
  }
};

const getInstagramTitle = (value: string) => {
  try {
    const url = new URL(value);
    const [, type, code] = url.pathname.split("/");
    return `Instagram ${type === "p" ? "Feed" : "Reels"} · ${code || url.hostname}`;
  } catch {
    return "Instagram";
  }
};

const getExposureTypes = (detections: MediaDetection[]) =>
  Array.from(new Set(detections.map((d) => d.exposure_type).filter(Boolean))).sort();

const Metric = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-md bg-muted/40 p-2">
    <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
  </div>
);

export default BrandTrackUploads;
