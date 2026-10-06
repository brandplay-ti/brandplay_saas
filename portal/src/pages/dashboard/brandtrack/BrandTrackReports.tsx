import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BrandTrackReports = () => {
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [eventId, setEventId] = useState("all");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void supabase.from("brandtrack_events").select("id,name").then(({ data }) => setEvents(data ?? []));
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/brandtrack-report`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ event_id: eventId === "all" ? null : eventId }),
      });
      if (!resp.ok) throw new Error("Falha ao gerar relatório");
      const html = await resp.text();
      // open in new window and trigger print
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }
      toast.success("Relatório aberto — use 'Salvar como PDF' na janela de impressão");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Relatórios BrandTrack</h1>
        <p className="text-muted-foreground">Exporte um relatório executivo de exposição de marcas.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Gerar relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Filtrar por evento</label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os eventos</SelectItem>
                {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar relatório
          </Button>
          <p className="text-xs text-muted-foreground">
            O relatório abre em nova aba e dispara a impressão. Selecione "Salvar como PDF".
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default BrandTrackReports;
