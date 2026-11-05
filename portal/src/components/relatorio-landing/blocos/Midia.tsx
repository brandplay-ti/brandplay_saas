import { useState } from "react";
import { Eye, Heart, MessageSquare, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataLocal } from "@/lib/datas";
import { rotuloDaRede } from "@/lib/redesSociais";
import { ehMateria, numeroCompacto, videoEmDestaque, type PaginaRelatorio, type PostDaPagina } from "@/lib/relatorioLanding";
import { classeDisplay, verNa } from "../estilo";
import { EmbedComFachada, IconeDaRede, LinkExterno, Realce, Secao } from "../primitivos";

const data = (d: string | null) => (d ? dataLocal(d).toLocaleDateString("pt-BR") : null);
const tituloDo = (p: PostDaPagina) => p.titulo || `${rotuloDaRede(p.rede)} · ${p.tipo === "reel" ? "vídeo curto" : p.tipo}`;

export function VideoDestaque({ pagina }: { pagina: PaginaRelatorio }) {
  const video = videoEmDestaque(pagina)!;
  return (
    <Secao
      id="video"
      eyebrow="Vídeo em destaque"
      titulo={
        <>
          Viva a <Realce>competição.</Realce>
        </>
      }
      intro={video.titulo ?? undefined}
    >
      <EmbedComFachada post={video} titulo={tituloDo(video)} className="shadow-2xl" />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--rl-muted)]">
        <span>
          {video.views ? `${numeroCompacto(video.views)} visualizações` : null}
          {video.views && video.publicado_em ? " · " : null}
          {data(video.publicado_em)}
        </span>
        <LinkExterno href={video.url}>Assistir no YouTube</LinkExterno>
      </div>
    </Secao>
  );
}

function Metricas({ post }: { post: PostDaPagina }) {
  const itens = [
    { icone: Eye, valor: post.views, rotulo: "visualizações" },
    { icone: Heart, valor: post.likes, rotulo: "curtidas" },
    { icone: MessageSquare, valor: post.comentarios, rotulo: "comentários" },
  ].filter((i) => typeof i.valor === "number" && i.valor > 0);
  if (itens.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--rl-muted)]">
      {itens.map(({ icone: Icone, valor, rotulo }) => (
        <li key={rotulo} className="inline-flex items-center gap-1">
          <Icone className="h-3.5 w-3.5" aria-hidden />
          <span className="font-semibold text-[var(--rl-fg)]">{numeroCompacto(valor!)}</span>
          <span className="sr-only">{rotulo}</span>
        </li>
      ))}
    </ul>
  );
}

const POR_PAGINA = 9;

export function Conteudos({ pagina }: { pagina: PaginaRelatorio }) {
  const posts = pagina.posts.filter((p) => !ehMateria(p));
  const ordenados = [...posts].sort(
    (a, b) =>
      Number(b.do_patrocinador) - Number(a.do_patrocinador) ||
      Number(b.destaque) - Number(a.destaque) ||
      (b.views ?? 0) - (a.views ?? 0),
  );
  const ranking = [...posts]
    .filter((p) => (p.views ?? 0) > 0)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 10);
  const [quantos, setQuantos] = useState(POR_PAGINA);

  return (
    <Secao
      id="conteudos"
      eyebrow="Conteúdo em movimento"
      titulo={
        <>
          Em cada tela, <Realce>o jogo continua.</Realce>
        </>
      }
      intro="Posts, reels e vídeos publicados ao longo da temporada. Toque para carregar o conteúdo original."
    >
      {ranking.length >= 3 && (
        <div className="mb-14 rounded-2xl border border-[var(--rl-border)] bg-[var(--rl-surface)] p-6 md:p-8">
          <h3 className={cn(classeDisplay, "text-2xl font-extrabold text-[var(--rl-fg)] [text-transform:var(--rl-display-case)]")}>
            Onde a atenção bateu mais forte
          </h3>
          <ol className="mt-6 divide-y divide-[var(--rl-border)]">
            {ranking.map((p, i) => (
              <li key={p.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-3">
                <span className={cn(classeDisplay, "w-10 text-2xl font-extrabold text-[var(--rl-destaque)]")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-2 font-medium text-[var(--rl-fg)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]"
                >
                  <IconeDaRede rede={p.rede} className="shrink-0 text-[var(--rl-muted)]" />
                  <span className="truncate">{tituloDo(p)}</span>
                </a>
                <span className="text-right text-sm tabular-nums text-[var(--rl-fg)]">
                  {numeroCompacto(p.views ?? 0)}
                  <span className="ml-1 text-xs text-[var(--rl-muted)]">views</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ordenados.slice(0, quantos).map((p) => (
          <li key={p.id} className="flex flex-col gap-3">
            <EmbedComFachada post={p} titulo={tituloDo(p)} />
            <div className="flex flex-col gap-2">
              <p className="line-clamp-2 text-sm font-semibold text-[var(--rl-fg)]">{tituloDo(p)}</p>
              <Metricas post={p} />
              <div className="flex items-center justify-between gap-3 text-xs text-[var(--rl-muted)]">
                <span>{data(p.publicado_em)}</span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[var(--rl-destaque)] hover:underline"
                >
                  {verNa(p.rede)}
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {ordenados.length > quantos && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => setQuantos((q) => q + POR_PAGINA)}
            className="rounded-full border border-[var(--rl-border)] px-6 py-3 text-sm font-semibold text-[var(--rl-fg)] transition-colors hover:bg-[var(--rl-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]"
          >
            Ver mais conteúdos ({ordenados.length - quantos})
          </button>
        </div>
      )}
      {posts.some((p) => p.metricas_origem === "api") && (
        <p className="mt-8 text-xs text-[var(--rl-muted)]">
          Métricas do YouTube atualizadas automaticamente. As das demais redes são informadas pela organização.
        </p>
      )}
    </Secao>
  );
}

const veiculo = (p: PostDaPagina) => {
  if (p.fonte) return p.fonte;
  try {
    return new URL(p.url).hostname.replace(/^www\./, "");
  } catch {
    return "Imprensa";
  }
};

export function Imprensa({ pagina }: { pagina: PaginaRelatorio }) {
  const materias = pagina.posts.filter(ehMateria);
  return (
    <Secao
      id="imprensa"
      eyebrow="Na imprensa"
      titulo={
        <>
          A temporada <Realce>virou notícia.</Realce>
        </>
      }
      alternada
    >
      <ul className="grid gap-5 md:grid-cols-3">
        {materias.map((m) => (
          <li key={m.id}>
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-full flex-col justify-between gap-6 rounded-2xl border border-[var(--rl-border)] bg-[var(--rl-bg)] p-6 transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]"
            >
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--rl-destaque)]">
                  <Newspaper className="h-4 w-4" aria-hidden /> {veiculo(m)}
                </p>
                <p className={cn(classeDisplay, "mt-4 text-xl font-bold leading-snug text-[var(--rl-fg)] [text-transform:var(--rl-display-case)]")}>
                  {m.titulo ?? "Matéria"}
                </p>
              </div>
              <p className="flex items-center justify-between text-sm text-[var(--rl-muted)]">
                <span>{data(m.publicado_em)}</span>
                <span className="font-semibold text-[var(--rl-fg)] group-hover:underline">Ler matéria →</span>
              </p>
            </a>
          </li>
        ))}
      </ul>
    </Secao>
  );
}
