import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, EyeOff, Loader2, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSalvarRelatorio, type Relatorio } from "@/hooks/useRelatorios";
import { BLOCOS, blocoTemDados, type BlocoId, type EstiloDoRelatorio, type ModoDeAcesso, type PaginaRelatorio } from "@/lib/relatorioLanding";
import { cn } from "@/lib/utils";

const opcional = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const link = (padrao: RegExp, mensagem: string) =>
  z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || padrao.test(v), mensagem)
    .transform((v) => v || null);

const schema = z.object({
  title: z.string().trim().min(1, "Informe o título").max(120),
  subtitle: opcional(300),
  summary: opcional(3000),
  style: z.enum(["escuro", "claro"]),
  access_mode: z.enum(["organizacao", "publico"]),
  cta_label: opcional(40),
  cta_url: link(/^(https:\/\/|mailto:)\S+$/, "O botão de contato precisa de um link https:// (WhatsApp: https://wa.me/...) ou mailto:"),
  download_url: link(/^https:\/\/\S+$/, "O link do relatório completo precisa começar com https://"),
});

type Formulario = z.input<typeof schema>;

interface Props {
  relatorio: Relatorio;
  pagina: PaginaRelatorio | undefined;
  podeEditar: boolean;
  podePublicarFora: boolean;
}

export function ConfiguracaoDaPagina({ relatorio, pagina, podeEditar, podePublicarFora }: Props) {
  const salvar = useSalvarRelatorio(relatorio.id);
  const [form, setForm] = useState<Formulario>({
    title: relatorio.title,
    subtitle: relatorio.subtitle ?? "",
    summary: relatorio.summary ?? "",
    style: relatorio.style as EstiloDoRelatorio,
    access_mode: relatorio.access_mode as ModoDeAcesso,
    cta_label: relatorio.cta_label ?? "",
    cta_url: relatorio.cta_url ?? "",
    download_url: relatorio.download_url ?? "",
  });
  const [ocultos, setOcultos] = useState<string[]>(relatorio.hidden_blocks);
  const campo = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Relatório público só muda com owner ou admin (D4); a tela avisa antes do banco recusar.
  const travado = !podeEditar || (relatorio.access_mode === "publico" && !podePublicarFora);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os campos");
      return;
    }
    try {
      await salvar.mutateAsync({ ...parsed.data, hidden_blocks: ocultos });
      toast.success("Relatório salvo");
    } catch (erro) {
      toast.error("Não foi possível salvar", { description: (erro as Error).message });
    }
  };

  const alternar = (id: BlocoId, visivel: boolean) =>
    setOcultos((atual) => (visivel ? atual.filter((b) => b !== id) : [...new Set([...atual, id])]));

  return (
    <form onSubmit={enviar} className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Textos</CardTitle>
            <CardDescription>A capa usa o título e o subtítulo; o resumo abre a página.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rel-titulo">Título</Label>
              <Input id="rel-titulo" value={form.title} onChange={(e) => campo("title", e.target.value)} maxLength={120} disabled={travado} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rel-subtitulo">Subtítulo</Label>
              <Input
                id="rel-subtitulo"
                value={form.subtitle}
                onChange={(e) => campo("subtitle", e.target.value)}
                placeholder="Sem subtítulo, a capa usa a chamada pública da propriedade."
                maxLength={300}
                disabled={travado}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rel-resumo">Resumo executivo</Label>
              <Textarea
                id="rel-resumo"
                value={form.summary}
                onChange={(e) => campo("summary", e.target.value)}
                rows={6}
                maxLength={3000}
                placeholder="Sem resumo, a página usa o texto público da propriedade. Separe parágrafos com uma linha em branco."
                disabled={travado}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estilo e acesso</CardTitle>
            <CardDescription>As cores e os logos vêm da marca da organização (Configurações).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <fieldset className="grid gap-3 sm:grid-cols-2" disabled={travado}>
              <legend className="sr-only">Estilo</legend>
              {(
                [
                  ["escuro", "Esportivo escuro", "Fundo escuro, títulos condensados em caixa alta.", Moon],
                  ["claro", "Editorial claro", "Fundo branco, capa na cor da marca.", Sun],
                ] as const
              ).map(([valor, titulo, texto, Icone]) => (
                <label
                  key={valor}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    form.style === valor ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <input
                    type="radio"
                    name="estilo"
                    value={valor}
                    checked={form.style === valor}
                    onChange={() => campo("style", valor)}
                    className="sr-only"
                  />
                  <Icone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block font-medium">{titulo}</span>
                    <span className="block text-sm text-muted-foreground">{texto}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-2">
              <Label>Quem pode abrir o link</Label>
              <Select
                value={form.access_mode}
                onValueChange={(v) => campo("access_mode", v as ModoDeAcesso)}
                disabled={travado || !podePublicarFora}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="organizacao">Só a equipe da organização (e o patrocinador, pelo portal)</SelectItem>
                  <SelectItem value="publico">Qualquer pessoa com o link</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {podePublicarFora
                  ? "No modo público, fotos marcadas com menores de idade e as evidências privadas das entregas ficam de fora. A página não aparece em buscadores."
                  : "Só owner e admin deixam um relatório público."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contato e download</CardTitle>
            <CardDescription>Botões do fim da página. Deixe em branco para não mostrar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rel-cta-rotulo">Texto do botão</Label>
              <Input id="rel-cta-rotulo" value={form.cta_label} onChange={(e) => campo("cta_label", e.target.value)} placeholder="Quero ser patrocinador" maxLength={40} disabled={travado} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rel-cta-url">Link do botão</Label>
              <Input id="rel-cta-url" value={form.cta_url} onChange={(e) => campo("cta_url", e.target.value)} placeholder="https://wa.me/55..." inputMode="url" disabled={travado} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rel-download">Relatório completo (PDF)</Label>
              <Input id="rel-download" value={form.download_url} onChange={(e) => campo("download_url", e.target.value)} placeholder="https://drive.google.com/..." inputMode="url" disabled={travado} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle>Seções da página</CardTitle>
            <CardDescription>
              Cada seção aparece sozinha quando há dado. Desligue as que não quiser mostrar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {BLOCOS.map((b) => {
                const temDados = pagina ? blocoTemDados(b.id, pagina) : false;
                const visivel = !ocultos.includes(b.id);
                return (
                  <li key={b.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {!visivel ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                        ) : temDados ? (
                          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                        ) : (
                          <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />
                        )}
                        {b.titulo}
                      </p>
                      {visivel && !temDados && <p className="mt-0.5 pl-6 text-xs text-muted-foreground">Falta: {b.exige}.</p>}
                    </div>
                    <Switch
                      checked={visivel}
                      onCheckedChange={(v) => alternar(b.id, v)}
                      disabled={travado}
                      aria-label={`Mostrar ${b.titulo}`}
                    />
                  </li>
                );
              })}
            </ul>
            <Button type="submit" className="mt-4 w-full" disabled={travado || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar alterações
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
