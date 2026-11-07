import { useState, type ReactNode } from "react";
import { ExternalLink, Facebook, Globe, Instagram, Linkedin, Music2, Play, Twitter, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import { miniaturaDoPost, proporcaoDoEmbed, rotuloDaRede, urlDeEmbed, type PostParaEmbed } from "@/lib/redesSociais";
import { classeDisplay, verNa } from "./estilo";

// Peças visuais da landing page do relatório. As cores vêm das variáveis
// `--rl-*` definidas em `RelatorioLanding` (tema da organização).

export function Secao({
  id,
  eyebrow,
  titulo,
  intro,
  children,
  className,
  alternada = false,
}: {
  id: string;
  eyebrow?: string;
  titulo?: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Fundo levemente diferente, para separar blocos vizinhos. */
  alternada?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={titulo ? `${id}-titulo` : undefined}
      className={cn(
        "scroll-mt-20 border-t border-[var(--rl-border)] py-16 md:py-24",
        alternada && "bg-[var(--rl-surface)]",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        {(eyebrow || titulo || intro) && (
          <header className="mb-10 grid gap-6 md:mb-14 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-end">
            <div>
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              {titulo && (
                <h2
                  id={`${id}-titulo`}
                  className={cn(
                    classeDisplay,
                    "mt-3 text-4xl font-extrabold leading-[0.95] text-[var(--rl-fg)] [text-transform:var(--rl-display-case)] sm:text-5xl md:text-6xl",
                  )}
                >
                  {titulo}
                </h2>
              )}
            </div>
            {intro && <p className="max-w-xl text-base leading-relaxed text-[var(--rl-muted)] md:text-lg">{intro}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--rl-destaque)]",
        className,
      )}
    >
      <span aria-hidden className="h-px w-6 bg-[var(--rl-destaque)]" />
      {children}
    </p>
  );
}

/** Destaque em itálico na cor da marca, como "ESCALA." nos exemplos. */
export function Realce({ children }: { children: ReactNode }) {
  return <em className="not-italic text-[var(--rl-destaque)] [font-style:var(--rl-realce-estilo)]">{children}</em>;
}

export function NumeroGrande({
  valor,
  rotulo,
  fonte,
  className,
}: {
  valor: string;
  rotulo: string;
  fonte?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("relative border-l-2 border-[var(--rl-primaria)] pl-4", className)}>
      <p className={cn(classeDisplay, "text-4xl font-extrabold leading-none text-[var(--rl-fg)] sm:text-5xl")}>{valor}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--rl-muted)]">{rotulo}</p>
      {fonte && <p className="mt-1 text-[11px] text-[var(--rl-muted)] opacity-80">Fonte: {fonte}</p>}
    </div>
  );
}

export function IconeDaRede({ rede, className }: { rede: string; className?: string }) {
  const props = { className: cn("h-4 w-4", className), "aria-hidden": true };
  switch (rede) {
    case "instagram":
      return <Instagram {...props} />;
    case "youtube":
      return <Youtube {...props} />;
    case "facebook":
      return <Facebook {...props} />;
    case "linkedin":
      return <Linkedin {...props} />;
    case "x":
      return <Twitter {...props} />;
    case "tiktok":
      return <Music2 {...props} />;
    default:
      return <Globe {...props} />;
  }
}

/**
 * Embed com fachada: até o clique, só a miniatura (ou um cartão). Os scripts
 * de Instagram, TikTok e Facebook são pesados e põem cookies de terceiros;
 * nenhum carrega sem a pessoa pedir.
 */
export function EmbedComFachada({
  post,
  titulo,
  className,
  proporcaoDaFachada,
}: {
  post: PostParaEmbed;
  titulo: string;
  className?: string;
  /** Proporção da fachada antes do clique, para cartões vizinhos ficarem da mesma altura. */
  proporcaoDaFachada?: string;
}) {
  const [ativo, setAtivo] = useState(false);
  const [semMiniatura, setSemMiniatura] = useState(false);
  const embed = urlDeEmbed(post);
  const miniatura = semMiniatura ? null : miniaturaDoPost(post);
  const proporcao = proporcaoDaFachada ?? proporcaoDoEmbed(post);
  // O Instagram desenha cabeçalho e legenda dentro do iframe: precisa de altura.
  const aspecto = post.rede === "instagram" ? "4/6" : proporcaoDoEmbed(post);

  if (ativo && embed) {
    return (
      <div className={cn("overflow-hidden rounded-xl bg-black", className)} style={{ aspectRatio: aspecto }}>
        <iframe
          src={embed}
          title={titulo}
          className="h-full w-full"
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  const fundo = (
    <>
      {/* O gradiente fica por baixo: se a miniatura não carregar, o cartão não fica vazio. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_10%,var(--rl-primaria),transparent_60%),radial-gradient(120%_90%_at_90%_100%,var(--rl-secundaria),transparent_55%)] opacity-80"
      />
      {miniatura && (
        <img
          src={miniatura}
          alt=""
          loading="lazy"
          onError={() => setSemMiniatura(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
        <IconeDaRede rede={post.rede} className="h-3.5 w-3.5" />
        {rotuloDaRede(post.rede)}
      </span>
    </>
  );

  if (!embed) {
    return (
      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "group relative block overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]",
          className,
        )}
        style={{ aspectRatio: proporcao }}
        aria-label={`${titulo} (abre em nova aba)`}
      >
        {fundo}
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
          {verNa(post.rede)} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAtivo(true)}
      className={cn(
        "group relative block w-full overflow-hidden rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]",
        className,
      )}
      style={{ aspectRatio: proporcao }}
      aria-label={`Carregar ${titulo}`}
    >
      {fundo}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--rl-primaria)] text-[var(--rl-sobre-primaria)] shadow-2xl transition-transform duration-300 group-hover:scale-110">
          <Play className="ml-1 h-7 w-7 fill-current" aria-hidden />
        </span>
      </span>
      <span className="absolute bottom-3 left-3 right-3 text-xs text-white/80">
        Ao carregar, o conteúdo vem de {rotuloDaRede(post.rede)}.
      </span>
    </button>
  );
}

export function LinkExterno({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--rl-destaque)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]",
        className,
      )}
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}
