import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Video } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = ["all", "uniforme", "placa", "backdrop", "led", "transmissao", "outro"] as const;

const BrandTrackBrandDetail = () => {
  const { brand } = useParams<{ brand: string }>();
  const brandName = decodeURIComponent(brand ?? "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detections, setDetections] = useState<any[]>([]);
  const [filter, setFilter] = useState<(typeof TYPES)[number]>("all");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    void load();
  }, [brandName]);

  const load = async () => {
    const { data } = await supabase
      .from("brandtrack_detections")
      .select("*, media:brandtrack_media(id,title,storage_path,media_type)")
      .or(`brand_name.eq.${brandName},corrected_brand_name.eq.${brandName}`)
      .neq("review_status", "rejeitada")
      .order("bes_score", { ascending: false });
    setDetections(data ?? []);

    const map: Record<string, string> = {};
    for (const d of data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const path = (d as any).media?.storage_path;
      if (path && !map[path]) {
        const { data: signed } = await supabase.storage.from("brandtrack-media").createSignedUrl(path, 3600);
        if (signed?.signedUrl) map[path] = signed.signedUrl;
      }
    }
    setImageUrls(map);
  };

  const filtered = useMemo(
    () => (filter === "all" ? detections : detections.filter((d) => d.exposure_type === filter)),
    [detections, filter]
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/dashboard/brandtrack/marcas"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{brandName}</h1>
          <p className="text-muted-foreground text-sm">Detalhes de aparições e evidências.</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filtrar por tipo:</span>
        <Select value={filter} onValueChange={(v) => setFilter(v as (typeof TYPES)[number])}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => <SelectItem key={t} value={t}>{t === "all" ? "Todos" : t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => {
          const url = imageUrls[d.media?.storage_path];
          const isVideo = d.media?.media_type === "video";
          return (
            <Card key={d.id} className="overflow-hidden">
              <div className="relative aspect-video bg-muted">
                {url && !isVideo ? (
                  <>
                    <img src={url} alt={brandName} className="w-full h-full object-cover" />
                    <div
                      className="absolute border-2 border-primary bg-primary/10"
                      style={{
                        left: `${(d.position_x ?? 0) * 100}%`,
                        top: `${(d.position_y ?? 0) * 100}%`,
                        width: `${(d.width ?? 0) * 100}%`,
                        height: `${(d.height ?? 0) * 100}%`,
                      }}
                    >
                      <div className="absolute -top-5 left-0 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                        {brandName}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Video className="h-6 w-6" />
                    Frame detectado em {formatTime(Number(d.start_time ?? 0))}
                  </div>
                )}
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm truncate">{d.media?.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{d.corrected_exposure_type || d.exposure_type}</Badge>
                  <span className="font-bold text-base">BES {Math.round(d.bes_score)}</span>
                </div>
                <div className="text-muted-foreground">
                  {Number(d.screen_percentage).toFixed(1)}% da tela · confiança {(Number(d.confidence) * 100).toFixed(0)}%
                  {isVideo ? ` · ${formatTime(Number(d.start_time ?? 0))}` : ""}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full text-center py-8">Nenhuma aparição encontrada.</p>
        )}
      </div>
    </div>
  );
};

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const min = Math.floor(safe / 60).toString().padStart(2, "0");
  const sec = (safe % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
};

export default BrandTrackBrandDetail;
