import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSponsorAccess } from "@/hooks/useSponsorAccess";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, ExternalLink, Presentation } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

interface Property {
  id: string;
  name: string;
  category: string;
  status: string;
  is_published: boolean;
  public_slug: string | null;
  public_headline: string | null;
  audience_estimate: number | null;
  public_cover_path: string | null;
}

const coverUrl = (p: string | null) =>
  p ? supabase.storage.from("property-media").getPublicUrl(p).data.publicUrl : null;

/**
 * Relatórios de resultado publicados para os patrocinadores do usuário. A RLS
 * (`reports_sponsor_portal_read`, 0040) só devolve os publicados do próprio
 * patrocinador; a página abre pela `report-view`, que confere o mesmo acesso.
 */
function RelatoriosPublicados({ sponsorIds }: { sponsorIds: string[] }) {
  const { data: relatorios } = useQuery({
    queryKey: ["portal", "relatorios", sponsorIds],
    enabled: sponsorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, slug, title, subtitle, published_at")
        .in("sponsor_id", sponsorIds)
        .eq("status", "publicado")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (!relatorios?.length) return null;
  return (
    <section className="space-y-3" aria-labelledby="relatorios-publicados">
      <h2 id="relatorios-publicados" className="text-lg font-semibold">
        Relatórios de resultado
      </h2>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        {relatorios.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Presentation className="h-4 w-4 text-primary" aria-hidden /> {r.title}
              </CardTitle>
              {r.subtitle && <p className="text-xs text-muted-foreground">{r.subtitle}</p>}
            </CardHeader>
            <CardContent>
              <a
                href={`/r/${r.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" /> Abrir relatório
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default function PortalReports() {
  const { accesses } = useSponsorAccess();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  const sponsorIds = useMemo(() => accesses.map((a) => a.sponsor_id), [accesses]);

  useEffect(() => {
    if (sponsorIds.length === 0) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const { data: contracts } = await supabase
        .from("contracts")
        .select("property_id")
        .in("sponsor_id", sponsorIds)
        .not("property_id", "is", null);
      const propIds = Array.from(new Set((contracts ?? []).map((c) => c.property_id))).filter(
        Boolean,
      ) as string[];
      if (propIds.length === 0) {
        setProperties([]);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("sports_properties")
        .select(
          "id,name,category,status,is_published,public_slug,public_headline,audience_estimate,public_cover_path",
        )
        .in("id", propIds);
      setProperties((data ?? []) as Property[]);
      setLoading(false);
    })();
  }, [sponsorIds.join(",")]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios e mídia kit"
        description="Acesse os mídia kits e materiais dos projetos que você patrocina."
        icon={Briefcase}
      />

      <RelatoriosPublicados sponsorIds={sponsorIds} />

      {loading ? (
        <LoadingSkeleton variant="cards" count={3} />
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Você ainda não está vinculado a nenhum projeto.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {properties.map((p) => {
            const cover = coverUrl(p.public_cover_path);
            return (
              <Card key={p.id} className="overflow-hidden">
                {cover && (
                  <div
                    className="h-32 bg-cover bg-center bg-muted"
                    style={{ backgroundImage: `url(${cover})` }}
                  />
                )}
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {p.category}
                    </Badge>
                  </div>
                  {p.public_headline && (
                    <p className="text-xs text-muted-foreground">{p.public_headline}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {p.audience_estimate && (
                    <p className="text-xs text-muted-foreground">
                      Audiência estimada: <strong>{p.audience_estimate.toLocaleString("pt-BR")}</strong>
                    </p>
                  )}
                  {p.is_published && p.public_slug ? (
                    <Link
                      to={`/p/${p.public_slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" /> Abrir mídia kit
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Mídia kit não publicado.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
