import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ExternalLink, Link2, Loader2, Pencil, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { useConfirm } from "@/hooks/useConfirm";
import {
  buscarPreviaDoLink,
  useAtualizarMetricas,
  useExcluirPost,
  usePostsDaPropriedade,
  useSalvarPost,
  type PostDaPropriedade,
} from "@/hooks/useRelatorios";
import { identificarLink, REDES, rotuloDaRede, TIPOS_DE_POST, type Rede, type TipoDePost } from "@/lib/redesSociais";
import { numeroCompacto } from "@/lib/relatorioLanding";
import { IconeDaRede } from "../primitivos";

const NENHUM = "nenhum";

const metrica = z
  .string()
  .trim()
  .transform((v) => v.replace(/\./g, ""))
  .refine((v) => v === "" || /^\d{1,15}$/.test(v), "Use só números, sem vírgula")
  .transform((v) => (v === "" ? null : Number(v)));

const postSchema = z.object({
  url: z.string().trim().min(1, "Cole o link").max(2048),
  rede: z.enum(["instagram", "youtube", "tiktok", "facebook", "x", "linkedin", "site"]),
  kind: z.enum(["post", "reel", "video", "story", "live", "materia", "link"]),
  title: z.string().trim().max(200).transform((v) => v || null),
  source_name: z.string().trim().max(120).transform((v) => v || null),
  published_at: z.string().trim().transform((v) => v || null),
  sponsor_id: z.string(),
  event_id: z.string(),
  is_highlight: z.boolean(),
  views: metrica,
  likes: metrica,
  comments: metrica,
  shares: metrica,
});

type Formulario = z.input<typeof postSchema>;

const vazio: Formulario = {
  url: "",
  rede: "site",
  kind: "post",
  title: "",
  source_name: "",
  published_at: "",
  sponsor_id: NENHUM,
  event_id: NENHUM,
  is_highlight: false,
  views: "",
  likes: "",
  comments: "",
  shares: "",
};

const doPost = (p: PostDaPropriedade): Formulario => ({
  url: p.url,
  rede: p.network as Rede,
  kind: p.kind as TipoDePost,
  title: p.title ?? "",
  source_name: p.source_name ?? "",
  published_at: p.published_at ?? "",
  sponsor_id: p.sponsor_id ?? NENHUM,
  event_id: p.event_id ?? NENHUM,
  is_highlight: p.is_highlight,
  views: p.views?.toString() ?? "",
  likes: p.likes?.toString() ?? "",
  comments: p.comments?.toString() ?? "",
  shares: p.shares?.toString() ?? "",
});

interface Props {
  propertyId: string;
  patrocinadores: { id: string; name: string }[];
  momentos: { id: string; title: string }[];
  podeEditar: boolean;
}

