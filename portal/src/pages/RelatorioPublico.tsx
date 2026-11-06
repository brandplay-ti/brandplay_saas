import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { FileX2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/PageLoader";
import { RelatorioLanding } from "@/components/relatorio-landing/RelatorioLanding";
import { ErroAoAbrirRelatorio, usePaginaDoRelatorio } from "@/hooks/useRelatorios";

/** O relatório não entra em buscador: o endereço é compartilhado de propósito. */
function useSemIndexacao() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

function Aviso({ icone: Icone, titulo, texto, acao }: { icone: typeof Lock; titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">
          <Icone className="h-6 w-6 text-muted-foreground" aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-bold">{titulo}</h1>
        <p className="mt-3 text-muted-foreground">{texto}</p>
        {acao && <div className="mt-8">{acao}</div>}
      </div>
    </main>
  );
}

export default function RelatorioPublico() {
  const { slug } = useParams<{ slug: string }>();
  const { data, error, isLoading } = usePaginaDoRelatorio(slug);
  useSemIndexacao();

  useEffect(() => {
    if (data) document.title = `${data.relatorio.titulo}${data.organizacao ? ` · ${data.organizacao.nome}` : ""}`;
  }, [data]);

  if (isLoading) return <PageLoader fullScreen />;

  if (error instanceof ErroAoAbrirRelatorio) {
    const d = error.detalhe;
    if (d.tipo === "excluido") return <Aviso icone={FileX2} titulo="Relatório indisponível" texto={d.mensagem} />;
    if (d.tipo === "suspenso") {
      return (
        <Aviso
          icone={Lock}
          titulo="Acesso suspenso"
          texto="O acesso da sua organização está suspenso. Regularize o plano para voltar a ver este relatório."
          acao={
            <Button asChild>
              <Link to="/dashboard/plano">Ver plano e cobrança</Link>
            </Button>
          }
        />
      );
    }
    return (
      <Aviso
        icone={Lock}
        titulo="Relatório não encontrado"
        texto={
          d.login
            ? "O endereço não existe ou o relatório é restrito. Se você faz parte da equipe ou é patrocinador, entre com a sua conta e abra o link de novo."
            : "O endereço não existe ou a sua conta não tem acesso a este relatório."
        }
        acao={
          d.login ? (
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/auth">Entrar na equipe</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/portal/login">Portal do patrocinador</Link>
              </Button>
            </div>
          ) : undefined
        }
      />
    );
  }

  if (error || !data) {
    return (
      <Aviso
        icone={FileX2}
        titulo="Não foi possível abrir o relatório"
        texto="Tente de novo em alguns instantes."
        acao={<Button onClick={() => window.location.reload()}>Tentar de novo</Button>}
      />
    );
  }

  return <RelatorioLanding pagina={data} />;
}
