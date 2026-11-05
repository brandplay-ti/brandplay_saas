import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Plus, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useOrganization } from "@/hooks/useOrganization";
import { useApoioDoRelatorio, useCriarRelatorio, useRelatorios } from "@/hooks/useRelatorios";
import { enderecoDoRelatorio, ROTULO_DO_MODO, ROTULO_DO_STATUS, TOM_DO_STATUS } from "@/lib/relatorioLanding";

const TODOS = "todos";
const NENHUM = "nenhum";

export default function RelatoriosDeResultado() {
  const navigate = useNavigate();
  const { orgId, can } = useOrganization();
  const podeEditar = can("crm") || can("operacional");
  const { data: relatorios, isLoading } = useRelatorios(orgId);
  const { data: apoio } = useApoioDoRelatorio(orgId);
  const criar = useCriarRelatorio();
  const [aberto, setAberto] = useState(false);
  const [propriedade, setPropriedade] = useState("");
  const [patrocinador, setPatrocinador] = useState(TODOS);
  const [contrato, setContrato] = useState(NENHUM);
  const [titulo, setTitulo] = useState("");
  const [estilo, setEstilo] = useState<"escuro" | "claro">("escuro");

  const nomeDa = (id: string, lista: { id: string; name: string }[] | undefined) => lista?.find((x) => x.id === id)?.name ?? "";
  const tituloSugerido = (prop: string, spon: string) => {
    const p = nomeDa(prop, apoio?.propriedades);
    const s = spon !== TODOS ? nomeDa(spon, apoio?.patrocinadores) : "";
    return [p, s].filter(Boolean).join(" × ");
  };
  const contratos = (apoio?.contratos ?? []).filter(
    (c) => c.sponsor_id === patrocinador && (!c.property_id || c.property_id === propriedade),
  );

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propriedade) return toast.error("Escolha a propriedade");
    const t = titulo.trim() || tituloSugerido(propriedade, patrocinador);
    if (!t) return toast.error("Informe o título");
    try {
      const id = await criar.mutateAsync({
        property_id: propriedade,
        sponsor_id: patrocinador === TODOS ? null : patrocinador,
        contract_id: patrocinador === TODOS || contrato === NENHUM ? null : contrato,
        title: t.slice(0, 120),
        style: estilo,
      });
      toast.success("Relatório criado");
      navigate(`/dashboard/relatorios/paginas/${id}`);
    } catch (erro) {
      toast.error("Não foi possível criar", { description: (erro as Error).message });
    }
  };

  const copiar = async (slug: string) => {
    await navigator.clipboard.writeText(enderecoDoRelatorio(slug));
    toast.success("Link copiado");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios de resultado"
        icon={Presentation}
        description="Landing pages com os resultados de uma propriedade ou de um patrocínio: números, fotos, posts, vídeos e entregas, com as cores da sua marca. Compartilhe por link."
        actions={
          <Button onClick={() => setAberto(true)} disabled={!podeEditar}>
            <Plus className="mr-2 h-4 w-4" /> Novo relatório
          </Button>
        }
      />

      {isLoading ? (
        <LoadingSkeleton variant="cards" count={3} />
      ) : !relatorios?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Presentation className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="max-w-md text-sm text-muted-foreground">
              Nenhum relatório ainda. Crie um para a temporada de uma propriedade ou para a prestação de contas de um
              patrocinador.
            </p>
            {podeEditar && (
              <Button onClick={() => setAberto(true)}>
                <Plus className="mr-2 h-4 w-4" /> Criar o primeiro
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {relatorios.map((r) => (
            <li key={r.id}>
              <Card className="flex h-full flex-col">
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={TOM_DO_STATUS[r.status] ?? "neutral"}>{ROTULO_DO_STATUS[r.status] ?? r.status}</StatusBadge>
                    <StatusBadge tone={r.access_mode === "publico" ? "info" : "neutral"}>
                      {ROTULO_DO_MODO[r.access_mode] ?? r.access_mode}
                    </StatusBadge>
                  </div>
                  <div className="flex-1">
                    <Link
                      to={`/dashboard/relatorios/paginas/${r.id}`}
                      className="font-semibold leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {r.title}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.propriedade?.name}
                      {r.patrocinador ? ` · ${r.patrocinador.name}` : " · todos os patrocinadores"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`/dashboard/relatorios/paginas/${r.id}`}>Editar</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/r/${r.slug}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" /> Abrir
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => copiar(r.slug)}>
                      <Copy className="mr-2 h-4 w-4" /> Copiar link
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <form onSubmit={enviar} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Novo relatório</DialogTitle>
              <DialogDescription>
                Sem patrocinador, o relatório mostra a temporada da propriedade. Com patrocinador, vira a prestação de contas
                dele, com as contrapartidas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Propriedade</Label>
              <Select
                value={propriedade}
                onValueChange={(v) => {
                  setPropriedade(v);
                  setContrato(NENHUM);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Escolha a propriedade" /></SelectTrigger>
                <SelectContent>
                  {apoio?.propriedades.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Patrocinador</Label>
              <Select
                value={patrocinador}
                onValueChange={(v) => {
                  setPatrocinador(v);
                  setContrato(NENHUM);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Nenhum: relatório da propriedade</SelectItem>
                  {apoio?.patrocinadores.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {patrocinador !== TODOS && (
              <div className="space-y-2">
                <Label>Contrato</Label>
                <Select value={contrato} onValueChange={setContrato}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Todas as entregas do patrocinador nesta propriedade</SelectItem>
                    {contratos.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="novo-titulo">Título</Label>
              <Input
                id="novo-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder={tituloSugerido(propriedade, patrocinador) || "Copa 2026 — Resultados"}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label>Estilo</Label>
              <Select value={estilo} onValueChange={(v) => setEstilo(v as "escuro" | "claro")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="escuro">Esportivo escuro</SelectItem>
                  <SelectItem value="claro">Editorial claro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={criar.isPending}>
                {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
