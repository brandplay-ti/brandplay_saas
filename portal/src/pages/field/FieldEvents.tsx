import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, ChevronRight, ListChecks } from "lucide-react";

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  status: string;
  property_id: string;
  property?: { name: string } | null;
  pending: number;
  total: number;
};

const FieldEvents = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: evs } = await supabase
        .from("property_events")
        .select("id, title, starts_at, ends_at, location, status, property_id, sports_properties(name)")
        .gte("starts_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(50);

      const list = (evs as unknown as Array<EventRow & { sports_properties?: { name: string } }>) || [];
      const ids = list.map((e) => e.id);
      let counts: Record<string, { total: number; pending: number }> = {};
      if (ids.length) {
        const { data: items } = await supabase
          .from("property_checklist_items")
          .select("event_id, status")
          .in("event_id", ids);
        (items || []).forEach((i) => {
          const k = i.event_id as string;
          if (!counts[k]) counts[k] = { total: 0, pending: 0 };
          counts[k].total++;
          if (i.status !== "concluido") counts[k].pending++;
        });
      }

      setEvents(
        list.map((e) => ({
          ...e,
          property: e.sports_properties || null,
          pending: counts[e.id]?.pending || 0,
          total: counts[e.id]?.total || 0,
        })),
      );
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="px-4 pt-4 space-y-4">
      <div>
        <h2 className="text-xl font-bold">Eventos</h2>
        <p className="text-xs text-muted-foreground">Checklist de campo por evento</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum evento próximo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <Link key={ev.id} to={`/campo/eventos/${ev.id}`}>
              <Card className="p-4 active:scale-[0.99] transition-transform">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm leading-tight">{ev.title}</h3>
                    {ev.property?.name && <p className="text-xs text-muted-foreground mt-0.5">{ev.property.name}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(ev.starts_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {ev.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3" />
                          {ev.location}
                        </span>
                      )}
                    </div>
                    {ev.total > 0 && (
                      <Badge variant="secondary" className="mt-2 text-[10px]">
                        <ListChecks className="w-3 h-3 mr-1" />
                        {ev.total - ev.pending}/{ev.total} itens
                      </Badge>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default FieldEvents;
