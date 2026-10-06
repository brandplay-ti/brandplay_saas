import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSponsorAccess } from "@/hooks/useSponsorAccess";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, ExternalLink } from "lucide-react";

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
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-primary" /> Relatórios e mídia kit
        </h1>
        <p className="text-sm text-muted-foreground">
          Acesse os mídia kits e materiais das propriedades onde você é patrocinador.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Você ainda não está vinculado a nenhuma propriedade.
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
