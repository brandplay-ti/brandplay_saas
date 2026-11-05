import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataLocal } from "@/lib/datas";
import { resumoDasContrapartidas, STATUS_DA_ENTREGA, type PaginaRelatorio } from "@/lib/relatorioLanding";
import { classeDisplay } from "../estilo";
import { Realce, Secao } from "../primitivos";

// A página tem tema próprio, claro ou escuro. Os tons do painel
// (`lib/statusTone.ts`) são calibrados só para o fundo claro do app; aqui o
// texto clareia no estilo escuro.
const TOM: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 [.rl-escuro_&]:text-emerald-300",
  andamento: "bg-sky-500/15 text-sky-700 ring-sky-500/30 [.rl-escuro_&]:text-sky-300",
  pendente: "bg-zinc-500/15 text-zinc-600 ring-zinc-500/30 [.rl-escuro_&]:text-zinc-300",
  alerta: "bg-amber-500/15 text-amber-700 ring-amber-500/30 [.rl-escuro_&]:text-amber-300",
};

export function Contrapartidas({ pagina }: { pagina: PaginaRelatorio }) {
  const itens = pagina.contrapartidas;
  const resumo = resumoDasContrapartidas(itens);
  const categorias = useMemo(
    () => [...new Set(itens.map((c) => c.categoria).filter((c): c is string => Boolean(c)))],
    [itens],
  );
  const [categoria, setCategoria] = useState<string | null>(null);
  const lista = categoria ? itens.filter((c) => c.categoria === categoria) : itens;
  const comEvidencia = pagina.acesso.tipo !== "publico";

  return (
    <Secao
      id="contrapartidas"
      eyebrow="Contrapartidas"
      titulo={
        <>
          Cada entrega. <Realce>Seu registro.</Realce>
        </>
      }
      intro={`As contrapartidas do patrocínio de ${pagina.patrocinador?.nome ?? "patrocinador"}, com o status de execução de cada uma.`}
      alternada
    >
      <div className="mb-10 grid gap-6 rounded-2xl border border-[var(--rl-border)] bg-[var(--rl-bg)] p-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:p-8">
        <p className={cn(classeDisplay, "text-6xl font-extrabold text-[var(--rl-destaque)] md:text-7xl")}>{resumo.percentual}%</p>
        <div>
          <p className="text-base font-semibold text-[var(--rl-fg)]">
            {resumo.concluidas} de {resumo.total} contrapartidas concluídas
          </p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--rl-surface-2)]" aria-hidden>
            <div className="h-full rounded-full bg-[var(--rl-primaria)]" style={{ width: `${resumo.percentual}%` }} />
          </div>
        </div>
      </div>

      {categorias.length > 1 && (
        <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtrar por categoria">
          {[null, ...categorias].map((c) => (
            <button
              key={c ?? "todas"}
              type="button"
              onClick={() => setCategoria(c)}
              aria-pressed={categoria === c}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rl-destaque)]",
                categoria === c
                  ? "border-[var(--rl-primaria)] bg-[var(--rl-primaria)] text-[var(--rl-sobre-primaria)]"
                  : "border-[var(--rl-border)] text-[var(--rl-fg)] hover:bg-[var(--rl-surface-2)]",
              )}
            >
              {c ?? "Todas"}
            </button>
          ))}
        </div>
      )}

      <ol className="divide-y divide-[var(--rl-border)] overflow-hidden rounded-2xl border border-[var(--rl-border)] bg-[var(--rl-bg)]">
        {lista.map((c) => {
          const indice = itens.indexOf(c) + 1;
          const status = STATUS_DA_ENTREGA[c.status] ?? { rotulo: c.status, tom: "pendente" as const };
          const reprovada = c.aprovacao === "reprovada";
          const rotulo = reprovada ? "Reprovada" : status.rotulo;
          const tom = reprovada ? "alerta" : status.tom;
          const linha = (
            <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 p-4 md:px-6">
              <span className="text-xs font-semibold tabular-nums text-[var(--rl-muted)]">{String(indice).padStart(2, "0")}</span>
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--rl-fg)]">
                  {c.titulo}
                  {c.quantidade > 1 && <span className="ml-2 text-sm text-[var(--rl-muted)]">× {c.quantidade}</span>}
                </p>
                <p className="text-xs text-[var(--rl-muted)]">
                  {[c.categoria, c.entregue_em && `entregue em ${dataLocal(c.entregue_em).toLocaleDateString("pt-BR")}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1", TOM[tom])}>{rotulo}</span>
            </div>
          );
          if (!comEvidencia || c.evidencias.length === 0) return <li key={c.id}>{linha}</li>;
          return (
            <li key={c.id}>
              <details className="group">
                <summary className="cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--rl-destaque)] [&::-webkit-details-marker]:hidden">
                  <div className="relative pr-8">
                    {linha}
                    <ChevronDown
                      className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--rl-muted)] transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </div>
                </summary>
                <ul className="grid grid-cols-2 gap-3 px-4 pb-5 sm:grid-cols-3 md:grid-cols-6 md:px-6">
                  {c.evidencias.map((e) => (
                    <li key={e.url}>
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg">
                        <img src={e.url} alt={`Evidência de ${c.titulo}`} loading="lazy" className="aspect-square w-full object-cover" />
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ol>
    </Secao>
  );
}
