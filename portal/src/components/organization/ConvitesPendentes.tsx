import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { rotuloDoPapel } from "@/lib/permissoes";
import type { ConviteDeOrganizacao } from "@/hooks/useConvitesDeOrganizacao";

type Props = {
  convites: ConviteDeOrganizacao[];
  /** Convite com ação em andamento; os botões ficam desabilitados. */
  ocupado: string | null;
  onAceitar: (convite: ConviteDeOrganizacao) => void;
  onRecusar: (convite: ConviteDeOrganizacao) => void;
};

export const ConvitesPendentes = ({ convites, ocupado, onAceitar, onRecusar }: Props) => (
  <ul className="space-y-3">
    {convites.map((convite) => (
      <li
        key={convite.id}
        className="flex flex-col gap-4 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{convite.organization_name}</p>
          <div className="mt-1 text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">
              {rotuloDoPapel(convite.role)}
            </Badge>
            {convite.invited_by_name ? `Convite de ${convite.invited_by_name}. ` : ""}
            Vale até {format(new Date(convite.expires_at), "dd/MM/yyyy", { locale: ptBR })}.
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onRecusar(convite)}
            disabled={ocupado !== null}
            aria-label={`Recusar convite de ${convite.organization_name}`}
          >
            Recusar
          </Button>
          <Button
            onClick={() => onAceitar(convite)}
            disabled={ocupado !== null}
            aria-label={`Aceitar convite de ${convite.organization_name}`}
          >
            {ocupado === convite.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aceitar
          </Button>
        </div>
      </li>
    ))}
  </ul>
);
