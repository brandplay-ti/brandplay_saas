import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { z } from "zod";
import {
  Trophy,
  Calendar,
  Users,
  Crown,
  Boxes,
  Loader2,
  CheckCircle2,
  Mail,
  Building2,
  Phone,
  Sparkles,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AssetCatalogToolbar, filterAndSortAssets, type AssetSortBy, type AssetViewMode } from "@/components/assets/AssetCatalogToolbar";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR") : "—";

interface PublicProperty {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  audience_estimate: number | null;
  description: string | null;
  public_headline: string | null;
  public_about: string | null;
  public_cover_path: string | null;
  season_year: number | null;
  parent_property_id: string | null;
}

interface PublicTier {
  id: string;
  name: string;
  level: string;
  value: number;
  total_slots: number;
  benefits: string | null;
  color: string;
  position: number;
  sold: number;
  assets: { id: string; name: string; category: string }[];
}

interface PublicAsset {
  id: string;
  name: string;
  category: string;
  cover_url: string | null;
}

interface PublicMedia {
  id: string;
  media_type: "photo" | "video" | "link";
  storage_path: string | null;
  external_url: string | null;
  caption: string | null;
}

interface PublicSponsor {
  id: string;
  name: string;
  logo_url: string | null;
}

const leadSchema = z.object({
  contact_name: z.string().trim().min(2, "Nome muito curto").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  company: z.string().trim().max(150).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  budget_range: z.string().max(50).optional().or(z.literal("")),
  tier_id: z.string().uuid().optional().or(z.literal("")),
});

