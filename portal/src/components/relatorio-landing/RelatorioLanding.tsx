import { useEffect, type CSSProperties } from "react";
import { Download, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { blocosVisiveis, temaDoRelatorio, type BlocoId, type PaginaRelatorio } from "@/lib/relatorioLanding";
import { logoDaOrganizacao } from "./estilo";
import { Acervo } from "./blocos/Acervo";
import { Capa } from "./blocos/Capa";
import { Contrapartidas } from "./blocos/Contrapartidas";
import { Contato, Numeros, Patrocinadores, Resumo, Transmissao } from "./blocos/Institucional";
import { Jornada } from "./blocos/Jornada";
import { Conteudos, Imprensa, VideoDestaque } from "./blocos/Midia";
import { Digital, Publico } from "./blocos/Resultados";

const NO_MENU: Record<BlocoId, string> = {
  numeros: "Números",
  resumo: "Resumo",
  patrocinadores: "Marcas",
  jornada: "Jornada",
  video: "Vídeo",
  digital: "Digital",
  transmissao: "Transmissão",
  conteudos: "Conteúdos",
  publico: "Público",
  acervo: "Acervo",
  imprensa: "Imprensa",
  contrapartidas: "Entregas",
  contato: "Contato",
};

const BLOCO: Record<BlocoId, (props: { pagina: PaginaRelatorio }) => JSX.Element> = {
  numeros: Numeros,
  resumo: Resumo,
  patrocinadores: Patrocinadores,
  jornada: Jornada,
  video: VideoDestaque,
  digital: Digital,
  transmissao: Transmissao,
  conteudos: Conteudos,
  publico: Publico,
  acervo: Acervo,
  imprensa: Imprensa,
  contrapartidas: Contrapartidas,
  contato: Contato,
};

const FONTE_ESPORTIVA =
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,700;1,800&display=swap";

/** A fonte condensada só é baixada por quem abre um relatório no estilo escuro. */
function useFonteEsportiva(ativa: boolean) {
  useEffect(() => {
    if (!ativa || document.querySelector(`link[href="${FONTE_ESPORTIVA}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTE_ESPORTIVA;
    document.head.appendChild(link);
  }, [ativa]);
}

export function RelatorioLanding({ pagina }: { pagina: PaginaRelatorio }) {
  const { relatorio, organizacao, propriedade } = pagina;
  const escuro = relatorio.estilo === "escuro";
  useFonteEsportiva(escuro);
  const blocos = blocosVisiveis(pagina);
  const tema = {
    ...temaDoRelatorio(relatorio.estilo, organizacao?.primaria, organizacao?.secundaria),
    "--rl-display": escuro ? '"Barlow Condensed", Inter, system-ui, sans-serif' : "Poppins, Inter, system-ui, sans-serif",
    "--rl-display-tracking": escuro ? "0" : "-0.02em",
    "--rl-display-case": escuro ? "uppercase" : "none",
    "--rl-realce-estilo": escuro ? "italic" : "normal",
  } as CSSProperties;
  const logo = logoDaOrganizacao(organizacao, escuro ? "escuro" : "claro");
  const atualizado = relatorio.atualizado_em
    ? new Date(relatorio.atualizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <div
      className={cn("min-h-screen bg-[var(--rl-bg)] font-sans text-[var(--rl-fg)] antialiased", escuro ? "rl-escuro" : "rl-claro")}
      style={tema}
    >
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black"
      >
        Pular para o conteúdo
      </a>

      {pagina.acesso.previa && (
        <div className="relative z-50 flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950">
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          Prévia: este relatório ainda não foi publicado. Só membros da organização o veem.
        </div>
      )}

      <nav
        aria-label="Seções do relatório"
        className="sticky top-0 z-40 border-b border-[var(--rl-border)] bg-[color-mix(in_srgb,var(--rl-bg)_88%,transparent)] backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex shrink-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]">
            {logo ? (
              <img src={logo} alt={organizacao?.nome ?? ""} className="h-8 max-w-[140px] object-contain" />
            ) : (
              <span className="text-sm font-bold">{organizacao?.nome}</span>
            )}
            {propriedade && (
              <span className="hidden border-l border-[var(--rl-border)] pl-3 text-sm font-semibold md:inline">
                {propriedade.nome}
              </span>
            )}
          </a>
          <ul className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto text-sm [scrollbar-width:none]">
            {blocos
              .filter((b) => b !== "contato")
              .map((b) => (
                <li key={b}>
                  <a
                    href={`#${b}`}
                    className="block whitespace-nowrap rounded-full px-3 py-1.5 text-[var(--rl-muted)] transition-colors hover:bg-[var(--rl-surface-2)] hover:text-[var(--rl-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]"
                  >
                    {NO_MENU[b]}
                  </a>
                </li>
              ))}
          </ul>
          {relatorio.download_url && (
            <a
              href={relatorio.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden shrink-0 items-center gap-2 rounded-full bg-[var(--rl-primaria)] px-4 py-2 text-sm font-semibold text-[var(--rl-sobre-primaria)] lg:inline-flex"
            >
              <Download className="h-4 w-4" aria-hidden /> Relatório completo
            </a>
          )}
        </div>
      </nav>

      <main id="conteudo" className="-mt-16">
        <Capa pagina={pagina} primeiroBloco={blocos[0] ?? null} />
        {blocos.map((b) => {
          const Bloco = BLOCO[b];
          return <Bloco key={b} pagina={pagina} />;
        })}
      </main>

      <footer className="border-t border-[var(--rl-border)] bg-[var(--rl-bg)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-[var(--rl-muted)] sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            {logo && <img src={logo} alt="" className="h-7 max-w-[120px] object-contain opacity-80" />}
            <span>
              {organizacao?.nome}
              {propriedade ? ` · ${propriedade.nome}` : ""}
            </span>
          </div>
          <p>
            {atualizado ? `Dados atualizados em ${atualizado}. ` : ""}
            Relatório gerado com BrandPlay.
          </p>
        </div>
      </footer>
    </div>
  );
}
