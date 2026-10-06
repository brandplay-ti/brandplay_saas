import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Calendar, MapPin, CheckCircle2, AlertCircle, Clock, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Delivery = {
  id: string;
  title: string;
  brand: string;
  status: string;
  approval: string;
  due_date: string | null;
  delivered_at: string | null;
  evidence_url: string | null;
  property_id: string | null;
  quantity: number;
  asset_type: string | null;
};

const statusConfig: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pendente: { label: "Pendente", icon: Clock, className: "bg-muted text-muted-foreground" },
  em_producao: { label: "Em produção", icon: Clock, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  entregue: { label: "Entregue", icon: CheckCircle2, className: "bg-green-500/10 text-green-600 dark:text-green-400" },
  aprovada: { label: "Aprovada", icon: CheckCircle2, className: "bg-green-500/10 text-green-600 dark:text-green-400" },
  atrasada: { label: "Atrasada", icon: AlertCircle, className: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

const FieldDeliveries = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"todos" | "pendentes" | "entregues">("pendentes");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");

  const [assetCategories, setAssetCategories] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data }, { data: assets }] = await Promise.all([
        supabase
          .from("deliveries")
          .select("id, title, brand, status, approval, due_date, delivered_at, evidence_url, property_id, quantity, asset_type")
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(200),
        supabase.from("assets").select("name, category"),
      ]);
      const map: Record<string, string> = {};
      for (const a of assets ?? []) {
        if (a.name && a.category) map[String(a.name).trim().toLowerCase()] = a.category as string;
      }
      setAssetCategories(map);
      setItems((data as Delivery[]) || []);
      setLoading(false);
    })();
  }, [user]);

  // Categoria conforme o módulo de Ativos (casada pelo nome do ativo/entrega)
  const categoryOf = useMemo(
    () => (d: Delivery) =>
      assetCategories[d.title.trim().toLowerCase()] ||
      (d.asset_type ? d.asset_type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Sem categoria"),
    [assetCategories]
  );

  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (tab === "pendentes" && (d.status === "entregue" || d.status === "aprovada")) return false;
      if (tab === "entregues" && d.status !== "entregue" && d.status !== "aprovada") return false;
      if (category !== "all" && categoryOf(d) !== category) return false;
      if (q && !`${d.title} ${d.brand} ${categoryOf(d)}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [items, tab, q, category, categoryOf]);

  const categories = useMemo(
    () => Array.from(new Set(items.map(categoryOf))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [items, categoryOf]
  );

  const groups = useMemo(() => {
    const map = new Map<string, Delivery[]>();
    for (const d of filtered) {
      const key = categoryOf(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [filtered, categoryOf]);

  return (
    <div className="px-4 pt-4 space-y-4">
      <div>
        <h2 className="text-xl font-bold">Entregas</h2>
        <p className="text-xs text-muted-foreground">Tire a foto direto no local</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar entrega ou marca…" className="pl-9 h-11" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
          <TabsTrigger value="entregues">Entregues</TabsTrigger>
          <TabsTrigger value="todos">Todos</TabsTrigger>
        </TabsList>
      </Tabs>

      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-11"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as categorias</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Camera className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma entrega encontrada</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([cat, list]) => (
            <div key={cat} className="space-y-3">
              <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur py-1 z-10">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h3>
                <Badge variant="outline" className="text-[10px]">{list.length}</Badge>
              </div>
              {list.map((d) => {
                const cfg = statusConfig[d.status] || statusConfig.pendente;
                const Icon = cfg.icon;
                const overdue = d.due_date && new Date(d.due_date) < new Date() && d.status !== "entregue" && d.status !== "aprovada";
                return (
                  <Link key={d.id} to={`/campo/entregas/${d.id}`}>
                    <Card className="p-4 active:scale-[0.99] transition-transform">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm leading-tight line-clamp-2">{d.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{d.brand} · qtd {d.quantity}</p>
                        </div>
                        {d.evidence_url ? (
                          <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                            <img src={d.evidence_url} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted/50 border-2 border-dashed flex items-center justify-center flex-shrink-0">
                            <Camera className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className={`text-[10px] ${cfg.className}`}>
                          <Icon className="w-3 h-3 mr-1" />
                          {cfg.label}
                        </Badge>
                        {d.due_date && (
                          <span className={`text-[10px] flex items-center gap-1 ${overdue ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}>
                            <Calendar className="w-3 h-3" />
                            {new Date(d.due_date).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default FieldDeliveries;