export function PostsDaPropriedade({ propertyId, patrocinadores, momentos, podeEditar }: Props) {
  const confirm = useConfirm();
  const { data: posts, isLoading } = usePostsDaPropriedade(propertyId);
  const salvar = useSalvarPost(propertyId);
  const excluir = useExcluirPost(propertyId);
  const atualizar = useAtualizarMetricas(propertyId);
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<PostDaPropriedade | null>(null);
  const [form, setForm] = useState<Formulario>(vazio);
  const [lendo, setLendo] = useState(false);
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const nomeDoPatrocinador = new Map(patrocinadores.map((p) => [p.id, p.name]));

  const abrir = (post?: PostDaPropriedade) => {
    setEditando(post ?? null);
    setForm(post ? doPost(post) : vazio);
    setMiniatura(null);
    setAberto(true);
  };

  const lerLink = async () => {
    const local = identificarLink(form.url);
    if (!local) {
      toast.error("Link inválido. Use um endereço que comece com https://");
      return;
    }
    setForm((f) => ({ ...f, url: local.url, rede: local.rede, kind: local.tipo }));
    setLendo(true);
    try {
      const previa = await buscarPreviaDoLink(local.url);
      setMiniatura(previa.miniatura);
      setForm((f) => ({
        ...f,
        title: f.title || previa.titulo || "",
        source_name: f.source_name || previa.autor || "",
      }));
    } catch {
      // Sem prévia: a rede e o tipo já vieram do link.
    } finally {
      setLendo(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = postSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os campos");
      return;
    }
    const link = identificarLink(parsed.data.url);
    if (!link) {
      toast.error("Link inválido. Use um endereço que comece com https://");
      return;
    }
    const { rede, sponsor_id, event_id, ...resto } = parsed.data;
    // Número digitado à mão vira métrica manual; editar só o título não.
    const mexeuNaMetrica =
      !editando ||
      (["views", "likes", "comments", "shares"] as const).some((k) => resto[k] !== editando[k]);
    try {
      await salvar.mutateAsync({
        id: editando?.id,
        ...resto,
        url: link.url,
        network: rede,
        external_id: link.rede === rede ? link.idExterno : null,
        sponsor_id: sponsor_id === NENHUM ? null : sponsor_id,
        event_id: event_id === NENHUM ? null : event_id,
        ...(mexeuNaMetrica ? { metrics_source: "manual", metrics_updated_at: new Date().toISOString() } : {}),
      });
      toast.success(editando ? "Post atualizado" : "Post adicionado");
      setAberto(false);
    } catch (erro) {
      toast.error("Não foi possível salvar", { description: (erro as Error).message });
    }
  };

  const remover = async (post: PostDaPropriedade) => {
    const ok = await confirm({
      title: "Excluir este post?",
      description: "Ele sai de todos os relatórios desta propriedade.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      await excluir.mutateAsync(post.id);
      toast.success("Post excluído");
    } catch (erro) {
      toast.error("Não foi possível excluir", { description: (erro as Error).message });
    }
  };

  const alternarDestaque = (post: PostDaPropriedade) =>
    salvar.mutate(
      { id: post.id, is_highlight: !post.is_highlight },
      { onError: (erro) => toast.error("Não foi possível alterar", { description: erro.message }) },
    );

  const atualizarMetricas = async () => {
    try {
      const r = await atualizar.mutateAsync();
      const outras = Object.entries(r.sem_integracao)
        .map(([rede, n]) => `${rotuloDaRede(rede)} (${n})`)
        .join(", ");
      if (!r.youtube.configurado) {
        toast.warning("Busca automática do YouTube não configurada", {
          description: "Peça ao administrador da plataforma para cadastrar a chave da API do YouTube.",
        });
      } else if (r.youtube.falhou) {
        toast.error("O YouTube não respondeu", { description: "Tente de novo em alguns minutos." });
      } else {
        toast.success(`YouTube: ${r.youtube.atualizados} de ${r.youtube.consultados} vídeos atualizados`, {
          description: outras ? `Métrica manual: ${outras}.` : undefined,
        });
      }
    } catch (erro) {
      toast.error("Não foi possível atualizar", { description: (erro as Error).message });
    }
  };

  const campo = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Posts, vídeos e matérias</CardTitle>
            <CardDescription className="max-w-2xl">
              Cadastre pelo link. Os posts são da propriedade e entram em todos os relatórios dela; marque o patrocinador
              para que entrem no relatório dele.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={atualizarMetricas} disabled={atualizar.isPending || !podeEditar}>
              <RefreshCw className={`mr-2 h-4 w-4 ${atualizar.isPending ? "animate-spin" : ""}`} /> Atualizar métricas
            </Button>
            <Button size="sm" onClick={() => abrir()} disabled={!podeEditar}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar link
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingSkeleton count={3} />
          ) : !posts?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum post cadastrado. Cole o link de um post do Instagram, vídeo do YouTube, TikTok ou matéria.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Conteúdo</TableHead>
                    <TableHead>Patrocinador</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Curtidas</TableHead>
                    <TableHead>Métrica</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => alternarDestaque(p)}
                          disabled={!podeEditar}
                          aria-pressed={p.is_highlight}
                          aria-label={p.is_highlight ? "Tirar dos destaques" : "Marcar como destaque"}
                          className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <Star className={`h-4 w-4 ${p.is_highlight ? "fill-warning text-warning" : ""}`} />
                        </button>
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <div className="flex items-center gap-2">
                          <IconeDaRede rede={p.network} className="shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{p.title || p.url}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {rotuloDaRede(p.network)} · {TIPOS_DE_POST.find((t) => t.key === p.kind)?.label ?? p.kind}
                          {p.published_at ? ` · ${new Date(`${p.published_at}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">{p.sponsor_id ? nomeDoPatrocinador.get(p.sponsor_id) ?? "—" : "Geral"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.views != null ? numeroCompacto(p.views) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.likes != null ? numeroCompacto(p.likes) : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge tone={p.metrics_source === "api" ? "success" : "neutral"}>
                          {p.metrics_source === "api" ? "Automática" : "Manual"}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" asChild>
                            <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir o link original">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => abrir(p)} disabled={!podeEditar} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remover(p)} disabled={!podeEditar} aria-label="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <form onSubmit={enviar} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar post" : "Adicionar link"}</DialogTitle>
              <DialogDescription>
                Cole o link e clique em "Ler link": a rede e o tipo são reconhecidos e, no YouTube e no TikTok, o título vem
                sozinho.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="post-url">Link</Label>
              <div className="flex gap-2">
                <Input
                  id="post-url"
                  value={form.url}
                  onChange={(e) => campo("url", e.target.value)}
                  placeholder="https://www.instagram.com/reel/..."
                  inputMode="url"
                  autoFocus
                />
                <Button type="button" variant="secondary" onClick={lerLink} disabled={lendo || !form.url.trim()}>
                  {lendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />} Ler link
                </Button>
              </div>
              {miniatura && <img src={miniatura} alt="" className="mt-2 h-28 rounded-md object-cover" />}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Rede</Label>
                <Select value={form.rede} onValueChange={(v) => campo("rede", v as Rede)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REDES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => campo("kind", v as TipoDePost)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_DE_POST.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="post-titulo">Título</Label>
                <Input id="post-titulo" value={form.title} onChange={(e) => campo("title", e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="post-fonte">Perfil ou veículo</Label>
                <Input
                  id="post-fonte"
                  value={form.source_name}
                  onChange={(e) => campo("source_name", e.target.value)}
                  placeholder="@perfil, ge, Lance!"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="post-data">Publicado em</Label>
                <DateInput id="post-data" value={form.published_at} onValueChange={(v) => campo("published_at", v)} />
              </div>
              <div className="space-y-2">
                <Label>Patrocinador</Label>
                <Select value={form.sponsor_id} onValueChange={(v) => campo("sponsor_id", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Geral (sem patrocinador)</SelectItem>
                    {patrocinadores.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Momento</Label>
                <Select value={form.event_id} onValueChange={(v) => campo("event_id", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Nenhum</SelectItem>
                    {momentos.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="space-y-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">Métricas</legend>
              <p className="text-xs text-muted-foreground">
                {form.rede === "youtube"
                  ? "Com a chave do YouTube configurada, estes números são substituídos pela busca automática."
                  : `${rotuloDaRede(form.rede)} só fornece métricas da conta conectada por OAuth. Por enquanto, informe os números do painel da rede.`}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ["views", "Visualizações"],
                    ["likes", "Curtidas"],
                    ["comments", "Comentários"],
                    ["shares", "Compartilhamentos"],
                  ] as const
                ).map(([k, rotulo]) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`post-${k}`} className="text-xs">{rotulo}</Label>
                    <Input
                      id={`post-${k}`}
                      inputMode="numeric"
                      value={form[k]}
                      onChange={(e) => campo(k, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="flex items-center gap-3">
              <Switch id="post-destaque" checked={form.is_highlight} onCheckedChange={(v) => campo("is_highlight", v)} />
              <Label htmlFor="post-destaque">Destaque (aparece primeiro; um vídeo destacado abre a página)</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
