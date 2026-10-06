import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Camera, CheckCircle2, Loader2, Circle } from "lucide-react";
import { toast } from "sonner";
import { captureGeo, compressImage } from "@/lib/fieldUtils";

type Item = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  evidence_path: string | null;
  evidence_url?: string | null;
  position: number;
};

type Event = { id: string; title: string; property_id: string };

const FieldEventChecklist = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const [event, setEvent] = useState<Event | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    const { data: ev } = await supabase
      .from("property_events")
      .select("id, title, property_id")
      .eq("id", id)
      .maybeSingle();
    setEvent(ev as Event | null);

    const { data } = await supabase
      .from("property_checklist_items")
      .select("id, title, description, status, evidence_path, position")
      .eq("event_id", id)
      .order("position", { ascending: true });

    const list = (data as Item[]) || [];
    // sign URLs for previews
    const withUrls = await Promise.all(
      list.map(async (it) => {
        if (!it.evidence_path) return it;
        const { data: signed } = await supabase.storage.from("delivery-evidence").createSignedUrl(it.evidence_path, 3600);
        return { ...it, evidence_url: signed?.signedUrl || null };
      }),
    );
    setItems(withUrls);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const triggerCamera = (itemId: string) => {
    setActiveItemId(itemId);
    setTimeout(() => fileRef.current?.click(), 50);
  };

  const handleFile = async (file: File) => {
    if (!activeItemId || !user || !event) return;
    if (!orgId) {
      toast.error("Organização não encontrada");
      return;
    }
    setSavingId(activeItemId);
    try {
      const [blob, geo] = await Promise.all([compressImage(file), captureGeo()]);
      const path = `${orgId}/checklist-${activeItemId}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("delivery-evidence").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (upErr) throw upErr;

      const { error } = await supabase
        .from("property_checklist_items")
        .update({
          status: "concluido",
          evidence_path: path,
          evidence_geo: geo,
          evidence_taken_at: new Date().toISOString(),
          evidence_taken_by: user.id,
        })
        .eq("id", activeItemId);
      if (error) throw error;

      toast.success("Item concluído");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      toast.error(msg);
    } finally {
      setSavingId(null);
      setActiveItemId(null);
    }
  };

  const toggleStatus = async (item: Item) => {
    if (item.status === "concluido") {
      setSavingId(item.id);
      const { error } = await supabase
        .from("property_checklist_items")
        .update({ status: "pendente" })
        .eq("id", item.id);
      setSavingId(null);
      if (error) toast.error(error.message);
      else load();
    } else {
      triggerCamera(item.id);
    }
  };

  const done = items.filter((i) => i.status === "concluido").length;
  const total = items.length;
  const pct = total ? (done / total) * 100 : 0;

  return (
    <div className="pb-4">
      <div className="px-4 pt-3 pb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/campo/eventos")} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" /> Eventos
        </Button>
      </div>

      <div className="px-4 space-y-4">
        <Card className="p-4">
          <h2 className="font-bold leading-tight">{event?.title || "Checklist"}</h2>
          <div className="mt-3 flex items-center gap-3">
            <Progress value={pct} className="flex-1 h-2" />
            <span className="text-xs font-semibold text-muted-foreground">{done}/{total}</span>
          </div>
        </Card>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum item de checklist para este evento.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const done = item.status === "concluido";
              return (
                <Card key={item.id} className={`p-3 ${done ? "bg-muted/30" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleStatus(item)}
                      disabled={savingId === item.id}
                      className="flex-shrink-0 mt-0.5"
                    >
                      {savingId === item.id ? (
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      ) : done ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                      ) : (
                        <Circle className="w-6 h-6 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-tight ${done ? "line-through text-muted-foreground" : ""}`}>
                        {item.title}
                      </p>
                      {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                      {item.evidence_url && (
                        <img src={item.evidence_url} alt="" className="mt-2 w-20 h-20 rounded-md object-cover" />
                      )}
                    </div>
                    {!done && (
                      <Button size="icon" variant="outline" className="flex-shrink-0" onClick={() => triggerCamera(item.id)}>
                        <Camera className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
};

export default FieldEventChecklist;
