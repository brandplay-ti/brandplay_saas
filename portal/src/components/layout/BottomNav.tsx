import { Link, useLocation } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { usePlatformRole } from "@/hooks/usePlatformAdmin";
import { useSidebar } from "@/components/ui/sidebar";
import { atalhosMobile, gruposVisiveis, urlAtiva } from "@/lib/navegacao";
import { cn } from "@/lib/utils";

const ITEM =
  "flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * Barra inferior do painel no celular (MOB-01, plano-versao-mobile.md): até
 * quatro atalhos escolhidos por `atalhosMobile` e o "Mais", que abre o menu
 * completo. Quando a página atual não é um dos atalhos, o "Mais" fica aceso.
 * Esconder um atalho é só experiência: quem barra o acesso é a RLS.
 */
export function BottomNav() {
  const { pathname } = useLocation();
  const { can, clientType, isAdmin, loading } = useOrganization();
  const { isPlatformStaff } = usePlatformRole();
  const { openMobile, setOpenMobile } = useSidebar();

  const grupos = gruposVisiveis({ can, clientType, isAdmin, loading, isPlatformAdmin: isPlatformStaff });
  const atalhos = atalhosMobile(grupos);
  const ativa = urlAtiva(grupos, pathname);
  const maisAtivo = !atalhos.some((a) => a.url === ativa);

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${atalhos.length + 1}, minmax(0, 1fr))` }}>
        {atalhos.map((item) => {
          const atual = item.url === ativa;
          return (
            <li key={item.url}>
              <Link
                to={item.url}
                aria-current={atual ? "page" : undefined}
                className={cn(ITEM, atual ? "font-semibold text-primary" : "font-medium text-muted-foreground")}
              >
                <item.icon className="h-5 w-5" aria-hidden />
                {item.title}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            aria-haspopup="dialog"
            aria-expanded={openMobile}
            className={cn(ITEM, maisAtivo ? "font-semibold text-primary" : "font-medium text-muted-foreground")}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden />
            Mais
          </button>
        </li>
      </ul>
    </nav>
  );
}
