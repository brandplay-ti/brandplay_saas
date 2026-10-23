import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-soft px-6 text-center">
      <Logo sizeClassName="h-9" className="mb-10" />
      <p className="text-sm font-semibold text-primary">Erro 404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Página não encontrada</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        O endereço pode ter sido digitado errado ou a página pode ter sido removida.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/dashboard">Ir para o painel</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Voltar ao início
          </Link>
        </Button>
      </div>
    </main>
  );
};

export default NotFound;
