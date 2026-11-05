import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FotoDaPagina, PaginaRelatorio } from "@/lib/relatorioLanding";
import { Realce, Secao } from "../primitivos";

const POR_PAGINA = 18;

type Filtro = { chave: string; rotulo: string; aceita: (f: FotoDaPagina) => boolean };

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]",
        ativo
          ? "border-[var(--rl-primaria)] bg-[var(--rl-primaria)] text-[var(--rl-sobre-primaria)]"
          : "border-[var(--rl-border)] text-[var(--rl-fg)] hover:bg-[var(--rl-surface-2)]",
      )}
    >
      {children}
    </button>
  );
}

export function Acervo({ pagina }: { pagina: PaginaRelatorio }) {
  const { fotos, momentos, patrocinador } = pagina;
  const codigo = useMemo(() => new Map(fotos.map((f, i) => [f.id, `F${String(i + 1).padStart(2, "0")}`])), [fotos]);
  const momentoDe = useMemo(() => new Map(momentos.map((m) => [m.id, m.titulo])), [momentos]);

  const filtros = useMemo<Filtro[]>(() => {
    const lista: Filtro[] = [{ chave: "todos", rotulo: "Todos", aceita: () => true }];
    if (patrocinador && fotos.some((f) => f.do_patrocinador)) {
      lista.push({ chave: "marca", rotulo: patrocinador.nome, aceita: (f) => f.do_patrocinador });
    }
    for (const m of momentos) {
      if (fotos.some((f) => f.momento_id === m.id)) {
        lista.push({ chave: `m:${m.id}`, rotulo: m.titulo, aceita: (f) => f.momento_id === m.id });
      }
    }
    const contagem = new Map<string, number>();
    for (const f of fotos) for (const t of f.etiquetas) contagem.set(t, (contagem.get(t) ?? 0) + 1);
    for (const [t] of [...contagem].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      lista.push({ chave: `t:${t}`, rotulo: t, aceita: (f) => f.etiquetas.includes(t) });
    }
    return lista;
  }, [fotos, momentos, patrocinador]);

  const [filtro, setFiltro] = useState("todos");
  const [quantas, setQuantas] = useState(POR_PAGINA);
  const [aberta, setAberta] = useState<number | null>(null);
  const atual = filtros.find((f) => f.chave === filtro) ?? filtros[0];
  const visiveis = fotos.filter(atual.aceita);
  const foto = aberta !== null ? visiveis[aberta] : null;

  const mover = (passo: number) =>
    setAberta((i) => (i === null ? null : (i + passo + visiveis.length) % visiveis.length));

  return (
    <Secao
      id="acervo"
      eyebrow="Acervo visual"
      titulo={
        patrocinador ? (
          <>
            A presença de {patrocinador.nome}, <Realce>registro por registro.</Realce>
          </>
        ) : (
          <>
            O jogo também se vive <Realce>fora de campo.</Realce>
          </>
        )
      }
      intro={`${fotos.length} registros. Amplie a imagem para ver a legenda.`}
    >
      {filtros.length > 1 && (
        <div className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtrar fotos">
          {filtros.map((f) => (
            <Chip
              key={f.chave}
              ativo={f.chave === atual.chave}
              onClick={() => {
                setFiltro(f.chave);
                setQuantas(POR_PAGINA);
              }}
            >
              {f.rotulo}
              <span className="ml-1.5 opacity-70">{fotos.filter(f.aceita).length}</span>
            </Chip>
          ))}
        </div>
      )}

      <ul className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {visiveis.slice(0, quantas).map((f, i) => (
          <li key={f.id} className="mb-4 break-inside-avoid">
            <button
              type="button"
              onClick={() => setAberta(i)}
              className="group relative block w-full overflow-hidden rounded-xl bg-[var(--rl-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]"
              aria-label={`Ampliar ${codigo.get(f.id)}${f.legenda ? `: ${f.legenda}` : ""}`}
            >
              <img src={f.miniatura} alt={f.legenda ?? ""} loading="lazy" className="w-full transition-transform duration-500 group-hover:scale-[1.03]" />
              <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white">
                {codigo.get(f.id)} · FOTO
              </span>
              <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Expand className="h-4 w-4" aria-hidden />
              </span>
              {(f.legenda || f.momento_id) && (
                <span className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/85 to-transparent p-4 text-left text-sm text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                  {f.momento_id && (
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
                      {momentoDe.get(f.momento_id)}
                    </span>
                  )}
                  {f.legenda}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {visiveis.length > quantas && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setQuantas((q) => q + POR_PAGINA)}
            className="rounded-full border border-[var(--rl-border)] px-6 py-3 text-sm font-semibold text-[var(--rl-fg)] transition-colors hover:bg-[var(--rl-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]"
          >
            Ver mais fotos ({visiveis.length - quantas})
          </button>
        </div>
      )}

      <Dialog open={foto !== null} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent
          className="max-w-5xl border-none bg-black p-0 text-white sm:rounded-xl"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") mover(1);
            if (e.key === "ArrowLeft") mover(-1);
          }}
        >
          {foto && (
            <figure>
              <div className="relative flex max-h-[78vh] items-center justify-center bg-black">
                <img src={foto.url} alt={foto.legenda ?? ""} className="max-h-[78vh] w-auto max-w-full object-contain" />
                {visiveis.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => mover(-1)}
                      className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      aria-label="Foto anterior"
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(1)}
                      className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      aria-label="Próxima foto"
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden />
                    </button>
                  </>
                )}
              </div>
              <figcaption className="space-y-2 p-5">
                <DialogTitle className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                  {codigo.get(foto.id)} · {foto.momento_id ? momentoDe.get(foto.momento_id) : "Foto"}
                </DialogTitle>
                <DialogDescription className="text-base text-white">{foto.legenda ?? "Sem legenda."}</DialogDescription>
                {foto.etiquetas.length > 0 && (
                  <ul className="flex flex-wrap gap-2 pt-1">
                    {foto.etiquetas.map((t) => (
                      <li key={t} className="rounded-full bg-white/10 px-3 py-1 text-xs">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </figcaption>
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </Secao>
  );
}
