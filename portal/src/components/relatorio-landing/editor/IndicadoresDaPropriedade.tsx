import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { useConfirm } from "@/hooks/useConfirm";
import {
  useExcluirIndicador,
  useIndicadoresDaPropriedade,
  useSalvarIndicador,
  type IndicadorDaPropriedade,
} from "@/hooks/useRelatorios";
import { formatarIndicador, type CategoriaDeIndicador, type FormatoDeIndicador } from "@/lib/relatorioLanding";

const NENHUM = "nenhum";

const CATEGORIAS: { key: CategoriaDeIndicador; label: string; ajuda: string }[] = [
  { key: "numeros", label: "Números", ajuda: "Faixa de números da página: jogos, público, views da temporada." },
  { key: "digital", label: "Digital", ajuda: "Resultados digitais: alcance, interações, seguidores." },
  { key: "transmissao", label: "Transmissão", ajuda: "Audiência de transmissão: watch time, pico ao vivo, espectadores." },
  { key: "publico", label: "Público", ajuda: "Perfil do público, agrupado (ex.: Faixa etária → 25–34 anos = 44,7%)." },
];

const FORMATOS: { key: FormatoDeIndicador; label: string }[] = [
  { key: "inteiro", label: "Inteiro (410.157)" },
  { key: "compacto", label: "Compacto (189,2 mi)" },
  { key: "decimal", label: "Decimal (2,98)" },
  { key: "percentual", label: "Percentual (44,7%)" },
];

const schema = z.object({
  category: z.enum(["numeros", "digital", "transmissao", "publico"]),
  group_name: z.string().trim().max(60).transform((v) => v || null),
  label: z.string().trim().min(1, "Informe o rótulo").max(80),
  value: z
    .string()
    .trim()
    .min(1, "Informe o valor")
    .transform((v) => v.replace(/\./g, "").replace(",", "."))
    .refine((v) => /^-?\d{1,15}(\.\d{1,4})?$/.test(v), "Valor inválido")
    .transform(Number),
  format: z.enum(["inteiro", "compacto", "decimal", "percentual"]),
  prefix: z.string().trim().max(8).transform((v) => v || null),
  suffix: z.string().trim().max(16).transform((v) => v || null),
  source: z.string().trim().max(160).transform((v) => v || null),
  reference_date: z.string().trim().transform((v) => v || null),
  sponsor_id: z.string(),
  show_zero: z.boolean(),
});

type Formulario = z.input<typeof schema>;

const vazio = (category: CategoriaDeIndicador = "numeros"): Formulario => ({
  category,
  group_name: "",
  label: "",
  value: "",
  format: category === "publico" ? "percentual" : "compacto",
  prefix: "",
  suffix: "",
  source: "",
  reference_date: "",
  sponsor_id: NENHUM,
  show_zero: false,
});

const doIndicador = (i: IndicadorDaPropriedade): Formulario => ({
  category: i.category as CategoriaDeIndicador,
  group_name: i.group_name ?? "",
  label: i.label,
  value: String(i.value).replace(".", ","),
  format: i.format as FormatoDeIndicador,
  prefix: i.prefix ?? "",
  suffix: i.suffix ?? "",
  source: i.source ?? "",
  reference_date: i.reference_date ?? "",
  sponsor_id: i.sponsor_id ?? NENHUM,
  show_zero: i.show_zero,
});

interface Props {
  propertyId: string;
  patrocinadores: { id: string; name: string }[];
  podeEditar: boolean;
}

