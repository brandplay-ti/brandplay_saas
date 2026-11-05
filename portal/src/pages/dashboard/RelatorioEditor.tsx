import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Copy, ExternalLink, Loader2, Presentation, Send, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfiguracaoDaPagina } from "@/components/relatorio-landing/editor/ConfiguracaoDaPagina";
import { FotosDaPropriedade } from "@/components/relatorio-landing/editor/FotosDaPropriedade";
import { IndicadoresDaPropriedade } from "@/components/relatorio-landing/editor/IndicadoresDaPropriedade";
import { PostsDaPropriedade } from "@/components/relatorio-landing/editor/PostsDaPropriedade";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { useOrganization } from "@/hooks/useOrganization";
import { useApoioDoRelatorio, usePaginaDoRelatorio, useRelatorio, useSalvarRelatorio } from "@/hooks/useRelatorios";
import { blocosVisiveis, enderecoDoRelatorio, ROTULO_DO_MODO, ROTULO_DO_STATUS, TOM_DO_STATUS } from "@/lib/relatorioLanding";

export default function RelatorioEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { orgId, can, isAdmin } = useOrganization();
  const { data: relatorio, isLoading } = useRelatorio(id);
  const { data: apoio } = useApoioDoRelatorio(orgId, relatorio?.property_id);
  const { data: pagina } = usePaginaDoRelatorio(relatorio?.status === "excluido" ? undefined : relatorio?.slug);
  const salvar = useSalvarRelatorio(id);

  if (isLoading) return <LoadingSkeleton variant="detalhe" />;
  if (!relatorio || relatorio.status === "excluido") {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Relatório não encontrado.{" "}
          <Link to="/dashboard/relatorios/paginas" className="text-primary hover:underline">
            Voltar para a lista
          </Link>
        </CardContent>
      </Card>
    );
  }

  const podeEditar = can("crm") || can("operacional");
  // Relatório público: publicar, despublicar e editar são de owner/admin (D4).
  const podeMexer = podeEditar && (relatorio.access_mode !== "publico" || isAdmin);
  const publicado = relatorio.status === "publicado";
  const secoes = pagina ? blocosVisiveis(pagina).length : null;
  const patrocinadores = apoio?.patrocinadores ?? [];
  const momentos = apoio?.momentos ?? [];

  const alternarPublicacao = async () => {
    if (!publicado && relatorio.access_mode === "publico") {
      const ok = await confirm({
        title: "Publicar para qualquer pessoa com o link?",
        description:
          "O relatório fica visível sem login. Fotos marcadas com menores e evidências privadas de entrega ficam de fora.",
        confirmLabel: "Publicar",
      });
      if (!ok) return;
    }
    try {
      await salvar.mutateAsync({ status: publicado ? "rascunho" : "publicado" });
      toast.success(publicado ? "Relatório voltou para rascunho" : "Relatório publicado");
    } catch (erro) {
      toast.error("Não foi possível alterar", { description: (erro as Error).message });
    }
  };

  const excluir = async () => {
    const ok = await confirm({
      title: "Excluir este relatório?",
      description:
        "O link passa a mostrar que o relatório não está mais disponível. Não dá para desfazer. Posts, indicadores e fotos continuam na propriedade.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      await salvar.mutateAsync({ status: "excluido" });
      toast.success("Relatório excluído");
      navigate("/dashboard/relatorios/paginas");
    } catch (erro) {
      toast.error("Não foi possível excluir", { description: (erro as Error).message });
    }
  };

  const copiar = async () => {
    await navigator.clipboard.writeText(enderecoDoRelatorio(relatorio.slug));
    toast.success("Link copiado");
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/dashboard/relatorios/paginas">
          <ArrowLeft className="mr-2 h-4 w-4" /> Relatórios de resultado
        </Link>
      </Button>

      <PageHeader
        title={relatorio.title}
        icon={Presentation}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={TOM_DO_STATUS[relatorio.status] ?? "neutral"}>
              {ROTULO_DO_STATUS[relatorio.status] ?? relatorio.status}
            </StatusBadge>
            <StatusBadge tone={relatorio.access_mode === "publico" ? "info" : "neutral"}>
              {ROTULO_DO_MODO[relatorio.access_mode] ?? relatorio.access_mode}
            </StatusBadge>
            <span>
              {relatorio.propriedade?.name}
              {relatorio.patrocinador ? ` × ${relatorio.patrocinador.name}` : ""}
              {secoes !== null ? ` · ${secoes} seções com dados` : ""}
            </span>
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/r/${relatorio.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> {publicado ? "Abrir página" : "Ver prévia"}
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={copiar}>
              <Copy className="mr-2 h-4 w-4" /> Copiar link
            </Button>
            <Button size="sm" onClick={alternarPublicacao} disabled={!podeMexer || salvar.isPending}>
              {salvar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : publicado ? (
                <Undo2 className="mr-2 h-4 w-4" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {publicado ? "Voltar para rascunho" : "Publicar"}
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="pagina">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="pagina">Página</TabsTrigger>
          <TabsTrigger value="posts">Posts e links</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
          <TabsTrigger value="fotos">Fotos</TabsTrigger>
        </TabsList>
        <TabsContent value="pagina" className="mt-6">
          <ConfiguracaoDaPagina
            key={relatorio.updated_at}
            relatorio={relatorio}
            pagina={pagina}
            podeEditar={podeEditar}
            podePublicarFora={isAdmin}
          />
        </TabsContent>
        <TabsContent value="posts" className="mt-6">
          <PostsDaPropriedade
            propertyId={relatorio.property_id}
            patrocinadores={patrocinadores}
            momentos={momentos}
            podeEditar={podeEditar}
          />
        </TabsContent>
        <TabsContent value="indicadores" className="mt-6">
          <IndicadoresDaPropriedade propertyId={relatorio.property_id} patrocinadores={patrocinadores} podeEditar={podeEditar} />
        </TabsContent>
        <TabsContent value="fotos" className="mt-6">
          {user && (
            <FotosDaPropriedade
              propertyId={relatorio.property_id}
              userId={user.id}
              patrocinadores={patrocinadores}
              momentos={momentos}
              podeEditar={podeEditar}
            />
          )}
        </TabsContent>
      </Tabs>

      {isAdmin && (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="font-medium">Excluir relatório</p>
              <p className="text-sm text-muted-foreground">O endereço deixa de mostrar o relatório. Não dá para desfazer.</p>
            </div>
            <Button variant="destructive" size="sm" onClick={excluir} disabled={salvar.isPending}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
