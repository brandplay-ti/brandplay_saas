import { ArrowDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataLocal } from "@/lib/datas";
import type { PaginaRelatorio } from "@/lib/relatorioLanding";
import { classeDisplay, logoDaOrganizacao, periodoDaPropriedade } from "../estilo";

function Selo({ src, nome }: { src: string | null; nome: string }) {
  return (
    <span className="inline-flex h-12 min-w-12 items-center justify-center rounded-lg bg-white px-3 shadow-sm">
      {src ? (
        <img src={src} alt={nome} className="max-h-8 max-w-[120px] object-contain" />
      ) : (
        <span className="text-sm font-bold text-[#0F1221]">{nome}</span>
      )}
    </span>
  );
}

export function Capa({ pagina, primeiroBloco }: { pagina: PaginaRelatorio; primeiroBloco: string | null }) {
  const { relatorio, propriedade, patrocinador, organizacao } = pagina;
  const capa =
    propriedade?.capa_url ??
    pagina.fotos.find((f) => f.capa)?.url ??
    pagina.fotos.find((f) => f.do_patrocinador)?.url ??
    pagina.fotos[0]?.url ??
    null;
  const periodo = periodoDaPropriedade(propriedade);
  const ano = propriedade?.temporada ?? (propriedade?.fim ? dataLocal(propriedade.fim).getFullYear() : null);
  const escuro = relatorio.estilo === "escuro";
  const logoOrg = logoDaOrganizacao(organizacao, "claro");

  const selos = (
    <div className="flex flex-wrap items-center gap-3">
      {organizacao && <Selo src={logoOrg} nome={organizacao.nome} />}
      {patrocinador && (
        <>
          <span aria-hidden className="text-2xl font-light opacity-70">
            ×
          </span>
          <Selo src={patrocinador.logo_url} nome={patrocinador.nome} />
        </>
      )}
    </div>
  );

  const acoes = (
    <div className="mt-10 flex flex-wrap gap-3">
      {primeiroBloco && (
        <a
          href={`#${primeiroBloco}`}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            escuro
              ? "bg-[var(--rl-primaria)] text-[var(--rl-sobre-primaria)]"
              : "bg-white text-[#0F1221]",
          )}
        >
          Explorar resultados <ArrowDown className="h-4 w-4" aria-hidden />
        </a>
      )}
      {relatorio.download_url && (
        <a
          href={relatorio.download_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-current px-6 py-3 text-sm font-semibold opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2"
        >
          <Download className="h-4 w-4" aria-hidden /> Baixar relatório
        </a>
      )}
    </div>
  );

  const etiqueta = (
    <span
      className={cn(
        "inline-block rounded-sm px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em]",
        escuro ? "bg-[var(--rl-primaria)] text-[var(--rl-sobre-primaria)]" : "bg-white/15 text-current",
      )}
    >
      {patrocinador ? "Relatório de patrocínio" : "Relatório de resultados"}
      {ano ? ` · ${ano}` : ""}
    </span>
  );

  if (escuro) {
    return (
      <header id="inicio" className="relative isolate flex min-h-[92vh] items-end overflow-hidden">
        {capa ? (
          <img src={capa} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 -z-20 bg-[radial-gradient(80%_70%_at_80%_20%,var(--rl-primaria),transparent_60%),radial-gradient(70%_60%_at_10%_90%,var(--rl-secundaria),transparent_60%)] opacity-60"
          />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--rl-bg)] via-[color-mix(in_srgb,var(--rl-bg)_80%,transparent)] to-transparent" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[var(--rl-bg)] via-transparent to-[color-mix(in_srgb,var(--rl-bg)_40%,transparent)]" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(var(--rl-fg)_1px,transparent_1px),linear-gradient(90deg,var(--rl-fg)_1px,transparent_1px)] [background-size:56px_56px]"
        />
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-32 sm:px-6 md:pb-24 lg:px-8">
          {selos}
          <div className="mt-10 max-w-3xl">
            {etiqueta}
            <h1
              className={cn(
                classeDisplay,
                "mt-6 text-[clamp(3.2rem,9vw,7.5rem)] font-extrabold uppercase leading-[0.86] text-[var(--rl-fg)]",
              )}
            >
              {relatorio.titulo}
            </h1>
            {(relatorio.subtitulo || propriedade?.chamada) && (
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--rl-fg)] opacity-80 md:text-xl">
                {relatorio.subtitulo ?? propriedade?.chamada}
              </p>
            )}
            {acoes}
          </div>
          {(propriedade || periodo) && (
            <dl className="mt-16 flex flex-wrap gap-x-10 gap-y-3 border-t border-[var(--rl-border)] pt-6 text-sm">
              {propriedade && (
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-[var(--rl-muted)]">Projeto</dt>
                  <dd className="mt-1 font-semibold text-[var(--rl-fg)]">{propriedade.nome}</dd>
                </div>
              )}
              {periodo && (
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-[var(--rl-muted)]">Período</dt>
                  <dd className="mt-1 font-semibold capitalize text-[var(--rl-fg)]">{periodo}</dd>
                </div>
              )}
              {propriedade?.local_final && (
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-[var(--rl-muted)]">Grande final</dt>
                  <dd className="mt-1 font-semibold text-[var(--rl-fg)]">{propriedade.local_final}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </header>
    );
  }

  return (
    <header id="inicio" className="grid min-h-[86vh] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="relative flex flex-col justify-between bg-[var(--rl-primaria)] px-4 pb-14 pt-28 text-[var(--rl-sobre-primaria)] sm:px-10 lg:px-14">
        {selos}
        <div className="mt-12 max-w-xl">
          {etiqueta}
          <h1 className={cn(classeDisplay, "mt-6 text-[clamp(2.6rem,6vw,4.8rem)] font-bold leading-[1.02]")}>
            {relatorio.titulo}
          </h1>
          {(relatorio.subtitulo || propriedade?.chamada) && (
            <p className="mt-6 text-lg leading-relaxed opacity-90">{relatorio.subtitulo ?? propriedade?.chamada}</p>
          )}
          {acoes}
        </div>
        {(propriedade || periodo) && (
          <p className="mt-14 text-sm opacity-80">
            {[propriedade?.nome, periodo].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="relative min-h-[320px] overflow-hidden bg-[var(--rl-surface-2)]">
        {capa ? (
          <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(90%_80%_at_70%_30%,var(--rl-secundaria),transparent_65%)] opacity-50"
          />
        )}
        {pagina.fotos[0]?.legenda && capa === pagina.fotos[0]?.url && (
          <p className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6 text-sm text-white">
            {pagina.fotos[0].legenda}
          </p>
        )}
      </div>
    </header>
  );
}
