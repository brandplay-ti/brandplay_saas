import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import type { OrigemLogin } from "@/lib/recuperacaoSenha";

const PAINEL: Record<OrigemLogin, { titulo: string; texto: string }> = {
  painel: {
    titulo: "Transformando patrocínio em resultado.",
    texto: "Gerencie propriedades, contratos, entregas e relatórios em uma única plataforma.",
  },
  portal: {
    titulo: "Portal do Patrocinador",
    texto: "Acompanhe entregas, contratos e relatórios das suas ativações em tempo real.",
  },
};

interface AuthLayoutProps {
  origem: OrigemLogin;
  children: ReactNode;
}

/** Moldura das telas de recuperação de senha: a mesma do login de cada origem. */
export function AuthLayout({ origem, children }: AuthLayoutProps) {
  const painel = PAINEL[origem];
  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex relative bg-gradient-brand p-12 flex-col justify-between text-primary-foreground">
        <Logo showWordmark={false} sizeClassName="h-20 w-20" />
        <div>
          <h2 className="text-4xl font-bold leading-tight">{painel.titulo}</h2>
          <p className="mt-4 text-primary-foreground/80 text-lg">{painel.texto}</p>
        </div>
        <p className="text-sm text-primary-foreground/70">© {new Date().getFullYear()} BrandPlay</p>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="md:hidden mb-6">
            <Logo sizeClassName="h-14" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
