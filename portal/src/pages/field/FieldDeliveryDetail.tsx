import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Camera,
  ImagePlus,
  Paperclip,
  MapPin,
  Loader2,
  CheckCircle2,
  Trash2,
  FileText,
  File as FileIcon,
} from "lucide-react";
import { toast } from "sonner";
import { captureGeo, compressImage, detectKind } from "@/lib/fieldUtils";
import { dataLocal } from "@/lib/datas";

const MAX_ATTACHMENTS = 10;

type Delivery = {
  id: string;
  title: string;
  brand: string;
  description: string | null;
  status: string;
  approval: string;
  due_date: string | null;
  delivered_at: string | null;
  notes: string | null;
  quantity: number;
  organization_id: string | null;
  property_id: string | null;
};

type Attachment = {
  id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  kind: string;
  geo: { lat: number; lng: number } | null;
  taken_at: string | null;
  created_at: string;
  url?: string;
};

const FieldDeliveryDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAttachments = useCallback(async (deliveryId: string) => {
    const { data } = await supabase
      .from("delivery_attachments")
      .select("id, storage_path, file_name, mime_type, kind, geo, taken_at, created_at")
      .eq("delivery_id", deliveryId)
      .order("created_at", { ascending: true });
    if (!data) return;
    const withUrls = await Promise.all(
      data.map(async (a) => {
        const { data: signed } = await supabase.storage
          .from("delivery-evidence")
          .createSignedUrl(a.storage_path, 60 * 60 * 24);
        return { ...(a as Attachment), url: signed?.signedUrl };
      }),
    );
    setAttachments(withUrls);
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("deliveries")
        .select(
          "id, title, brand, description, status, approval, due_date, delivered_at, notes, quantity, organization_id, property_id",
        )
        .eq("id", id)
        .maybeSingle();
      if (data) {
        setDelivery(data as Delivery);
        setNotes(data.notes || "");
        await loadAttachments(data.id);
      }
      setLoading(false);
    })();
  }, [id, loadAttachments]);

  const uploadFiles = async (files: FileList | File[]) => {
    if (!delivery || !user) return;
    const targetOrg = delivery.organization_id || orgId;
    if (!targetOrg) {
      toast.error("Organização não encontrada");
      return;
    }
    const arr = Array.from(files);
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      toast.error(`Limite de ${MAX_ATTACHMENTS} anexos atingido`);
      return;
    }
    const toUpload = arr.slice(0, remaining);
    if (arr.length > remaining) {
      toast.warning(`Apenas ${remaining} arquivo(s) serão enviados (máx. ${MAX_ATTACHMENTS})`);
    }

    setUploading(true);
    try {
      const geo = await captureGeo();
      for (const file of toUpload) {
        const kind = detectKind(file);
        let body: Blob = file;
        let contentType = file.type || "application/octet-stream";
        let ext = file.name.split(".").pop() || "bin";

        if (kind === "image") {
          body = await compressImage(file);
          contentType = "image/jpeg";
          ext = "jpg";
        }

        const path = `${targetOrg}/${delivery.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("delivery-evidence")
          .upload(path, body, { contentType, upsert: false });
        if (upErr) throw upErr;

        const { error: insErr } = await supabase.from("delivery_attachments").insert([
          {
            delivery_id: delivery.id,
            owner_id: user.id,
            uploaded_by: user.id,
            storage_path: path,
            file_name: file.name,
            mime_type: contentType,
            size_bytes: body.size,
            kind,
            geo: (geo as unknown) as never,
            taken_at: new Date().toISOString(),
          },
        ]);
        if (insErr) throw insErr;
      }
      toast.success(`${toUpload.length} arquivo(s) anexado(s)`);
      await loadAttachments(delivery.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (att: Attachment) => {
    if (!confirm("Remover este anexo?")) return;
    const { error } = await supabase.from("delivery_attachments").delete().eq("id", att.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.storage.from("delivery-evidence").remove([att.storage_path]);
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    toast.success("Anexo removido");
  };

  const handleSubmit = async (markDelivered: boolean) => {
    if (!delivery || !user) return;
    setSaving(true);
    try {
      const update: {
        notes: string;
        evidence_taken_by: string;
        status?: "entregue";
        delivered_at?: string;
      } = { notes, evidence_taken_by: user.id };
      if (markDelivered) {
        update.status = "entregue";
        update.delivered_at = new Date().toISOString().slice(0, 10);
      }
      const { error } = await supabase.from("deliveries").update(update).eq("id", delivery.id);
      if (error) throw error;
      toast.success(markDelivered ? "Entrega registrada!" : "Notas salvas");
      navigate("/campo");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;
  if (!delivery) return <div className="p-8 text-center">Entrega não encontrada</div>;

  const isDone = delivery.status === "entregue" || delivery.status === "aprovada";
  const canAddMore = attachments.length < MAX_ATTACHMENTS;

  return (
    <div className="pb-4">
      <div className="px-4 pt-3 pb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/campo")} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
      </div>

      <div className="px-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1">
              <h2 className="font-bold leading-tight">{delivery.title}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{delivery.brand}</p>
            </div>
            {isDone && (
              <Badge className="bg-green-500/10 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Entregue
              </Badge>
            )}
          </div>
          {delivery.description && <p className="text-sm text-muted-foreground">{delivery.description}</p>}
          {delivery.due_date && (
            <p className="text-xs text-muted-foreground mt-2">
              Prazo: {dataLocal(delivery.due_date).toLocaleDateString("pt-BR")} · Quantidade: {delivery.quantity}
            </p>
          )}
        </Card>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Anexos</h3>
            <span className="text-xs text-muted-foreground">
              {attachments.length}/{MAX_ATTACHMENTS}
            </span>
          </div>

          {attachments.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {attachments.map((att) => (
                <div key={att.id} className="relative group rounded-lg overflow-hidden border bg-muted/30 aspect-square">
                  {att.kind === "image" && att.url ? (
                    <a href={att.url} target="_blank" rel="noreferrer">
                      <img src={att.url} alt={att.file_name || ""} className="w-full h-full object-cover" />
                    </a>
                  ) : (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center"
                    >
                      {att.kind === "pdf" ? (
                        <FileText className="w-8 h-8 text-red-500" />
                      ) : att.kind === "doc" ? (
                        <FileText className="w-8 h-8 text-blue-500" />
                      ) : (
                        <FileIcon className="w-8 h-8 text-muted-foreground" />
                      )}
                      <span className="text-[10px] text-muted-foreground line-clamp-2 break-all">
                        {att.file_name || att.kind}
                      </span>
                    </a>
                  )}
                  <button
                    onClick={() => removeAttachment(att)}
                    className="absolute top-1 right-1 bg-background/90 hover:bg-destructive hover:text-destructive-foreground rounded-md p-1 shadow-sm transition-colors"
                    aria-label="Remover"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {att.geo && (
                    <div className="absolute bottom-1 left-1 bg-background/80 backdrop-blur rounded px-1 py-0.5 text-[9px] flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" />
                      GPS
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {canAddMore ? (
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-auto flex-col gap-1 py-3"
                disabled={uploading}
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="w-5 h-5" />
                <span className="text-xs">Câmera</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col gap-1 py-3"
                disabled={uploading}
                onClick={() => galleryRef.current?.click()}
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-xs">Galeria</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col gap-1 py-3"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="w-5 h-5" />
                <span className="text-xs">Arquivo</span>
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              Limite de {MAX_ATTACHMENTS} anexos atingido
            </p>
          )}

          {uploading && (
            <div className="flex items-center justify-center gap-2 mt-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Enviando…
            </div>
          )}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf,.doc,.docx,.odt,.rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Notas (opcional)</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações sobre a entrega…"
            rows={3}
          />
        </div>

        <div className="space-y-2 pt-2">
          <Button
            className="w-full h-12"
            disabled={saving || attachments.length === 0}
            onClick={() => handleSubmit(true)}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Marcar como entregue
          </Button>
          <Button
            variant="outline"
            className="w-full h-11"
            disabled={saving}
            onClick={() => handleSubmit(false)}
          >
            Salvar sem concluir
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FieldDeliveryDetail;
