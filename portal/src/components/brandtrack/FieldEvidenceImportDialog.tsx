import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Smartphone, Loader2, Image as ImageIcon, Video, Package, Building2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type FieldAttachment = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  kind: string | null;
  taken_at: string | null;
  geo: { lat?: number; lng?: number } | null;
  delivery: {
    id: string;
    title: string | null;
    brand: string | null;
    asset_type: string | null;
    contract_id: string | null;
    sponsor: { id: string; name: string } | null;
  } | null;

};

type LinkedAsset = { id: string | null; name: string; category: string | null };


type Props = {
  eventId: string;
  /** IDs of delivery_attachments that should be disabled (already imported). */
  excludedIds?: string[];
  /** Called for each imported media so the parent can trigger the proper analysis. */
  onImported: (mediaId: string, file: File, isImage: boolean, attachmentId: string) => void;
  onFinished?: () => void;
};

const FieldEvidenceImportDialog = ({ eventId, excludedIds = [], onImported, onFinished }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FieldAttachment[]>([]);
  const [assetByDelivery, setAssetByDelivery] = useState<Record<string, LinkedAsset>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("delivery_attachments")
        .select(
          "id,storage_path,file_name,mime_type,kind,taken_at,geo,delivery:deliveries(id,title,brand,asset_type,contract_id,sponsor:sponsors(id,name))"
        )
        .in("kind", ["image", "video"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) toast.error(error.message);
      const list = (data as FieldAttachment[]) ?? [];
      setItems(list);

      // Resolve the catalog asset behind each delivery (contract asset name match)
      const contractIds = Array.from(
        new Set(list.map((a) => a.delivery?.contract_id).filter(Boolean) as string[])
      );
      const map: Record<string, LinkedAsset> = {};
      if (contractIds.length > 0) {
        const { data: cas } = await (supabase as any)
          .from("contract_assets")
          .select("contract_id,name,asset_id,asset:assets(id,name,category)")
          .in("contract_id", contractIds);
        const byKey = new Map<string, LinkedAsset>();
        for (const ca of (cas as any[]) ?? []) {
          const key = `${ca.contract_id}::${String(ca.name ?? "").trim().toLowerCase()}`;
          byKey.set(key, {
            id: ca.asset_id ?? ca.asset?.id ?? null,
            name: ca.asset?.name ?? ca.name,
            category: ca.asset?.category ?? null,
          });
        }
        for (const a of list) {
          const d = a.delivery;
          if (!d?.contract_id || !d.title) continue;
          const hit = byKey.get(`${d.contract_id}::${d.title.trim().toLowerCase()}`);
          if (hit) map[d.id] = hit;
        }
      }
      setAssetByDelivery(map);
      setLoading(false);
    })();
  }, [open]);

  const assetOf = (a: FieldAttachment) => (a.delivery?.id ? assetByDelivery[a.delivery.id] : undefined);

  const term = search.trim().toLowerCase();
  const filtered = items.filter((a) => {
    if (!term) return true;
    return [a.file_name, a.delivery?.title, a.delivery?.brand, a.delivery?.asset_type, assetOf(a)?.name, assetOf(a)?.category]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(term));
  });


  const toggle = (id: string) => {
    if (isExcluded(id)) return;
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const isExcluded = (id: string) => excludedIds.includes(id);

  const availableFiltered = filtered.filter((a) => !isExcluded(a.id));
  const allSelected = availableFiltered.length > 0 && availableFiltered.every((a) => selected.includes(a.id));
  const toggleAll = () =>
    setSelected(allSelected ? [] : Array.from(new Set([...selected, ...availableFiltered.map((a) => a.id)])));

  const importSelected = async () => {
    if (!user) return;
    if (!eventId) {
      toast.error("Escolha uma propriedade antes de importar.");
      return;
    }
    const toImport = selected.filter((id) => !isExcluded(id));
    if (toImport.length === 0) return;
    setImporting(true);
    let ok = 0;
    for (const id of toImport) {
      const att = items.find((a) => a.id === id);
      if (!att) continue;
      try {
        const { data: signed, error: signErr } = await supabase.storage
          .from("delivery-evidence")
          .createSignedUrl(att.storage_path, 3600);
        if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? "Falha ao ler arquivo de campo");

        const blob = await (await fetch(signed.signedUrl)).blob();
        const isImage = (att.kind ?? "") === "image" || blob.type.startsWith("image/");
        const contentType = att.mime_type || blob.type || (isImage ? "image/jpeg" : "video/mp4");
        const ext = att.storage_path.split(".").pop() || (isImage ? "jpg" : "mp4");
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("brandtrack-media")
          .upload(path, blob, { contentType });
        if (upErr) throw upErr;

        const linked = assetOf(att);
        const origin = linked?.name || att.delivery?.title;
        const title = origin ? `${origin} — ${att.file_name}` : att.file_name;


        const { data: media, error: insErr } = await supabase
          .from("brandtrack_media")
          .insert({
            owner_id: user.id,
            event_id: eventId,
            title,
            media_type: isImage ? "image" : "video",
            storage_path: path,
            file_size: blob.size,
            status: "queued",
            progress: 0,
          } as any)
          .select()
          .single();
        if (insErr) throw insErr;

        onImported(media.id, new File([blob], att.file_name, { type: contentType }), isImage, att.id);
        ok += 1;
      } catch (e) {
        toast.error(`${att.file_name}: ${e instanceof Error ? e.message : "falha na importação"}`);
      }
    }
    setImporting(false);
    setSelected([]);
    if (ok > 0) toast.success(`${ok} evidência(s) importada(s) do app de campo`);
    setOpen(false);
    onFinished?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Smartphone className="h-4 w-4" /> Importar do app de campo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fotos e vídeos dos ativos (app de campo)</DialogTitle>
          <DialogDescription>
            Selecione as evidências enviadas nas entregas para analisar exposição de marcas.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por entrega, ativo, marca ou arquivo"
        />

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando evidências…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma evidência de campo encontrada.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={availableFiltered.length === 0} />
              <span>Selecionar todos ({availableFiltered.length})</span>
            </div>
            <ScrollArea className="h-80 rounded-md border">
              <div className="divide-y">
                {filtered.map((a) => {
                  const excluded = isExcluded(a.id);
                  return (
                    <label
                      key={a.id}
                      className={`flex items-start gap-3 p-3 ${excluded ? "bg-muted/30 opacity-60" : "cursor-pointer hover:bg-muted/40"}`}
                    >
                      <Checkbox
                        checked={selected.includes(a.id)}
                        onCheckedChange={() => !excluded && toggle(a.id)}
                        disabled={excluded}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {a.kind === "video" ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                          <span className="truncate">{a.file_name}</span>
                          {excluded && (
                            <Badge variant="outline" className="ml-2 gap-1 text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3" /> Já importado
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {assetOf(a) ? (
                            <Badge variant="default" className="gap-1">
                              <Package className="h-3 w-3" /> {assetOf(a)!.name}
                            </Badge>
                          ) : (
                            a.delivery?.title && <Badge variant="outline">{a.delivery.title}</Badge>
                          )}
                          {assetOf(a)?.category && <Badge variant="secondary">{assetOf(a)!.category}</Badge>}
                          {assetOf(a) && a.delivery?.title && (
                            <span className="truncate">Entrega: {a.delivery.title}</span>
                          )}
                          {a.delivery?.sponsor?.name && (
                            <Badge variant="outline" className="gap-1">
                              <Building2 className="h-3 w-3" /> {a.delivery.sponsor.name}
                            </Badge>
                          )}

                          {a.taken_at && <span>{new Date(a.taken_at).toLocaleString("pt-BR")}</span>}
                        </div>

                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button onClick={() => void importSelected()} disabled={importing || selected.length === 0}>
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Importar {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FieldEvidenceImportDialog;