export function IndicadoresDaPropriedade({ propertyId, patrocinadores, podeEditar }: Props) {
  const confirm = useConfirm();
  const { data: indicadores, isLoading } = useIndicadoresDaPropriedade(propertyId);
  const salvar = useSalvarIndicador(propertyId);
  const excluir = useExcluirIndicador(propertyId);
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(vazio());
  const nomeDoPatrocinador = new Map(patrocinadores.map((p) => [p.id, p.name]));
  const campo = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrir = (categoria: CategoriaDeIndicador, indicador?: IndicadorDaPropriedade) => {
    setEditando(indicador?.id ?? null);
    setForm(indicador ? doIndicador(indicador) : vazio(categoria));
    setAberto(true);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os campos");
      return;
    }
    const { sponsor_id, ...resto } = parsed.data;
    try {
      await salvar.mutateAsync({
        id: editando ?? undefined,
        ...resto,
        sponsor_id: sponsor_id === NENHUM ? null : sponsor_id,
      });
      toast.success(editando ? "Indicador atualizado" : "Indicador adicionado");
      setAberto(false);
    } catch (erro) {
      toast.error("Não foi possível salvar", { description: (erro as Error).message });
    }
  };

  const remover = async (i: IndicadorDaPropriedade) => {
    const ok = await confirm({ title: `Excluir "${i.label}"?`, confirmLabel: "Excluir", destructive: true });
    if (!ok) return;
    try {
      await excluir.mutateAsync(i.id);
      toast.success("Indicador excluído");
    } catch (erro) {
      toast.error("Não foi possível excluir", { description: (erro as Error).message });
    }
  };

  const previa = schema.safeParse(form);

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Números que não nascem na plataforma (TNT, Google Analytics, demografia do Instagram), sempre com a fonte. Zero só
        aparece se você marcar "exibir zero". Os indicadores são da propriedade; marque o patrocinador para os que são só
        dele.
      </p>
      {isLoading ? (
        <LoadingSkeleton variant="cards" count={2} />
      ) : (
        CATEGORIAS.map((c) => {
          const itens = (indicadores ?? []).filter((i) => i.category === c.key);
          return (
            <Card key={c.key}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="text-base">{c.label}</CardTitle>
                  <CardDescription>{c.ajuda}</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => abrir(c.key)} disabled={!podeEditar}>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar
                </Button>
              </CardHeader>
              {itens.length > 0 && (
                <CardContent>
                  <ul className="divide-y">
                    {itens.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {i.group_name && <span className="text-muted-foreground">{i.group_name} · </span>}
                            {i.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[i.source && `Fonte: ${i.source}`, i.sponsor_id && nomeDoPatrocinador.get(i.sponsor_id)]
                              .filter(Boolean)
                              .join(" · ") || "Sem fonte informada"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold tabular-nums">
                            {formatarIndicador({ valor: Number(i.value), formato: i.format as FormatoDeIndicador, prefixo: i.prefix, sufixo: i.suffix })}
                          </span>
                          <Button variant="ghost" size="icon" onClick={() => abrir(c.key, i)} disabled={!podeEditar} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remover(i)} disabled={!podeEditar} aria-label="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          );
        })
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <form onSubmit={enviar} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar indicador" : "Novo indicador"}</DialogTitle>
              <DialogDescription>
                {CATEGORIAS.find((c) => c.key === form.category)?.ajuda}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => campo("category", v as CategoriaDeIndicador)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.category === "publico" && (
                <div className="space-y-2">
                  <Label htmlFor="ind-grupo">Grupo</Label>
                  <Input id="ind-grupo" value={form.group_name} onChange={(e) => campo("group_name", e.target.value)} placeholder="Faixa etária" maxLength={60} />
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ind-rotulo">Rótulo</Label>
                <Input id="ind-rotulo" value={form.label} onChange={(e) => campo("label", e.target.value)} placeholder="Views da temporada" maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ind-valor">Valor</Label>
                <Input id="ind-valor" inputMode="decimal" value={form.value} onChange={(e) => campo("value", e.target.value)} placeholder="189210000" />
              </div>
              <div className="space-y-2">
                <Label>Formato</Label>
                <Select value={form.format} onValueChange={(v) => campo("format", v as FormatoDeIndicador)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMATOS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ind-prefixo">Prefixo</Label>
                <Input id="ind-prefixo" value={form.prefix} onChange={(e) => campo("prefix", e.target.value)} placeholder="R$, +" maxLength={8} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ind-sufixo">Sufixo</Label>
                <Input id="ind-sufixo" value={form.suffix} onChange={(e) => campo("suffix", e.target.value)} placeholder="h, dias" maxLength={16} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ind-fonte">Fonte</Label>
                <Input id="ind-fonte" value={form.source} onChange={(e) => campo("source", e.target.value)} placeholder="Instagram Insights" maxLength={160} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ind-data">Data de referência</Label>
                <DateInput id="ind-data" value={form.reference_date} onValueChange={(v) => campo("reference_date", v)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Patrocinador</Label>
                <Select value={form.sponsor_id} onValueChange={(v) => campo("sponsor_id", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Geral (todos os relatórios da propriedade)</SelectItem>
                    {patrocinadores.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="ind-zero" checked={form.show_zero} onCheckedChange={(v) => campo("show_zero", v)} />
              <Label htmlFor="ind-zero">Exibir mesmo se for zero</Label>
            </div>
            {previa.success && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                Na página: <strong>{formatarIndicador({ valor: previa.data.value, formato: previa.data.format, prefixo: previa.data.prefix, sufixo: previa.data.suffix })}</strong>
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
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
