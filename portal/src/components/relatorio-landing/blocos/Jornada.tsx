import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaginaRelatorio } from "@/lib/relatorioLanding";
import { classeDisplay } from "../estilo";
import { Realce, Secao } from "../primitivos";

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");

export function Jornada({ pagina }: { pagina: PaginaRelatorio }) {
  const fotoDo = (momentoId: string) =>
    pagina.fotos.find((f) => f.momento_id === momentoId && f.do_patrocinador) ??
    pagina.fotos.find((f) => f.momento_id === momentoId);
  const destaque = pagina.momentos.filter((m) => fotoDo(m.id)).slice(0, 3);
  const nomeDoDestaque = pagina.patrocinador ? `A parceria ganha vida` : "Da primeira bola";

  return (
    <Secao
      id="jornada"
      eyebrow="Jornada da temporada"
      titulo={
        <>
          {nomeDoDestaque} <Realce>{pagina.patrocinador ? "em campo." : "ao título."}</Realce>
        </>
      }
      intro={`${pagina.momentos.length} momentos registrados, do primeiro encontro à celebração.`}
    >
      {destaque.length > 0 && (
        <div className="mb-14 grid gap-5 md:grid-cols-3">
          {destaque.map((m, i) => {
            const foto = fotoDo(m.id)!;
            return (
              <figure
                key={m.id}
                className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--rl-surface-2)]"
              >
                <img
                  src={foto.miniatura}
                  alt={foto.legenda ?? m.titulo}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-6 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">
                    {String(i + 1).padStart(2, "0")} · {m.titulo}
                  </p>
                  {foto.legenda && <p className="mt-2 text-sm leading-snug opacity-95">{foto.legenda}</p>}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}

      <ol className="relative grid gap-x-8 gap-y-8 border-l border-[var(--rl-border)] pl-6 sm:grid-cols-2 sm:border-l-0 sm:pl-0 lg:grid-cols-4">
        {pagina.momentos.map((m, i) => (
          <li key={m.id} className="relative sm:border-t sm:border-[var(--rl-border)] sm:pt-6">
            <span
              aria-hidden
              className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--rl-primaria)] sm:-top-[5px] sm:left-0"
            />
            <p className={cn(classeDisplay, "text-3xl font-extrabold text-[var(--rl-destaque)]")}>
              {String(i + 1).padStart(2, "0")}.
            </p>
            <p className="mt-2 text-base font-semibold text-[var(--rl-fg)]">{m.titulo}</p>
            <p className="mt-1 text-sm capitalize text-[var(--rl-muted)]">{dia(m.inicio)}</p>
            {m.local && (
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-[var(--rl-muted)]">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {m.local}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Secao>
  );
}
