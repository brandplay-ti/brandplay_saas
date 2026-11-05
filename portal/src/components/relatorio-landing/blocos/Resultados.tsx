import { BarChart3, Eye, Heart, Layers, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatarIndicador,
  gruposDePublico,
  indicadoresDa,
  numeroCompacto,
  somaDosPosts,
  type PaginaRelatorio,
} from "@/lib/relatorioLanding";
import { classeDisplay } from "../estilo";
import { Realce, Secao } from "../primitivos";

const horario = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

export function Digital({ pagina }: { pagina: PaginaRelatorio }) {
  const doPatrocinador = Boolean(pagina.patrocinador) && pagina.posts.some((p) => p.do_patrocinador);
  const soma = somaDosPosts(pagina.posts, doPatrocinador);
  const cards = [
    { icone: Eye, rotulo: "Visualizações acumuladas", valor: soma.views },
    { icone: MessageSquare, rotulo: "Interações registradas", valor: soma.interacoes },
    { icone: Layers, rotulo: "Conteúdos", valor: soma.conteudos },
    { icone: Heart, rotulo: "Curtidas", valor: soma.likes },
  ].filter((c) => c.valor > 0);
  const indicadores = indicadoresDa(pagina, "digital");
  const ultimaMetrica = pagina.posts
    .map((p) => p.metricas_em)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const nome = pagina.patrocinador?.nome;

  return (
    <Secao
      id="digital"
      eyebrow={nome ? `Resultados de ${nome}` : "Painel social"}
      titulo={
        <>
          Digital<Realce>.</Realce>
        </>
      }
      intro={
        nome
          ? `Consolidação dos resultados digitais dos conteúdos associados a ${nome}.`
          : "Consolidação dos resultados digitais da temporada, por conteúdo e por canal."
      }
      alternada
    >
      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map(({ icone: Icone, rotulo, valor }) => (
            <div key={rotulo} className="rounded-2xl border border-[var(--rl-border)] bg-[var(--rl-bg)] p-6">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-[var(--rl-muted)]">
                <span>{rotulo}</span>
                <Icone className="h-4 w-4 text-[var(--rl-destaque)]" aria-hidden />
              </div>
              <p className={cn(classeDisplay, "mt-4 text-4xl font-extrabold tabular-nums text-[var(--rl-fg)] md:text-5xl")}>
                {rotulo === "Conteúdos" ? soma.conteudos : numeroCompacto(valor)}
              </p>
            </div>
          ))}
        </div>
      )}

      {indicadores.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {indicadores.map((i) => (
            <li
              key={i.id}
              className={cn(
                "flex items-start justify-between gap-4 rounded-2xl border p-5",
                i.do_patrocinador
                  ? "border-[var(--rl-primaria)] bg-[var(--rl-bg)]"
                  : "border-[var(--rl-border)] bg-[var(--rl-bg)]",
              )}
            >
              <div>
                <p className="text-sm font-medium text-[var(--rl-fg)]">{i.rotulo}</p>
                {i.fonte && <p className="mt-1 text-xs text-[var(--rl-muted)]">Fonte: {i.fonte}</p>}
              </div>
              <p className={cn(classeDisplay, "shrink-0 text-3xl font-extrabold text-[var(--rl-destaque)]")}>
                {formatarIndicador(i)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {ultimaMetrica && (
        <p className="mt-6 inline-flex items-center gap-2 text-xs text-[var(--rl-muted)]">
          <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Métricas atualizadas em {horario(ultimaMetrica)}
        </p>
      )}
    </Secao>
  );
}

export function Publico({ pagina }: { pagina: PaginaRelatorio }) {
  const grupos = gruposDePublico(pagina);
  return (
    <Secao
      id="publico"
      eyebrow="Quem vive o projeto"
      titulo={
        <>
          O público <Realce>por trás do jogo.</Realce>
        </>
      }
      intro="Localização, idade, gênero e outros recortes ajudam a conhecer a comunidade que acompanha o projeto."
    >
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {grupos.map(({ grupo, itens }) => {
          const percentual = itens.every((i) => i.formato === "percentual");
          const maior = Math.max(...itens.map((i) => Number(i.valor)), 1);
          const fontes = [...new Set(itens.map((i) => i.fonte).filter(Boolean))];
          return (
            <figure key={grupo} className="rounded-2xl border border-[var(--rl-border)] bg-[var(--rl-surface)] p-6">
              <figcaption className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--rl-muted)]">{grupo}</figcaption>
              <ul className="mt-5 space-y-3">
                {itens.map((i) => {
                  const largura = Math.max(2, (Number(i.valor) / (percentual ? 100 : maior)) * 100);
                  return (
                    <li key={i.id}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-[var(--rl-fg)]">{i.rotulo}</span>
                        <span className="font-semibold tabular-nums text-[var(--rl-fg)]">{formatarIndicador(i)}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--rl-surface-2)]" aria-hidden>
                        <div
                          className="h-full rounded-full bg-[var(--rl-primaria)]"
                          style={{ width: `${Math.min(100, largura)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {fontes.length > 0 && <p className="mt-5 text-xs text-[var(--rl-muted)]">Fonte: {fontes.join(" · ")}</p>}
            </figure>
          );
        })}
      </div>
    </Secao>
  );
}
