import { useEffect, useState } from "react";
import { z } from "zod";
import { ImagePlus, Link2, Trash2, Upload, Video, ImageIcon, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MediaItem {
  id: string;
  property_id: string;
  owner_id: string;
  media_type: "photo" | "video" | "link";
  storage_path: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  position: number;
  is_cover: boolean;
}

interface Props {
  propertyId: string;
  ownerId: string;
}

const linkSchema = z.object({
  external_url: z.string().trim().url("URL inválida").max(500),
  caption: z.string().trim().max(200).optional().or(z.literal("")),
});

const MAX_FILE_MB = 15;

function getPublicUrl(path: string) {
  return supabase.storage.from("property-media").getPublicUrl(path).data.publicUrl;
}

function isVideoExt(name: string) {
  return /\.(mp4|webm|mov|m4v)$/i.test(name);
}

export default function PropertyMediaGallery({ propertyId, ownerId }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ external_url: "", caption: "" });

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("property_media")
      .select("*")
      .eq("property_id", propertyId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    setItems((data as MediaItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${file.name}: maior que ${MAX_FILE_MB}MB`);
        continue;
      }
      const ext = file.name.split(".").pop();
      const path = `${ownerId}/${propertyId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("property-media")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) {
        toast.error(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { error: insErr } = await (supabase as any).from("property_media").insert({
        property_id: propertyId,
        owner_id: ownerId,
        media_type: isVideoExt(file.name) ? "video" : "photo",
        storage_path: path,
        caption: null,
        position: items.length + ok,
      });
      if (insErr) {
        toast.error(insErr.message);
        continue;
      }
      ok++;
    }
    setUploading(false);
    if (ok > 0) toast.success(`${ok} mídia(s) enviada(s)`);
    load();
  };

  const addLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = linkSchema.safeParse(linkForm);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      toast.error(first ?? "Verifique os campos");
      return;
    }
    const { error } = await (supabase as any).from("property_media").insert({
      property_id: propertyId,
      owner_id: ownerId,
      media_type: "link",
      external_url: linkForm.external_url.trim(),
      caption: linkForm.caption.trim() || null,
      position: items.length,
    });
    if (error) return toast.error(error.message);
    toast.success("Link adicionado");
    setLinkOpen(false);
    setLinkForm({ external_url: "", caption: "" });
    load();
  };

  const removeItem = async (item: MediaItem) => {
    if (!confirm("Excluir esta mídia?")) return;
    if (item.storage_path) {
      await supabase.storage.from("property-media").remove([item.storage_path]);
    }
    const { error } = await (supabase as any)
      .from("property_media")
      .delete()
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Mídia removida");
    load();
  };

  const toggleCover = async (item: MediaItem) => {
    if (item.media_type === "link") return;
    // unset existing covers, set this one
    await (supabase as any)
      .from("property_media")
      .update({ is_cover: false })
      .eq("property_id", propertyId);
    const { error } = await (supabase as any)
      .from("property_media")
      .update({ is_cover: !item.is_cover })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success(item.is_cover ? "Capa removida" : "Definida como capa");
    load();
  };

  const updateCaption = async (item: MediaItem, caption: string) => {
    const { error } = await (supabase as any)
      .from("property_media")
      .update({ caption: caption || null })
      .eq("id", item.id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Fotos, vídeos curtos e links externos. Aparecem na página pública.
        </p>
        <div className="flex gap-2">
          <Label className="cursor-pointer">
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
              <span>
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Enviar arquivos
              </span>
            </Button>
          </Label>
          <Button size="sm" onClick={() => setLinkOpen(true)}>
            <Link2 className="h-4 w-4 mr-1" /> Adicionar link
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImagePlus className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma mídia ainda. Envie fotos ou cole links de YouTube/Drive.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((m) => {
            const url = m.storage_path ? getPublicUrl(m.storage_path) : m.external_url;
            return (
              <Card key={m.id} className="overflow-hidden group relative">
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {m.media_type === "photo" && url && (
                    <img src={url} alt={m.caption ?? ""} className="w-full h-full object-cover" loading="lazy" />
                  )}
                  {m.media_type === "video" && url && (
                    <video src={url} className="w-full h-full object-cover" muted />
                  )}
                  {m.media_type === "link" && (
                    <a
                      href={m.external_url ?? "#"}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex flex-col items-center justify-center h-full text-muted-foreground hover:text-primary transition"
                    >
                      <Video className="h-8 w-8 mb-1" />
                      <span className="text-xs px-2 truncate max-w-full">
                        {m.external_url}
                      </span>
                    </a>
                  )}
                  {m.is_cover && (
                    <Badge className="absolute top-2 left-2 gap-1">
                      <Star className="h-3 w-3" /> Capa
                    </Badge>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    {m.media_type !== "link" && (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7"
                        onClick={() => toggleCover(m)}
                        title={m.is_cover ? "Remover capa" : "Definir como capa"}
                      >
                        <Star className={`h-3.5 w-3.5 ${m.is_cover ? "fill-current" : ""}`} />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-7 w-7"
                      onClick={() => removeItem(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <CardContent className="p-2">
                  <Input
                    defaultValue={m.caption ?? ""}
                    placeholder="Legenda..."
                    className="h-7 text-xs border-0 px-1 focus-visible:ring-1"
                    maxLength={200}
                    onBlur={(e) => {
                      if (e.target.value !== (m.caption ?? "")) {
                        updateCaption(m, e.target.value);
                      }
                    }}
                  />
                  <Badge variant="outline" className="text-[10px] mt-1 capitalize">
                    {m.media_type === "photo" ? (
                      <ImageIcon className="h-2.5 w-2.5 mr-1" />
                    ) : (
                      <Video className="h-2.5 w-2.5 mr-1" />
                    )}
                    {m.media_type}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar link externo</DialogTitle>
            <DialogDescription>
              Cole o link de YouTube, Vimeo, Drive, álbum de fotos etc.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addLink} className="space-y-3">
            <div className="space-y-1.5">
              <Label>URL *</Label>
              <Input
                required
                type="url"
                placeholder="https://youtube.com/..."
                value={linkForm.external_url}
                onChange={(e) => setLinkForm({ ...linkForm, external_url: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Legenda</Label>
              <Input
                maxLength={200}
                value={linkForm.caption}
                onChange={(e) => setLinkForm({ ...linkForm, caption: e.target.value })}
                placeholder="Aftermovie 2024"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Adicionar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
