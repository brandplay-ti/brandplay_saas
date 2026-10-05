import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Instagram, Facebook, Youtube, Linkedin, Music2, Twitter, Plus, X, Users, Heart, TrendingUp, RefreshCw, Loader2 } from "lucide-react";


export const SOCIAL_NETWORKS = [
  { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/marca" },
  { key: "facebook", label: "Facebook", icon: Facebook, placeholder: "https://facebook.com/marca" },
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/@marca" },
  { key: "tiktok", label: "TikTok", icon: Music2, placeholder: "https://tiktok.com/@marca" },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "https://linkedin.com/company/marca" },
  { key: "x", label: "X / Twitter", icon: Twitter, placeholder: "https://x.com/marca" },
] as const;

export type SocialKey = (typeof SOCIAL_NETWORKS)[number]["key"];
export type SocialStat = { followers?: number | null; engagement?: number | null; posts?: number | null };

export interface SponsorProfileValue {
  legal_name: string;
  trade_name: string;
  tax_id: string;
  address: string;
  address_city: string;
  address_state: string;
  zip_code: string;
  about: string;
  social_links: Record<string, string>;
  social_stats: Record<string, SocialStat>;
  locations: string[];
  final_location: string;
  fans_count: string;
  prize_pool: string;
  participants_count: string;
  teams_count: string;
  key_notes: string;
}

export const emptySponsorProfile = (): SponsorProfileValue => ({
  legal_name: "", trade_name: "", tax_id: "", address: "", address_city: "", address_state: "", zip_code: "",
  about: "", social_links: {}, social_stats: {}, locations: [], final_location: "",
  fans_count: "", prize_pool: "", participants_count: "", teams_count: "", key_notes: "",
});

export const sponsorProfileFromRow = (s: any): SponsorProfileValue => ({
  legal_name: s?.legal_name ?? "",
  trade_name: s?.trade_name ?? "",
  tax_id: s?.tax_id ?? "",
  address: s?.address ?? "",
  address_city: s?.address_city ?? "",
  address_state: s?.address_state ?? "",
  zip_code: s?.zip_code ?? "",
  about: s?.about ?? "",
  social_links: (s?.social_links ?? {}) as Record<string, string>,
  social_stats: (s?.social_stats ?? {}) as Record<string, SocialStat>,
  locations: (s?.locations ?? []) as string[],
  final_location: s?.final_location ?? "",
  fans_count: s?.fans_count != null ? String(s.fans_count) : "",
  prize_pool: s?.prize_pool != null ? String(s.prize_pool) : "",
  participants_count: s?.participants_count != null ? String(s.participants_count) : "",
  teams_count: s?.teams_count != null ? String(s.teams_count) : "",
  key_notes: s?.key_notes ?? "",
});

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Payload sem os campos exclusivos de patrocinador (para propriedades) */
export const sponsorProfileToPayloadBase = (v: SponsorProfileValue) => {
  const { legal_name, trade_name, tax_id, address, address_city, address_state, zip_code, ...rest } =
    sponsorProfileToPayload(v);
  return rest;
};

export const sponsorProfileToPayload = (v: SponsorProfileValue) => ({
  legal_name: v.legal_name.trim() || null,
  trade_name: v.trade_name.trim() || null,
  tax_id: v.tax_id.trim() || null,
  address: v.address.trim() || null,
  address_city: v.address_city.trim() || null,
  address_state: v.address_state.trim() || null,
  zip_code: v.zip_code.trim() || null,
  about: v.about.trim() || null,
  social_links: Object.fromEntries(Object.entries(v.social_links).filter(([, url]) => (url ?? "").trim() !== "")),
  social_stats: v.social_stats,
  locations: v.locations,
  final_location: v.final_location.trim() || null,
  fans_count: num(v.fans_count),
  prize_pool: num(v.prize_pool),
  participants_count: num(v.participants_count),
  teams_count: num(v.teams_count),
  key_notes: v.key_notes.trim() || null,
});


