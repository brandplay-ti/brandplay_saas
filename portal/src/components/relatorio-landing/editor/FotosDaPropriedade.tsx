import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { useEnviarFotos, useFotosDaPropriedade, useSalvarFoto, type FotoDaPropriedade } from "@/hooks/useRelatorios";
import { cn } from "@/lib/utils";

const NENHUM = "nenhum";
const MAX_MB = 15;

const urlDaFoto = (path: string) =>
  supabase.storage.from("property-media").getPublicUrl(path, { transform: { width: 480, quality: 70 } }).data.publicUrl;

const etiquetasDe = (texto: string) =>
  [...new Set(texto.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 12).map((t) => t.slice(0, 40));

interface Props {
  propertyId: string;
  userId: string;
  patrocinadores: { id: string; name: string }[];
  momentos: { id: string; title: string }[];
  podeEditar: boolean;
}

function CartaoDaFoto({
  foto,
  patrocinadores,
  momentos,
  podeEditar,
  salvar,
}: {
  foto: FotoDaPropriedade;
  patrocinadores: Props["patrocinadores"];
  momentos: Props["momentos"];
  podeEditar: boolean;
  salvar: (campos: Partial<FotoDaPropriedade>) => void;
}) {
  const [legenda, setLegenda] = useState(foto.caption ?? "");
  const [etiquetas, setEtiquetas] = useState(foto.tags.join(", "));
  const id = foto.id.slice(0, 8);

  return (
    <Card className={cn("overflow-hidden", foto.contains_minors && "ring-2 ring-warning")}>
      <div className="relative aspect-[4/3] bg-muted">
        <img src={urlDaFoto(foto.storage_path!)} alt={foto.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
        {foto.contains_minors && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-warning px-2 py-0.5 text-xs font-semibold text-warning-foreground">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Menores: fora do público
          </span>
        )}
      </div>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <Label htmlFor={`legenda-${id}`} className="text-xs">Legenda</Label>
          <Input
            id={`legenda-${id}`}
            value={legenda}
            maxLength={300}
            disabled={!podeEditar}
            onChange={(e) => setLegenda(e.target.value)}
            onBlur={() => legenda !== (foto.caption ?? "") && salvar({ caption: legenda.trim() || null })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Momento</Label>
            <Select
              value={foto.event_id ?? NENHUM}
              disabled={!podeEditar}
              onValueChange={(v) => salvar({ event_id: v === NENHUM ? null : v })}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Nenhum</SelectItem>
                {momentos.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Patrocinador</Label>
            <Select
              value={foto.sponsor_id ?? NENHUM}
              disabled={!podeEditar}
              onValueChange={(v) => salvar({ sponsor_id: v === NENHUM ? null : v })}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Geral</SelectItem>
                {patrocinadores.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`etiquetas-${id}`} className="text-xs">Etiquetas (separadas por vírgula)</Label>
          <Input
            id={`etiquetas-${id}`}
            value={etiquetas}
            placeholder="Uniformes, Placas de campo"
            disabled={!podeEditar}
            onChange={(e) => setEtiquetas(e.target.value)}
            onBlur={() => {
              const novas = etiquetasDe(etiquetas);
              if (novas.join("|") !== foto.tags.join("|")) salvar({ tags: novas });
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2">
          <Label htmlFor={`menores-${id}`} className="text-xs leading-snug">
            Contém menores de idade
          </Label>
          <Switch
            id={`menores-${id}`}
            checked={foto.contains_minors}
            disabled={!podeEditar}
            onCheckedChange={(v) => salvar({ contains_minors: v })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function FotosDaPropriedade({ propertyId, userId, patrocinadores, momentos, podeEditar }: Props) {
  const { data: fotos, isLoading } = useFotosDaPropriedade(propertyId);
  const salvarFoto = useSalvarFoto(propertyId);
  const enviar = useEnviarFotos(propertyId, userId);

  const salvar = (id: string) => (campos: Partial<FotoDaPropriedade>) =>
    salvarFoto.mutate(
      { id, ...campos },
      { onError: (erro) => toast.error("Não foi possível salvar a foto", { description: erro.message }) },
    );

  const aoEscolher = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const arquivos = Array.from(lista).filter((f) => {
      if (f.size > MAX_MB * 1024 * 1024) {
        toast.error(`${f.name}: maior que ${MAX_MB} MB`);
        return false;
      }
      return f.type.startsWith("image/");
    });
    if (!arquivos.length) return;
    const r = await enviar.mutateAsync(arquivos);
    if (r.enviadas) toast.success(`${r.enviadas} foto(s) enviada(s)`);
    if (r.falhas.length) toast.error(`Não foi possível enviar: ${r.falhas.join(", ")}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Fotos da galeria do projeto. Ligue cada uma a um momento e a um patrocinador para montar a jornada e o acervo
          do relatório dele. Foto marcada com <strong>menores de idade</strong> nunca aparece num relatório público.
        </p>
        <Label
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring",
            (!podeEditar || enviar.isPending) && "pointer-events-none opacity-50",
          )}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={!podeEditar || enviar.isPending}
            onChange={(e) => {
              aoEscolher(e.target.files);
              e.target.value = "";
            }}
          />
          {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Enviar fotos
        </Label>
      </div>
      {isLoading ? (
        <LoadingSkeleton variant="cards" count={3} />
      ) : !fotos?.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma foto na galeria deste projeto.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {fotos.map((f) => (
            <CartaoDaFoto
              key={f.id}
              foto={f}
              patrocinadores={patrocinadores}
              momentos={momentos}
              podeEditar={podeEditar}
              salvar={salvar(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
