import { HardDrive, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useUsoDeArmazenamento } from "@/hooks/useUsoDeArmazenamento";
import { fatiaDoTotal, formatarBytes } from "@/lib/armazenamento";
import { formatarNumero } from "@/lib/mascaras";

const arquivos = (n: number) => `${formatarNumero(n)} ${n === 1 ? "arquivo" : "arquivos"}`;

/**
 * Quanto a organização guarda de mídia da edição (BP-7.17, D3, RF12): total e
 * divisão por projeto e edição, pelo tamanho real dos objetos no R2. Sem
 * limite por plano por enquanto: a revisão dos planos vai usar este número.
 */
export const StorageUsageCard = ({ orgId }: { orgId: string | null }) => {
  const uso = useUsoDeArmazenamento(orgId);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardDescription className="flex items-center gap-1.5">
          <HardDrive className="h-4 w-4" aria-hidden /> Armazenamento de mídia
        </CardDescription>
        {uso.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando armazenamento" />
        ) : uso.isError || !uso.data ? (
          <p className="text-sm text-destructive">Não foi possível carregar o uso de armazenamento.</p>
        ) : (
          <>
            <CardTitle className="text-2xl">{formatarBytes(uso.data.bytes)}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {uso.data.objetos > 0 ? `${arquivos(uso.data.objetos)} guardados. ` : ""}
              Vídeos e fotos do material das edições. Seu plano ainda não tem limite de armazenamento.
            </p>
          </>
        )}
      </CardHeader>
      {uso.data && (
        <CardContent>
          {uso.data.projetos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum vídeo ou foto guardado ainda. O uso aparece aqui assim que o primeiro envio terminar.
            </p>
          ) : (
            <ul className="space-y-4" aria-label="Uso por projeto">
              {uso.data.projetos.map((projeto) => (
                <li key={projeto.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{projeto.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatarBytes(projeto.bytes)}</span>
                  </div>
                  <Progress
                    value={fatiaDoTotal(projeto.bytes, uso.data.bytes)}
                    aria-label={`${projeto.name}: ${formatarBytes(projeto.bytes)}, ${fatiaDoTotal(projeto.bytes, uso.data.bytes)}% do total`}
                  />
                  {(projeto.edicoes.length > 1 || projeto.edicoes[0]?.id !== projeto.id) && (
                    <ul className="space-y-1 border-l pl-3" aria-label={`Edições de ${projeto.name}`}>
                      {projeto.edicoes.map((edicao) => (
                        <li key={edicao.id} className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-muted-foreground">
                            {edicao.id === projeto.id ? "No próprio projeto" : edicao.name}
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {formatarBytes(edicao.bytes)} · {arquivos(edicao.objetos)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
};
