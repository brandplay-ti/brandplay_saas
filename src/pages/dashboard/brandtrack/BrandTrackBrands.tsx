import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronRight, Tag, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Link } from "react-router-dom";

type Row = {
  brand_name: string;
  count: number;
  duration: number;
  bes: number;
  avgPct: number;
  types: Set<string>;
  expected?: ExpectedBrand;
};

type ExpectedBrand = {
  id: string;
  event_id: string;
  display_name: string;
  aliases: string[];
  sponsor_status: string;
  is_active: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const statusLabels: Record<string, string> = {
  patrocinador: "Patrocinador",
  nao_patrocinador: "Não patrocinador",
  concorrente: "Concorrente",
  parceiro: "Parceiro",
  prospect: "Prospect",
};

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const BrandTrackBrands = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [expected, setExpected] = useState<ExpectedBrand[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const [{ data: detections }, { data: expectedBrands }] = await Promise.all([
      supabase.from("brandtrack_detections").select("*").neq("review_status", "rejeitada"),
      db.from("brandtrack_event_brands").select("id,event_id,display_name,aliases,sponsor_status,is_active").eq("is_active", true),
    ]);

    const expectedList = (expectedBrands ?? []) as ExpectedBrand[];
    const expectedMap = new Map<string, ExpectedBrand>();
    expectedList.forEach((brand) => {
      expectedMap.set(normalize(brand.display_name), brand);
      brand.aliases.forEach((alias) => expectedMap.set(normalize(alias), brand));
    });

    const map = new Map<string, Row>();
    for (const d of detections ?? []) {
      const detectedName = d.corrected_brand_name || d.brand_name;
      const matchedExpected = expectedMap.get(normalize(detectedName));
      const officialName = matchedExpected?.display_name ?? detectedName;
      const e = map.get(officialName) ?? {
        brand_name: officialName,
        count: 0,
        duration: 0,
        bes: 0,
        avgPct: 0,
        types: new Set<string>(),
        expected: matchedExpected,
      };
      e.count += 1;
      e.duration += Number(d.duration ?? 0);
      e.bes += Number(d.bes_score ?? 0);
      e.avgPct += Number(d.screen_percentage ?? 0);
      e.types.add(d.corrected_exposure_type || d.exposure_type);
      if (matchedExpected) e.expected = matchedExpected;
      map.set(officialName, e);
    }
    setRows([...map.values()].map((r) => ({ ...r, avgPct: r.avgPct / Math.max(r.count, 1) })).sort((a, b) => b.bes - a.bes));
    setExpected(expectedList);
  };

  const expectedNotDetected = useMemo(() => {
    const detected = new Set(rows.map((row) => normalize(row.brand_name)));
    return expected.filter((brand) => !detected.has(normalize(brand.display_name)));
  }, [expected, rows]);

  const filtered = rows.filter((r) => {
    if (view === "expected" && !r.expected) return false;
    if (view === "unexpected" && r.expected) return false;
    return r.brand_name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Análise por Patrocinador</h1>
        <p className="text-muted-foreground">Marcas detectadas, esperadas e inesperadas com métricas agregadas.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Esperadas detectadas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{rows.filter((r) => r.expected).length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Esperadas não detectadas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{expectedNotDetected.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Inesperadas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{rows.filter((r) => !r.expected).length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Marcas ({filtered.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={view} onValueChange={setView}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas detectadas</SelectItem>
                <SelectItem value="expected">Esperadas</SelectItem>
                <SelectItem value="unexpected">Inesperadas</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-64">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar marca…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma marca detectada ainda.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <div key={r.brand_name} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-accent/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <div className="font-semibold">{r.brand_name}</div>
                      {r.expected ? <Badge variant="secondary">{statusLabels[r.expected.sponsor_status]}</Badge> : <Badge variant="outline">Inesperada</Badge>}
                      {[...r.types].slice(0, 3).map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.count} aparições · {r.duration.toFixed(1)}s · {r.avgPct.toFixed(1)}% tela média
                      {r.expected?.aliases?.length ? ` · aliases: ${r.expected.aliases.slice(0, 3).join(", ")}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{Math.round(r.bes)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">BES</div>
                  </div>
                  <Button asChild variant="ghost" size="icon">
                    <Link to={`/dashboard/brandtrack/marcas/${encodeURIComponent(r.brand_name)}`}><ChevronRight className="h-4 w-4" /></Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {expectedNotDetected.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Esperadas ainda não detectadas</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {expectedNotDetected.map((brand) => <Badge key={brand.id} variant="outline">{brand.display_name} · {statusLabels[brand.sponsor_status]}</Badge>)}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BrandTrackBrands;
