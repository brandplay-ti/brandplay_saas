import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Circle, Compass, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { GuiaDePrimeirosPassos, PassoComSituacao } from "@/lib/primeirosPassos";

type Props = {
  guia: GuiaDePrimeirosPassos;
  onOcultar: () => void;
};

/** Guia "Primeiros passos" do Dashboard (docs/business/primeiros-passos.md). */
export const PrimeirosPassosWidget = ({ guia, onOcultar }: Props) => {
  const obrigatorios = guia.passos.filter((p) => !p.opcional);
  const opcionais = guia.passos.filter((p) => p.opcional);
  const proximo = obrigatorios.find((p) => !p.concluido)?.id;
  const percentual = guia.total === 0 ? 100 : Math.round((guia.concluidos / guia.total) * 100);

  return (
    <Card aria-labelledby="primeiros-passos-titulo">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Compass className="h-4 w-4" />
          </div>
          <div>
            <CardTitle id="primeiros-passos-titulo" className="text-base">
              Primeiros passos
            </CardTitle>
            <CardDescription className="mt-1">
              A ordem sugerida para colocar a operação de pé. Cada passo se marca sozinho quando o cadastro existe.
            </CardDescription>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onOcultar} className="gap-2 self-start">
          <EyeOff className="h-3.5 w-3.5" /> Ocultar guia
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {guia.concluidos} de {guia.total} concluídos
            </span>
            <span>{percentual}%</span>
          </div>
          <Progress value={percentual} className="h-2" aria-label="Progresso dos primeiros passos" />
        </div>

        <ol className="space-y-2" aria-label="Passos sugeridos">
          {obrigatorios.map((passo, i) => (
            <ItemDoPasso key={passo.id} passo={passo} numero={i + 1} destaque={passo.id === proximo} />
          ))}
        </ol>

        {opcionais.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quando quiser</p>
            <ul className="space-y-2" aria-label="Passos opcionais">
              {opcionais.map((passo) => (
                <ItemDoPasso key={passo.id} passo={passo} destaque={false} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ItemDoPasso = ({ passo, numero, destaque }: { passo: PassoComSituacao; numero?: number; destaque: boolean }) => (
  <li
    className={cn(
      "flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center",
      destaque ? "border-primary/40 bg-primary/5" : "border-border",
    )}
  >
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {passo.concluido ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", passo.concluido && "text-muted-foreground line-through")}>
          {numero !== undefined && <span className="sr-only">Passo {numero}: </span>}
          {passo.titulo}
          <span className="sr-only">{passo.concluido ? " (concluído)" : " (pendente)"}</span>
        </p>
        {!passo.concluido && <p className="mt-0.5 text-xs text-muted-foreground">{passo.descricao}</p>}
      </div>
    </div>
    {!passo.concluido && (
      <Button asChild size="sm" variant={destaque ? "default" : "outline"} className="shrink-0 gap-1.5 self-start sm:self-center">
        <Link to={passo.url}>
          {passo.rotuloDaAcao} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    )}
  </li>
);
