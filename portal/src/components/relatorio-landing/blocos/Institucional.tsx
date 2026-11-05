import { Download, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { numerosPrincipais, indicadoresDa, formatarIndicador, type PaginaRelatorio } from "@/lib/relatorioLanding";
import { classeDisplay, periodoDaPropriedade } from "../estilo";
import { NumeroGrande, Realce, Secao } from "../primitivos";

export function Numeros({ pagina }: { pagina: PaginaRelatorio }) {
  const numeros = numerosPrincipais(pagina);
  return (
    <Secao
      id="numeros"
      eyebrow="A dimensão do projeto"
      titulo={
        <>
          Em números<Realce>.</Realce>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
        {numeros.map((n) => (
          <NumeroGrande key={`${n.rotulo}-${n.valor}`} valor={n.valor} rotulo={n.rotulo} fonte={n.fonte} />
        ))}
      </div>
    </Secao>
  );
}

export function Transmissao({ pagina }: { pagina: PaginaRelatorio }) {
  const itens = indicadoresDa(pagina, "transmissao");
  return (
    <Secao
      id="transmissao"
      eyebrow="Transmissão"
      titulo={
        <>
          Profundidade <Realce>de jogo.</Realce>
        </>
      }
      intro="Audiência das transmissões ao vivo e dos canais parceiros, com a fonte de cada número."
      alternada
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {itens.map((i) => (
          <div key={i.id} className="rounded-2xl border border-[var(--rl-border)] bg-[var(--rl-bg)] p-6">
            <p className={cn(classeDisplay, "text-4xl font-extrabold text-[var(--rl-fg)]")}>{formatarIndicador(i)}</p>
            <p className="mt-2 text-sm font-medium text-[var(--rl-fg)]">{i.rotulo}</p>
            {i.fonte && <p className="mt-3 text-xs text-[var(--rl-muted)]">Fonte: {i.fonte}</p>}
          </div>
        ))}
      </div>
    </Secao>
  );
}

export function Resumo({ pagina }: { pagina: PaginaRelatorio }) {
  const { relatorio, propriedade } = pagina;
  const texto = relatorio.resumo?.trim() || propriedade?.sobre?.trim() || "";
  const paragrafos = texto.split(/\n{2,}|\r\n\r\n/).filter(Boolean);
  const periodo = periodoDaPropriedade(propriedade);
  const fatos = [
    periodo && { rotulo: "Período", valor: periodo },
    propriedade?.locais?.length && { rotulo: "Onde", valor: propriedade.locais.join(", ") },
    propriedade?.local_final && { rotulo: "Grande final", valor: propriedade.local_final },
    propriedade?.categoria && { rotulo: "Categoria", valor: propriedade.categoria },
  ].filter(Boolean) as { rotulo: string; valor: string }[];

  return (
    <Secao id="resumo" eyebrow="Resumo executivo" alternada>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <h2
            id="resumo-titulo"
            className={cn(
              classeDisplay,
              "text-4xl font-extrabold leading-[0.95] text-[var(--rl-fg)] [text-transform:var(--rl-display-case)] md:text-5xl",
            )}
          >
            {propriedade?.chamada ?? propriedade?.nome ?? relatorio.titulo}
          </h2>
          <div className="mt-8 space-y-5 text-lg leading-relaxed text-[var(--rl-muted)]">
            {paragrafos.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        </div>
        {fatos.length > 0 && (
          <dl className="h-fit divide-y divide-[var(--rl-border)] rounded-2xl border border-[var(--rl-border)] bg-[var(--rl-bg)]">
            {fatos.map((f) => (
              <div key={f.rotulo} className="flex flex-col gap-1 p-5">
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--rl-muted)]">{f.rotulo}</dt>
                <dd className="font-semibold capitalize text-[var(--rl-fg)]">{f.valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Secao>
  );
}

export function Patrocinadores({ pagina }: { pagina: PaginaRelatorio }) {
  const grupos = new Map<string, PaginaRelatorio["patrocinadores"]>();
  for (const p of pagina.patrocinadores) {
    const cota = p.cota ?? "Parceiros";
    grupos.set(cota, [...(grupos.get(cota) ?? []), p]);
  }
  return (
    <Secao
      id="patrocinadores"
      eyebrow="Marcas que fizeram parte"
      titulo={
        <>
          Juntas, fizeram <Realce>acontecer.</Realce>
        </>
      }
    >
      <div className="space-y-12">
        {[...grupos].map(([cota, marcas]) => (
          <div key={cota}>
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--rl-muted)]">{cota}</h3>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {marcas.map((m) => (
                <li
                  key={m.id}
                  className="flex aspect-[3/2] items-center justify-center rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
                >
                  {m.logo_url ? (
                    <img src={m.logo_url} alt={m.nome} loading="lazy" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-center text-base font-bold text-[#0F1221]">{m.nome}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Secao>
  );
}

export function Contato({ pagina }: { pagina: PaginaRelatorio }) {
  const { relatorio, organizacao, propriedade } = pagina;
  return (
    <section id="contato" aria-labelledby="contato-titulo" className="scroll-mt-20 bg-[var(--rl-primaria)] py-20 text-[var(--rl-sobre-primaria)] md:py-28">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-end lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Leve os resultados com você</p>
          <h2
            id="contato-titulo"
            className={cn(classeDisplay, "mt-4 text-4xl font-extrabold leading-[0.95] [text-transform:var(--rl-display-case)] md:text-6xl")}
          >
            {propriedade?.nome ?? relatorio.titulo}
          </h2>
          <p className="mt-5 max-w-xl text-lg opacity-90">
            {organizacao ? `Fale com ${organizacao.nome} para conhecer as próximas oportunidades.` : null}
          </p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          {relatorio.cta_url && (
            <a
              href={relatorio.cta_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-base font-semibold text-[#0F1221] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              {relatorio.cta_rotulo || "Falar com a gente"}
            </a>
          )}
          {relatorio.download_url && (
            <a
              href={relatorio.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-current px-7 py-4 text-base font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Download className="h-5 w-5" aria-hidden /> Baixar relatório completo
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