interface Props {
  value: SponsorProfileValue;
  onChange: (v: SponsorProfileValue) => void;
  /** Mostra Razão social / CNPJ / Endereço (apenas patrocinadores) */
  showRegistration?: boolean;
}

export function SponsorProfileFields({ value, onChange, showRegistration = true }: Props) {
  const [locationInput, setLocationInput] = useState("");
  const [loadingKeys, setLoadingKeys] = useState<string[]>([]);
  const fetchedRef = useRef<Record<string, string>>({});
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  const set = (patch: Partial<SponsorProfileValue>) => onChange({ ...value, ...patch });

  const isValidUrl = (u?: string) => !!u && /^https?:\/\/\S+\.\S+/i.test(u.trim());

  const fetchStats = async (links: Record<string, string>, silent = false) => {
    const keys = Object.keys(links);
    if (keys.length === 0) return;
    setLoadingKeys((p) => Array.from(new Set([...p, ...keys])));
    try {
      const { data, error } = await supabase.functions.invoke("fetch-social-stats", { body: { links } });
      if (error) throw error;
      const stats = (data?.stats ?? {}) as Record<string, { followers?: number; posts?: number; error?: string }>;
      const cur = latest.current.value;
      const next = { ...cur.social_stats };
      let updated = 0;
      const failed: string[] = [];
      for (const [k, s] of Object.entries(stats)) {
        if (s?.error || (s?.followers == null && s?.posts == null)) {
          failed.push(SOCIAL_NETWORKS.find((n) => n.key === k)?.label ?? k);
          continue;
        }
        next[k] = {
          ...(next[k] ?? {}),
          ...(s.followers != null ? { followers: s.followers } : {}),
          ...(s.posts != null ? { posts: s.posts } : {}),
        };
        updated++;
      }
      if (updated > 0) {
        latest.current.onChange({ ...latest.current.value, social_stats: next });
        toast.success(`Números atualizados em ${updated} rede(s).`);
      }
      if (failed.length && !silent) {
        toast.info(`Sem dados públicos em: ${failed.join(", ")}. Preencha manualmente.`);
      }
    } catch (e) {
      if (!silent) toast.error("Não foi possível buscar os números das redes sociais.");
    } finally {
      setLoadingKeys((p) => p.filter((k) => !keys.includes(k)));
    }
  };

  // Auto-atualiza os números quando uma URL válida é informada/alterada
  useEffect(() => {
    const t = setTimeout(() => {
      const pending: Record<string, string> = {};
      for (const n of SOCIAL_NETWORKS) {
        const url = (value.social_links[n.key] ?? "").trim();
        if (isValidUrl(url) && fetchedRef.current[n.key] !== url) {
          fetchedRef.current[n.key] = url;
          pending[n.key] = url;
        }
      }
      if (Object.keys(pending).length) fetchStats(pending, true);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value.social_links)]);

  const refreshAll = () => {
    const links: Record<string, string> = {};
    for (const n of SOCIAL_NETWORKS) {
      const url = (value.social_links[n.key] ?? "").trim();
      if (isValidUrl(url)) links[n.key] = url;
    }
    if (!Object.keys(links).length) return toast.info("Adicione ao menos uma URL de rede social.");
    fetchStats(links);
  };

  const addLocation = () => {
    const v = locationInput.trim();
    if (!v || value.locations.includes(v)) return setLocationInput("");
    set({ locations: [...value.locations, v] });
    setLocationInput("");
  };

  return (
    <div className="space-y-5">
      {showRegistration && (
      <div className="grid gap-3 sm:grid-cols-2">
        <div data-field="sponsor-legal_name">
          <Label>Razão social</Label>
          <Input
            value={value.legal_name}
            onChange={(e) => set({ legal_name: e.target.value })}
            placeholder="Nome empresarial completo"
          />
        </div>
        <div data-field="sponsor-trade_name">
          <Label>Nome fantasia</Label>
          <Input
            value={value.trade_name}
            onChange={(e) => set({ trade_name: e.target.value })}
            placeholder="Como a marca é conhecida"
          />
        </div>
        <div data-field="sponsor-tax_id">
          <Label>CNPJ</Label>
          <Input
            inputMode="numeric"
            value={value.tax_id}
            onChange={(e) => set({ tax_id: e.target.value })}
            placeholder="00.000.000/0000-00"
          />
        </div>
        <div data-field="sponsor-zip_code">
          <Label>CEP</Label>
          <Input
            inputMode="numeric"
            value={value.zip_code}
            onChange={(e) => set({ zip_code: e.target.value })}
            placeholder="00000-000"
          />
        </div>
        <div className="sm:col-span-2" data-field="sponsor-address">
          <Label>Endereço</Label>
          <Input
            value={value.address}
            onChange={(e) => set({ address: e.target.value })}
            placeholder="Rua, número, complemento, bairro"
          />
        </div>
        <div data-field="sponsor-address_city">
          <Label>Cidade</Label>
          <Input
            value={value.address_city}
            onChange={(e) => set({ address_city: e.target.value })}
            placeholder="São Paulo"
          />
        </div>
        <div data-field="sponsor-address_state">
          <Label>Estado (UF)</Label>
          <Input
            value={value.address_state}
            onChange={(e) => set({ address_state: e.target.value })}
            placeholder="SP"
          />
        </div>

      </div>
      )}

      <div>
        <Label>Sobre</Label>
        <Textarea
          rows={4}
          value={value.about}
          onChange={(e) => set({ about: e.target.value })}
          placeholder="Descreva a marca, o evento e o posicionamento…"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Redes sociais</Label>
          <Button type="button" size="sm" variant="outline" onClick={refreshAll} disabled={loadingKeys.length > 0}>
            {loadingKeys.length > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1">Atualizar números</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ao colar a URL, buscamos automaticamente seguidores e volume de posts quando o perfil é público. Você pode ajustar os números manualmente.
        </p>
        <div className="space-y-2">
          {SOCIAL_NETWORKS.map((n) => {
            const Icon = n.icon;
            const stat = value.social_stats[n.key] ?? {};
            const loading = loadingKeys.includes(n.key);
            const url = (value.social_links[n.key] ?? "").trim();
            return (
              <div key={n.key} className="rounded-md border p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    value={value.social_links[n.key] ?? ""}
                    onChange={(e) => set({ social_links: { ...value.social_links, [n.key]: e.target.value } })}
                    placeholder={n.placeholder}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    disabled={loading || !isValidUrl(url)}
                    onClick={() => fetchStats({ [n.key]: url })}
                    title="Atualizar números desta rede"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="number" inputMode="numeric" placeholder="Seguidores"
                    value={stat.followers ?? ""}
                    onChange={(e) => set({ social_stats: { ...value.social_stats, [n.key]: { ...stat, followers: e.target.value === "" ? null : Number(e.target.value) } } })}
                  />
                  <Input
                    type="number" step="0.01" placeholder="Engaj. %"
                    value={stat.engagement ?? ""}
                    onChange={(e) => set({ social_stats: { ...value.social_stats, [n.key]: { ...stat, engagement: e.target.value === "" ? null : Number(e.target.value) } } })}
                  />
                  <Input
                    type="number" inputMode="numeric" placeholder="Posts/mês"
                    value={stat.posts ?? ""}
                    onChange={(e) => set({ social_stats: { ...value.social_stats, [n.key]: { ...stat, posts: e.target.value === "" ? null : Number(e.target.value) } } })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>


      <div className="space-y-2">
        <Label>Locais (múltipla escolha)</Label>
        <div className="flex gap-2">
          <Input
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLocation(); } }}
            placeholder="Ex: São Paulo - SP"
          />
          <Button type="button" variant="outline" onClick={addLocation}><Plus className="h-4 w-4" /></Button>
        </div>
        {value.locations.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {value.locations.map((l) => (
              <Badge key={l} variant="secondary" className="gap-1">
                {l}
                <button type="button" onClick={() => set({ locations: value.locations.filter((x) => x !== l) })}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Local da final</Label><Input value={value.final_location} onChange={(e) => set({ final_location: e.target.value })} placeholder="Ex: Maracanã - RJ" /></div>
        <div>
          <Label>Torcedores</Label>
          <Input
            inputMode="numeric"
            value={value.fans_count}
            onChange={(e) => set({ fans_count: e.target.value.replace(/\D/g, "") })}
            placeholder="Ex: 120000"
          />
        </div>
        <div>
          <Label>Premiação (R$)</Label>
          <Input
            inputMode="decimal"
            value={value.prize_pool}
            onChange={(e) => set({ prize_pool: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") })}
            placeholder="Ex: 500000"
          />
        </div>
        <div>
          <Label>Participantes</Label>
          <Input
            inputMode="numeric"
            value={value.participants_count}
            onChange={(e) => set({ participants_count: e.target.value.replace(/\D/g, "") })}
            placeholder="Ex: 2500"
          />
        </div>
        <div>
          <Label>Times</Label>
          <Input
            inputMode="numeric"
            value={value.teams_count}
            onChange={(e) => set({ teams_count: e.target.value.replace(/\D/g, "") })}
            placeholder="Ex: 32"
          />
        </div>
      </div>


      <div>
        <Label>Observações</Label>
        <Textarea rows={3} value={value.key_notes} onChange={(e) => set({ key_notes: e.target.value })} />
      </div>
    </div>
  );
}

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export function SponsorSocialDashboard({
  links, stats,
}: { links: Record<string, string> | null; stats: Record<string, SocialStat> | null }) {
  const l = links ?? {};
  const s = stats ?? {};
  const active = SOCIAL_NETWORKS.filter((n) => (l[n.key] ?? "").trim() !== "" || s[n.key]);
  const totalFollowers = active.reduce((acc, n) => acc + Number(s[n.key]?.followers ?? 0), 0);
  const engagements = active.map((n) => Number(s[n.key]?.engagement ?? 0)).filter((v) => v > 0);
  const avgEngagement = engagements.length ? engagements.reduce((a, b) => a + b, 0) / engagements.length : 0;
  const totalPosts = active.reduce((acc, n) => acc + Number(s[n.key]?.posts ?? 0), 0);
  const top = [...active].sort((a, b) => Number(s[b.key]?.followers ?? 0) - Number(s[a.key]?.followers ?? 0))[0];

  if (active.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Dashboard de redes sociais</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Nenhuma rede social conectada. Edite a conta para adicionar links e métricas.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Dashboard de redes sociais</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Alcance total", value: fmt(totalFollowers), hint: `${active.length} rede(s)`, icon: Users },
            { label: "Engajamento médio", value: `${avgEngagement.toFixed(2)}%`, hint: "média das redes", icon: Heart },
            { label: "Posts / mês", value: fmt(totalPosts), hint: "volume declarado", icon: TrendingUp },
            { label: "Principal canal", value: top ? top.label : "—", hint: top ? `${fmt(Number(s[top.key]?.followers ?? 0))} seguidores` : "", icon: Instagram },
          ].map((k) => (
            <div key={k.label} className="rounded-md border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><k.icon className="h-3.5 w-3.5" /> {k.label}</div>
              <div className="text-lg font-bold">{k.value}</div>
              <p className="text-xs text-muted-foreground">{k.hint}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {active.map((n) => {
            const Icon = n.icon;
            const st = s[n.key] ?? {};
            const share = totalFollowers > 0 ? (Number(st.followers ?? 0) / totalFollowers) * 100 : 0;
            return (
              <div key={n.key} className="rounded-md border p-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {l[n.key] ? (
                      <a href={l[n.key]} target="_blank" rel="noopener noreferrer" className="text-sm text-primary truncate">{n.label}</a>
                    ) : <span className="text-sm">{n.label}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{fmt(Number(st.followers ?? 0))} seguidores</span>
                    <span>{Number(st.engagement ?? 0).toFixed(2)}% eng.</span>
                    <span>{fmt(Number(st.posts ?? 0))} posts/mês</span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
