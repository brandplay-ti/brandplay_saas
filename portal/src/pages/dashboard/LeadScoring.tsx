import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, Flame, Snowflake, ThermometerSun, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useOrganization } from "@/hooks/useOrganization";

interface Property { id: string; name: string; }
interface Score {
  id: string;
  target_type: "sponsor" | "opportunity";
  target_id: string;
  property_id: string | null;
  score: number;
  classification: "quente" | "morno" | "frio";
  reasons: string[];
  approach_argument: string | null;
  fit_segment: number | null;
  fit_audience: number | null;
  fit_history: number | null;
  updated_at: string;
}
interface NameMap { [id: string]: string; }

const classUI: Record<Score["classification"], { label: string; cls: string; Icon: typeof Flame }> = {
  quente: { label: "Quente", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: Flame },
  morno: { label: "Morno", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", Icon: ThermometerSun },
  frio: { label: "Frio", cls: "bg-sky-500/15 text-sky-600 border-sky-500/30", Icon: Snowflake },
};

export default function LeadScoring() {
  const { orgId } = useOrganization();
  const [properties, setProperties] = useState<Property[]>([]);
  const [scopeMode, setScopeMode] = useState<"global" | "property">("global");
  const [propertyId, setPropertyId] = useState<string>("");
  const [scores, setScores] = useState<Score[]>([]);
  const [sponsorNames, setSponsorNames] = useState<NameMap>({});
  const [oppNames, setOppNames] = useState<NameMap>({});
  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    supabase.from("sports_properties").select("id,name").eq("organization_id", orgId).order("name").then(({ data }) => {
      setProperties((data ?? []) as Property[]);
    });
  }, [orgId]);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    let q = supabase.from("lead_scores").select("*").order("score", { ascending: false }).limit(100);
    if (scopeMode === "property" && propertyId) q = q.eq("property_id", propertyId);
    else q = q.is("property_id", null);
    const { data: rows } = await q;
    const list = (rows ?? []) as Score[];
    setScores(list);

    const sIds = list.filter((r) => r.target_type === "sponsor").map((r) => r.target_id);
    const oIds = list.filter((r) => r.target_type === "opportunity").map((r) => r.target_id);
    const [sp, op] = await Promise.all([
      sIds.length ? supabase.from("sponsors").select("id,name").eq("organization_id", orgId).in("id", sIds) : Promise.resolve({ data: [] as any[] }),
      oIds.length ? supabase.from("opportunities").select("id,brand").eq("organization_id", orgId).in("id", oIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const sMap: NameMap = {}; (sp.data ?? []).forEach((x: any) => (sMap[x.id] = x.name));
    const oMap: NameMap = {}; (op.data ?? []).forEach((x: any) => (oMap[x.id] = x.brand));
    setSponsorNames(sMap);
    setOppNames(oMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, [scopeMode, propertyId, orgId]);

  const runScoring = async () => {
    if (scopeMode === "property" && !propertyId) {
      toast.error("Selecione uma propriedade.");
      return;
    }
    setScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke("score-leads", {
        body: { property_id: scopeMode === "property" ? propertyId : null },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`IA avaliou ${(data as any)?.count ?? 0} leads.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar scores");
    } finally {
      setScoring(false);
    }
  };

  const grouped = useMemo(() => ({
    quente: scores.filter((s) => s.classification === "quente"),
    morno: scores.filter((s) => s.classification === "morno"),
    frio: scores.filter((s) => s.classification === "frio"),
  }), [scores]);

  const nameOf = (s: Score) => (s.target_type === "sponsor" ? sponsorNames[s.target_id] : oppNames[s.target_id]) ?? "—";
  const linkOf = (s: Score) => s.target_type === "sponsor" ? `/dashboard/patrocinadores/${s.target_id}` : `/dashboard/pipeline`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" /> Prospecção Inteligente</h1>
          <p className="text-sm text-muted-foreground">Ranking de leads por probabilidade de fechamento, gerado por IA.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as any)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Score global</SelectItem>
              <SelectItem value="property">Por propriedade</SelectItem>
            </SelectContent>
          </Select>
          {scopeMode === "property" && (
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Selecione propriedade" /></SelectTrigger>
              <SelectContent>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={runScoring} disabled={scoring}>
            {scoring ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Gerar / Atualizar com IA
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : scores.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum score ainda. Clique em "Gerar com IA" para avaliar seus patrocinadores e oportunidades.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(["quente", "morno", "frio"] as const).map((cls) => {
            const { Icon, label, cls: badgeCls } = classUI[cls];
            const list = grouped[cls];
            return (
              <Card key={cls}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2"><Icon className="h-4 w-4" /> {label}</span>
                    <Badge variant="outline">{list.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {list.length === 0 && <p className="text-xs text-muted-foreground">Nenhum lead.</p>}
                  {list.map((s) => (
                    <div key={s.id} className="border border-border rounded-md p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{nameOf(s)}</div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {s.target_type === "sponsor" ? "Patrocinador" : "Oportunidade"}
                          </div>
                        </div>
                        <Badge className={badgeCls}>{s.score}</Badge>
                      </div>
                      {s.approach_argument && (
                        <p className="text-xs text-foreground/80 italic">"{s.approach_argument}"</p>
                      )}
                      {s.reasons?.length > 0 && (
                        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                          {s.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      )}
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        <Link to={linkOf(s)}>Abrir <ExternalLink className="h-3 w-3 ml-1" /></Link>
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
