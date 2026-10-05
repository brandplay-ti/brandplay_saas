import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock, Download, Image as ImageIcon, SearchCheck, Video, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type ReviewStatus = "pendente" | "aprovada" | "corrigida" | "rejeitada";

type EvidenceItem = {
  id: string;
  brand: string;
  correctedBrand?: string | null;
  url?: string;
  bes: number;
  type: string;
  correctedType?: string | null;
  mediaTitle?: string | null;
  mediaType: string;
  timestamp: number;
  confidence: number;
  screenPercentage: number;
  reviewStatus: ReviewStatus;
  reviewNotes?: string | null;
};

const statusLabels: Record<ReviewStatus, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  corrigida: "Corrigida",
  rejeitada: "Removida",
};

const BrandTrackEvidence = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewStatus>("pendente");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [corrections, setCorrections] = useState<Record<string, { brand: string; type: string }>>({});

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data, error } = await db
      .from("brandtrack_detections")
      .select("id, brand_name, corrected_brand_name, bes_score, exposure_type, corrected_exposure_type, start_time, confidence, screen_percentage, evidence_path, review_status, review_notes, media:brandtrack_media(storage_path,media_type,title)")
      .order("start_time", { ascending: true })
      .order("bes_score", { ascending: false })
      .limit(120);

    if (error) {
      toast.error(error.message);
      return;
    }

    const list: EvidenceItem[] = [];
    const draftNotes: Record<string, string> = {};
    const draftCorrections: Record<string, { brand: string; type: string }> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const d of (data ?? []) as any[]) {
      const mediaPath = d.media?.storage_path;
      const evidencePath = d.evidence_path || (d.media?.media_type === "image" ? mediaPath : null);
      let url: string | undefined;

      if (evidencePath) {
        const { data: signed } = await supabase.storage.from("brandtrack-media").createSignedUrl(evidencePath, 3600);
        url = signed?.signedUrl;
      }

      draftNotes[d.id] = d.review_notes ?? "";
      draftCorrections[d.id] = { brand: d.corrected_brand_name || d.brand_name, type: d.corrected_exposure_type || d.exposure_type };
      list.push({
        id: d.id,
        brand: d.brand_name,
        correctedBrand: d.corrected_brand_name,
        url,
        bes: Number(d.bes_score),
        type: d.exposure_type,
        correctedType: d.corrected_exposure_type,
        mediaTitle: d.media?.title,
        mediaType: d.media?.media_type ?? "image",
        timestamp: Number(d.start_time ?? 0),
        confidence: Number(d.confidence ?? 0),
        screenPercentage: Number(d.screen_percentage ?? 0),
        reviewStatus: (d.review_status ?? "pendente") as ReviewStatus,
        reviewNotes: d.review_notes,
      });
    }

    setItems(list);
    setNotes(draftNotes);
    setCorrections(draftCorrections);
  };

  const filteredItems = useMemo(
    () => (statusFilter === "all" ? items : items.filter((item) => item.reviewStatus === statusFilter)),
    [items, statusFilter]
  );

  const counters = useMemo(() => {
    return items.reduce(
      (acc, item) => ({ ...acc, [item.reviewStatus]: acc[item.reviewStatus] + 1 }),
      { pendente: 0, aprovada: 0, corrigida: 0, rejeitada: 0 } as Record<ReviewStatus, number>
    );
  }, [items]);

  const updateReview = async (item: EvidenceItem, status: ReviewStatus) => {
    const note = notes[item.id]?.trim() || null;
    const { error } = await db
      .from("brandtrack_detections")
      .update({
        review_status: status,
        review_notes: note,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        corrected_brand_name: status === "corrigida" ? corrections[item.id]?.brand?.trim() || item.brand : item.correctedBrand ?? null,
        corrected_exposure_type: status === "corrigida" ? corrections[item.id]?.type || item.type : item.correctedType ?? null,
      })
      .eq("id", item.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Revisão salva");
    await load();
  };

  const download = async (url: string, name: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
    } catch {
      toast.error("Erro ao baixar");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Evidências & Revisão</h1>
          <p className="text-muted-foreground">Valide aparições por timestamp, confirme, corrija ou remova falsos positivos.</p>
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | ReviewStatus)}>
          <SelectTrigger className="w-full md:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {(Object.keys(statusLabels) as ReviewStatus[]).map((status) => (
          <Card key={status}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{statusLabels[status]}</p>
                <p className="text-2xl font-bold">{counters[status]}</p>
              </div>
              <StatusBadge status={status} />
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ImageIcon className="mx-auto mb-2 h-10 w-10 opacity-40" />
          Nenhuma evidência neste filtro.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((it) => (
            <Card key={it.id} className="overflow-hidden">
              <div className="relative aspect-video bg-muted">
                {it.url ? (
                  <img src={it.url} alt={`Evidência de ${it.correctedBrand || it.brand}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Video className="h-8 w-8" />
                    <span className="text-xs">Frame em {formatTime(it.timestamp)}</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/80 to-transparent p-3 text-background">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 font-semibold text-sm truncate">{it.correctedBrand || it.brand}</div>
                    <StatusBadge status={it.reviewStatus} />
                  </div>
                  <div className="text-xs opacity-80">{it.mediaType === "video" ? `${formatTime(it.timestamp)} · ` : ""}BES {Math.round(it.bes)} · confiança {(it.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm truncate">{it.mediaTitle || "Mídia sem título"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{it.correctedType || it.type}</Badge>
                  <Badge variant="secondary">{it.screenPercentage.toFixed(2)}% da tela</Badge>
                  {it.mediaType === "video" && <Badge variant="outline">{formatTime(it.timestamp)}</Badge>}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    value={corrections[it.id]?.brand ?? it.brand}
                    onChange={(event) => setCorrections((current) => ({ ...current, [it.id]: { brand: event.target.value, type: current[it.id]?.type ?? it.type } }))}
                    placeholder="Marca corrigida"
                  />
                  <Select
                    value={corrections[it.id]?.type ?? it.type}
                    onValueChange={(value) => setCorrections((current) => ({ ...current, [it.id]: { brand: current[it.id]?.brand ?? it.brand, type: value } }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["uniforme", "placa", "backdrop", "led", "transmissao", "outro"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={notes[it.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [it.id]: event.target.value }))}
                  placeholder="Observação da revisão"
                  className="min-h-20"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => void updateReview(it, "aprovada")}>
                    <CheckCircle2 className="h-3 w-3" /> Confirmar
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => void updateReview(it, "corrigida")}>
                    <SearchCheck className="h-3 w-3" /> Corrigir
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => void updateReview(it, "rejeitada")}>
                    <XCircle className="h-3 w-3" /> Remover
                  </Button>
                </div>
                <Button size="sm" variant="ghost" className="w-full gap-1" disabled={!it.url} onClick={() => it.url && void download(it.url, `${it.brand}-${formatTime(it.timestamp)}.jpg`)}>
                  <Download className="h-3 w-3" /> Baixar evidência
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({ status }: { status: ReviewStatus }) => {
  if (status === "aprovada") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Aprovada</Badge>;
  if (status === "corrigida") return <Badge className="gap-1"><SearchCheck className="h-3 w-3" /> Corrigida</Badge>;
  if (status === "rejeitada") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Removida</Badge>;
  return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
};

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
};

export default BrandTrackEvidence;