export default function PublicMediaKit() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [property, setProperty] = useState<PublicProperty | null>(null);
  const [tiers, setTiers] = useState<PublicTier[]>([]);
  const [assets, setAssets] = useState<PublicAsset[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetCategory, setAssetCategory] = useState("all");
  const [assetSort, setAssetSort] = useState<AssetSortBy>("name_asc");
  const [assetView, setAssetView] = useState<AssetViewMode>("grid");
  const [seasons, setSeasons] = useState<PublicProperty[]>([]);
  const [media, setMedia] = useState<PublicMedia[]>([]);
  const [sponsors, setSponsors] = useState<PublicSponsor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    contact_name: "",
    email: "",
    company: "",
    phone: "",
    message: "",
    budget_range: "",
    tier_id: "",
  });

  useEffect(() => {
    document.title = property?.name
      ? `${property.name} · Media Kit`
      : "Media Kit";
  }, [property]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data: prop } = await supabase
        .from("sports_properties")
        .select("*")
        .eq("public_slug", slug)
        .eq("is_published", true)
        .maybeSingle();

      if (!prop) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProperty(prop as PublicProperty);

      const [
        { data: tiersData },
        { data: salesData },
        { data: tierAssetsRows },
        { data: allocData },
        { data: seasonsData },
        { data: mediaData },
        { data: contractsData },
      ] = await Promise.all([
        supabase
          .from("sponsorship_tiers")
          .select("*")
          .eq("property_id", prop.id)
          .order("position"),
        supabase.from("tier_sales").select("tier_id, sponsor_id"),
        supabase.from("tier_assets").select("tier_id, asset:assets(id,name,category)"),
        supabase
          .from("asset_allocations")
          .select("asset:assets(id,name,category), photos:assets(asset_photos(storage_path,is_cover,position))")
          .eq("property_id", prop.id),
        prop.parent_property_id || prop.id
          ? supabase
              .from("sports_properties")
              .select("*")
              .or(
                `id.eq.${prop.parent_property_id ?? prop.id},parent_property_id.eq.${prop.parent_property_id ?? prop.id}`
              )
              .eq("is_published", true)
              .order("season_year", { ascending: false, nullsFirst: false })
          : { data: [] },
        (supabase as any)
          .from("property_media")
          .select("id, media_type, storage_path, external_url, caption")
          .eq("property_id", prop.id)
          .order("position", { ascending: true }),
        supabase
          .from("contracts")
          .select("sponsor_id, status")
          .eq("property_id", prop.id)
          .in("status", ["ativo", "vencendo"]),
      ]);

      const mediaFmt: PublicMedia[] = ((mediaData as any[]) ?? []).map((m) => ({
        id: m.id,
        media_type: m.media_type,
        storage_path: m.storage_path
          ? supabase.storage.from("property-media").getPublicUrl(m.storage_path).data.publicUrl
          : null,
        external_url: m.external_url,
        caption: m.caption,
      }));
      setMedia(mediaFmt);

      const sponsorIds = new Set<string>();
      (contractsData ?? []).forEach((c: any) => c.sponsor_id && sponsorIds.add(c.sponsor_id));
      (salesData ?? []).forEach((s: any) => s.sponsor_id && sponsorIds.add(s.sponsor_id));
      if (sponsorIds.size > 0) {
        const { data: sps } = await supabase
          .from("sponsors")
          .select("id, name, logo_path")
          .in("id", Array.from(sponsorIds));
        setSponsors(
          (sps ?? []).map((sp: any) => ({
            id: sp.id,
            name: sp.name,
            logo_url: sp.logo_path
              ? supabase.storage.from("sponsor-logos").getPublicUrl(sp.logo_path).data.publicUrl
              : null,
          }))
        );
      }

      const tierIds = new Set((tiersData ?? []).map((t: any) => t.id));
      const taByTier: Record<string, any[]> = {};
      (tierAssetsRows ?? []).forEach((r: any) => {
        if (!tierIds.has(r.tier_id)) return;
        taByTier[r.tier_id] = taByTier[r.tier_id] ?? [];
        if (r.asset) taByTier[r.tier_id].push(r.asset);
      });

      const tiersFmt: PublicTier[] = (tiersData ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        level: t.level,
        value: Number(t.value),
        total_slots: t.total_slots,
        benefits: t.benefits,
        color: t.color || "#64748b",
        position: t.position,
        sold: (salesData ?? []).filter((s: any) => s.tier_id === t.id).length,
        assets: taByTier[t.id] ?? [],
      }));
      setTiers(tiersFmt);

      const assetsFmt: PublicAsset[] = (allocData ?? []).map((row: any) => {
        const photos = row.photos?.asset_photos ?? [];
        const cover =
          photos.find((ph: any) => ph.is_cover) ??
          [...photos].sort((a: any, b: any) => a.position - b.position)[0];
        const url = cover
          ? supabase.storage.from("asset-photos").getPublicUrl(cover.storage_path).data
              .publicUrl
          : null;
        return {
          id: row.asset.id,
          name: row.asset.name,
          category: row.asset.category,
          cover_url: url,
        };
      });
      setAssets(assetsFmt);
      setSeasons((seasonsData as PublicProperty[]) ?? []);
      setLoading(false);
    })();
  }, [slug]);

  const totalPotential = useMemo(
    () => tiers.reduce((s, t) => s + t.value * t.total_slots, 0),
    [tiers]
  );

  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property) return;

    const parsed = leadSchema.safeParse(form);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      toast.error(first ?? "Verifique os campos.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("property_leads").insert({
      property_id: property.id,
      owner_id: property.owner_id,
      tier_id: form.tier_id || null,
      contact_name: form.contact_name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || null,
      phone: form.phone.trim() || null,
      message: form.message.trim() || null,
      budget_range: form.budget_range || null,
    });
    setSubmitting(false);

    if (error) {
      toast.error("Não foi possível enviar. Tente novamente.");
      return;
    }
    setSubmitted(true);
    toast.success("Mensagem enviada!");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !property) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardContent className="py-12">
            <Trophy className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold">Página não encontrada</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Esta página pode ter sido removida ou despublicada pelo organizador.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const coverUrl = property.public_cover_path
    ? supabase.storage.from("asset-photos").getPublicUrl(property.public_cover_path).data
        .publicUrl
    : null;

  return (
    <main className="min-h-screen bg-background">
      {/* HERO */}
      <header className="relative overflow-hidden bg-gradient-brand text-primary-foreground">
        {coverUrl && (
          <div
            className="absolute inset-0 opacity-20 bg-cover bg-center"
            style={{ backgroundImage: `url(${coverUrl})` }}
          />
        )}
        <div className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
          <Badge variant="secondary" className="mb-4">
            <Sparkles className="h-3 w-3 mr-1" /> Media Kit · {property.category}
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            {property.name}
          </h1>
          {property.public_headline && (
            <p className="text-lg md:text-xl mt-4 max-w-2xl opacity-90">
              {property.public_headline}
            </p>
          )}
          <div className="flex flex-wrap gap-4 mt-6 text-sm">
            {(property.start_date || property.end_date) && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {fmtDate(property.start_date)} → {fmtDate(property.end_date)}
              </div>
            )}
            {property.audience_estimate != null && (
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {property.audience_estimate.toLocaleString("pt-BR")} pessoas
              </div>
            )}
            {property.season_year && (
              <div className="flex items-center gap-1.5">
                <History className="h-4 w-4" />
                Temporada {property.season_year}
              </div>
            )}
          </div>
          <div className="mt-8">
            <Button
              size="lg"
              variant="secondary"
              onClick={() => document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth" })}
            >
              Quero ser patrocinador
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* MÉTRICAS */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Cotas disponíveis"
            value={String(tiers.reduce((s, t) => s + (t.total_slots - t.sold), 0))}
          />
          <MetricCard
            label="Investimento a partir de"
            value={
              tiers.length > 0
                ? fmtBRL(Math.min(...tiers.map((t) => t.value)))
                : "—"
            }
          />
          <MetricCard
            label="Ativos disponíveis"
            value={String(assets.length)}
          />
          <MetricCard
            label="Potencial total"
            value={fmtBRL(totalPotential)}
          />
        </section>

        {/* SOBRE */}
        {(property.public_about || property.description) && (
          <section>
            <h2 className="text-2xl font-bold mb-4">Sobre a propriedade</h2>
            <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {property.public_about ?? property.description}
            </p>
          </section>
        )}

        {/* COTAS */}
        {tiers.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-1">Cotas de patrocínio</h2>
            <p className="text-muted-foreground mb-6">
              Escolha o pacote que melhor se encaixa no seu objetivo de marca.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {tiers.map((t) => {
                const available = t.total_slots - t.sold;
                const pct = t.total_slots > 0 ? (t.sold / t.total_slots) * 100 : 0;
                const sold_out = available === 0;
                return (
                  <Card
                    key={t.id}
                    className="border-l-4 hover:shadow-lg transition"
                    style={{ borderLeftColor: t.color }}
                  >
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Crown className="h-4 w-4" style={{ color: t.color }} />
                            <h3 className="font-bold text-lg">{t.name}</h3>
                          </div>
                          <p className="text-3xl font-bold mt-1">{fmtBRL(t.value)}</p>
                        </div>
                        {sold_out ? (
                          <Badge variant="destructive">Esgotada</Badge>
                        ) : (
                          <Badge variant="secondary">{available} vaga(s)</Badge>
                        )}
                      </div>
                      <Progress value={pct} className="h-1.5" />

                      {t.benefits && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {t.benefits}
                        </p>
                      )}

                      {t.assets.length > 0 && (
                        <div className="pt-2 border-t">
                          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                            Inclui {t.assets.length} ativo(s)
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {t.assets.slice(0, 6).map((a) => (
                              <Badge key={a.id} variant="outline" className="text-xs">
                                {a.name}
                              </Badge>
                            ))}
                            {t.assets.length > 6 && (
                              <Badge variant="outline" className="text-xs">
                                +{t.assets.length - 6}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {!sold_out && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setForm((f) => ({ ...f, tier_id: t.id }));
                            document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          Tenho interesse
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* ATIVOS */}
        {assets.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-1">Ativos disponíveis</h2>
            <p className="text-muted-foreground mb-6">
              Veja os pontos de exposição da sua marca.
            </p>
            <div className="mb-4">
              <AssetCatalogToolbar
                search={assetSearch}
                onSearchChange={setAssetSearch}
                sortBy={assetSort}
                onSortChange={setAssetSort}
                categories={Array.from(new Set(assets.map((a) => a.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"))}
                categoryFilter={assetCategory}
                onCategoryChange={setAssetCategory}
                viewMode={assetView}
                onViewModeChange={setAssetView}
                showQuantitySort={false}
                showValueSort={false}
              />
            </div>
            <div className={assetView === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" : "space-y-2"}>
              {filterAndSortAssets(assets, { search: assetSearch, sortBy: assetSort, categoryFilter: assetCategory }).map((a) => (
                assetView === "grid" ? (
                  <Card key={a.id} className="overflow-hidden hover:shadow-md transition">
                    <div className="aspect-video bg-muted overflow-hidden">
                      {a.cover_url ? (
                        <img src={a.cover_url} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Boxes className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <p className="font-medium text-sm truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.category}</p>
                    </CardContent>
                  </Card>
                ) : assetView === "list" ? (
                  <Card key={a.id} className="flex items-center gap-3 p-2">
                    <div className="h-14 w-24 shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
                      {a.cover_url ? (
                        <img src={a.cover_url} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <Boxes className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.category}</p>
                    </div>
                  </Card>
                ) : (
                  <div key={a.id} className="flex items-center justify-between gap-3 border-b py-2">
                    <p className="text-sm truncate">{a.name}</p>
                    <Badge variant="outline" className="shrink-0">{a.category}</Badge>
                  </div>
                )
              ))}
            </div>
          </section>
        )}

        {/* TEMPORADAS */}
        {seasons.length > 1 && (
          <section>
            <h2 className="text-2xl font-bold mb-4">Edições</h2>
            <div className="flex flex-wrap gap-2">
              {seasons.map((s) => (
                <Badge
                  key={s.id}
                  variant={s.id === property.id ? "default" : "outline"}
                  className="text-sm py-1 px-3"
                >
                  {s.season_year ?? s.name}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* FORMULÁRIO LEAD */}
        <section id="lead-form" className="scroll-mt-6">
          <Card className="max-w-2xl mx-auto shadow-lg">
            <CardContent className="p-6 md:p-8">
              {submitted ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500 mb-4" />
                  <h3 className="text-2xl font-bold">Recebemos sua mensagem!</h3>
                  <p className="text-muted-foreground mt-2">
                    Em breve nossa equipe entrará em contato para apresentar uma proposta.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold">Quer patrocinar?</h2>
                  <p className="text-muted-foreground text-sm mt-1 mb-6">
                    Conte um pouco sobre sua marca. Retornamos em até 2 dias úteis.
                  </p>
                  <form onSubmit={handleSubmitLead} className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="contact_name">Nome *</Label>
                        <Input
                          id="contact_name"
                          required
                          maxLength={100}
                          value={form.contact_name}
                          onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="company"><Building2 className="h-3 w-3 inline mr-1" /> Empresa</Label>
                        <Input
                          id="company"
                          maxLength={150}
                          value={form.company}
                          onChange={(e) => setForm({ ...form, company: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="email"><Mail className="h-3 w-3 inline mr-1" /> Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          required
                          maxLength={255}
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="phone"><Phone className="h-3 w-3 inline mr-1" /> Telefone</Label>
                        <Input
                          id="phone"
                          maxLength={30}
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Cota de interesse</Label>
                        <Select
                          value={form.tier_id || "none"}
                          onValueChange={(v) => setForm({ ...form, tier_id: v === "none" ? "" : v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Não decidi ainda</SelectItem>
                            {tiers.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name} · {fmtBRL(t.value)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Faixa de orçamento</Label>
                        <Select
                          value={form.budget_range || "none"}
                          onValueChange={(v) => setForm({ ...form, budget_range: v === "none" ? "" : v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Prefiro não dizer</SelectItem>
                            <SelectItem value="ate_50k">Até R$ 50 mil</SelectItem>
                            <SelectItem value="50_200k">R$ 50k – 200k</SelectItem>
                            <SelectItem value="200_500k">R$ 200k – 500k</SelectItem>
                            <SelectItem value="acima_500k">Acima de R$ 500k</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="message">Mensagem</Label>
                      <Textarea
                        id="message"
                        rows={4}
                        maxLength={1000}
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="Conte sobre seus objetivos com o patrocínio..."
                      />
                    </div>
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full bg-gradient-brand hover:opacity-90"
                      disabled={submitting}
                    >
                      {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Enviar interesse
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Seus dados são usados apenas para retorno comercial.
                    </p>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Media Kit · {property.name}
      </footer>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-xl md:text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
