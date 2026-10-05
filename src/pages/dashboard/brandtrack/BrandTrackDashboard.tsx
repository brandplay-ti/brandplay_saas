import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Eye, Clock, Trophy, TrendingUp, Image as ImageIcon, Percent, Layers, Gauge } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type BrandAgg = {
  name: string;
  color?: string | null;
  count: number;
  duration: number;
  bes: number;
  avgPct: number;
  confidence: number;
};

type TypeAgg = { type: string; count: number; bes: number };
type MediaAgg = { title: string; count: number; bes: number };
type DayAgg = { day: string; bes: number; count: number };

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 200 80% 50%))",
  "hsl(var(--chart-3, 30 90% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 150 60% 45%))",
  "hsl(var(--muted-foreground))",
];

const BrandTrackDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<BrandAgg[]>([]);
  const [types, setTypes] = useState<TypeAgg[]>([]);
  const [medias, setMedias] = useState<MediaAgg[]>([]);
  const [timeline, setTimeline] = useState<DayAgg[]>([]);
  const [totalDetections, setTotalDetections] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [totalBes, setTotalBes] = useState(0);
  const [avgConfidence, setAvgConfidence] = useState(0);
  const [avgScreen, setAvgScreen] = useState(0);
  const [mediaCount, setMediaCount] = useState(0);
  const [goldenMoment, setGoldenMoment] = useState<{ brand: string; bes: number; mediaTitle: string } | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: dets } = await supabase
      .from("brandtrack_detections")
      .select("*, media:brandtrack_media(title, created_at)");
    const { data: brandsData } = await supabase.from("brandtrack_brands").select("name, color");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colorMap = new Map((brandsData ?? []).map((b: any) => [b.name.toLowerCase(), b.color]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (dets ?? []) as any[];
    setTotalDetections(list.length);
    setTotalDuration(list.reduce((s, d) => s + Number(d.duration ?? 0), 0));
    setTotalBes(list.reduce((s, d) => s + Number(d.bes_score ?? 0), 0));
    setAvgConfidence(list.length ? list.reduce((s, d) => s + Number(d.confidence ?? 0), 0) / list.length : 0);
    setAvgScreen(list.length ? list.reduce((s, d) => s + Number(d.screen_percentage ?? 0), 0) / list.length : 0);

    const brandMap = new Map<string, BrandAgg>();
    const typeMap = new Map<string, TypeAgg>();
    const mediaMap = new Map<string, MediaAgg>();
    const dayMap = new Map<string, DayAgg>();
    let gold: { brand: string; bes: number; mediaTitle: string } | null = null;

    for (const d of list) {
      const name = d.corrected_brand_name || d.brand_name;
      const b = brandMap.get(name) ?? {
        name,
        color: colorMap.get(String(name).toLowerCase()) ?? undefined,
        count: 0,
        duration: 0,
        bes: 0,
        avgPct: 0,
        confidence: 0,
      };
      b.count += 1;
      b.duration += Number(d.duration ?? 0);
      b.bes += Number(d.bes_score ?? 0);
      b.avgPct += Number(d.screen_percentage ?? 0);
      b.confidence += Number(d.confidence ?? 0);
      brandMap.set(name, b);

      const t = d.corrected_exposure_type || d.exposure_type || "outro";
      const te = typeMap.get(t) ?? { type: t, count: 0, bes: 0 };
      te.count += 1;
      te.bes += Number(d.bes_score ?? 0);
      typeMap.set(t, te);

      const title = d.media?.title ?? "—";
      const me = mediaMap.get(title) ?? { title, count: 0, bes: 0 };
      me.count += 1;
      me.bes += Number(d.bes_score ?? 0);
      mediaMap.set(title, me);

      const created = d.media?.created_at ?? d.created_at;
      if (created) {
        const day = new Date(created).toISOString().slice(0, 10);
        const de = dayMap.get(day) ?? { day, bes: 0, count: 0 };
        de.bes += Number(d.bes_score ?? 0);
        de.count += 1;
        dayMap.set(day, de);
      }

      if (!gold || Number(d.bes_score) > gold.bes) {
        gold = { brand: name, bes: Number(d.bes_score), mediaTitle: d.media?.title ?? "—" };
      }
    }

    const arr = [...brandMap.values()]
      .map((b, i) => ({
        ...b,
        color: b.color || PALETTE[i % PALETTE.length],
        avgPct: b.avgPct / Math.max(b.count, 1),
        confidence: b.confidence / Math.max(b.count, 1),
      }))
      .sort((a, b) => b.bes - a.bes);

    setBrands(arr);
    setTypes([...typeMap.values()].sort((a, b) => b.bes - a.bes));
    setMedias([...mediaMap.values()].sort((a, b) => b.bes - a.bes).slice(0, 8));
    setMediaCount(mediaMap.size);
    setTimeline([...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30));
    setGoldenMoment(gold);
    setLoading(false);
  };

  const shareOfVoice = useMemo(() => {
    const total = brands.reduce((s, b) => s + b.bes, 0);
    return brands.slice(0, 6).map((b) => ({ ...b, share: total > 0 ? (b.bes / total) * 100 : 0 }));
  }, [brands]);

  const concentration = useMemo(() => {
    const total = brands.reduce((s, b) => s + b.bes, 0);
    const top3 = brands.slice(0, 3).reduce((s, b) => s + b.bes, 0);
    return total > 0 ? (top3 / total) * 100 : 0;
  }, [brands]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">BrandTrack</h1>
          <Badge variant="secondary">Análise de exposição com IA</Badge>
        </div>
        <p className="text-muted-foreground mt-1">
          Transforme exposição de marca em dados mensuráveis e relatórios de ROI.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<Trophy className="h-4 w-4" />} label="Marcas detectadas" value={brands.length.toString()} />
        <MetricCard icon={<Clock className="h-4 w-4" />} label="Tempo total de exposição" value={`${totalDuration.toFixed(1)}s`} />
        <MetricCard icon={<Eye className="h-4 w-4" />} label="Aparições" value={totalDetections.toString()} />
        <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Brand Exposure Score" value={Math.round(totalBes).toString()} accent />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<ImageIcon className="h-4 w-4" />} label="Mídias analisadas" value={mediaCount.toString()} />
        <MetricCard icon={<Percent className="h-4 w-4" />} label="% médio de tela" value={`${avgScreen.toFixed(1)}%`} />
        <MetricCard icon={<Gauge className="h-4 w-4" />} label="Confiança média" value={`${(avgConfidence * 100).toFixed(0)}%`} />
        <MetricCard icon={<Layers className="h-4 w-4" />} label="Concentração top 3" value={`${concentration.toFixed(0)}%`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Ranking de marcas por BES</CardTitle>
            <p className="text-sm text-muted-foreground">Brand Exposure Score combina tempo, tamanho, posição e contexto.</p>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando…</p>
          ) : brands.length === 0 ? (
            <EmptyState />
          ) : (
            <Tabs defaultValue="bes">
              <TabsList>
                <TabsTrigger value="bes">BES</TabsTrigger>
                <TabsTrigger value="time">Tempo</TabsTrigger>
                <TabsTrigger value="appearances">Aparições</TabsTrigger>
                <TabsTrigger value="screen">% de tela</TabsTrigger>
              </TabsList>
              <TabsContent value="bes"><BrandChart data={brands} dataKey="bes" /></TabsContent>
              <TabsContent value="time"><BrandChart data={brands} dataKey="duration" /></TabsContent>
              <TabsContent value="appearances"><BrandChart data={brands} dataKey="count" /></TabsContent>
              <TabsContent value="screen"><BrandChart data={brands} dataKey="avgPct" /></TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Share of Voice</CardTitle>
            <p className="text-sm text-muted-foreground">Participação de cada marca no BES total.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {shareOfVoice.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              shareOfVoice.map((b) => (
                <div key={b.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2">{b.name}</span>
                    <span className="font-semibold">{b.share.toFixed(1)}%</span>
                  </div>
                  <Progress value={b.share} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mix por tipo de exposição</CardTitle>
            <p className="text-sm text-muted-foreground">Onde as marcas mais aparecem.</p>
          </CardHeader>
          <CardContent>
            {types.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={types} dataKey="count" nameKey="type" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {types.map((t, i) => <Cell key={t.type} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Legend />
                    <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolução do BES</CardTitle>
            <p className="text-sm text-muted-foreground">Exposição acumulada por dia de mídia analisada.</p>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="bes" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mídias com maior exposição</CardTitle>
            <p className="text-sm text-muted-foreground">Conteúdos que mais geraram valor de marca.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {medias.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              medias.map((m) => (
                <div key={m.title} className="flex items-center justify-between gap-3 border rounded-lg p-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{m.title}</div>
                    <div className="text-xs text-muted-foreground">{m.count} detecções</div>
                  </div>
                  <Badge variant="secondary">BES {Math.round(m.bes)}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" /> Momento de Ouro
            </CardTitle>
          </CardHeader>
          <CardContent>
            {goldenMoment ? (
              <div>
                <div className="text-2xl font-bold">{goldenMoment.brand}</div>
                <div className="text-sm text-muted-foreground">em “{goldenMoment.mediaTitle}”</div>
                <Badge className="mt-2">BES {Math.round(goldenMoment.bes)}</Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Qualidade da detecção por marca</CardTitle>
            <p className="text-sm text-muted-foreground">Confiança média e tamanho médio em tela (top 6).</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {brands.slice(0, 6).map((b) => (
              <div key={b.name} className="flex items-center justify-between gap-3 text-sm border rounded-lg p-2.5">
                <span className="truncate">{b.name}</span>
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  {(b.confidence * 100).toFixed(0)}% confiança · {b.avgPct.toFixed(1)}% tela
                </span>
              </div>
            ))}
            {brands.length === 0 && <p className="text-sm text-muted-foreground">Sem dados ainda.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const MetricCard = ({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) => (
  <Card className={accent ? "border-primary/40 bg-primary/5" : undefined}>
    <CardContent className="pt-6">
      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </CardContent>
  </Card>
);

const BrandChart = ({ data, dataKey }: { data: BrandAgg[]; dataKey: "bes" | "duration" | "count" | "avgPct" }) => (
  <div className="h-72 mt-4">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <YAxis dataKey="name" type="category" width={120} stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
        <Bar dataKey={dataKey} radius={[0, 6, 6, 0]}>
          {data.slice(0, 10).map((entry, i) => (
            <Cell key={i} fill={entry.color || "hsl(var(--primary))"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const EmptyState = () => (
  <div className="text-center py-12 text-muted-foreground">
    <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
    <p>Nenhuma análise ainda.</p>
    <p className="text-sm mt-1">Faça upload de imagens em <strong>Uploads</strong> para começar.</p>
  </div>
);

export default BrandTrackDashboard;
