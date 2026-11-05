import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrganization } from "@/hooks/useOrganization";
import { useAcessoDoMembro, usePessoasDaOrganizacao } from "@/hooks/useEquipesDeTrabalho";
import { ACESSO_AO_PROJETO, arvoreDeProjetos } from "@/lib/equipes";
import { rotuloDoPapel } from "@/lib/permissoes";

/**
 * "Ver como": o administrador escolhe um membro e vê os projetos que ele
 * alcança pelas equipes (`acesso_do_membro`). Só leitura; não troca de sessão.
 */
export function VerComoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { orgId } = useOrganization();
  const pessoas = usePessoasDaOrganizacao(orgId);
  const [userId, setUserId] = useState<string | null>(null);
  const acesso = useAcessoDoMembro(orgId, open ? userId : null);

  const ativas = (pessoas.data ?? []).filter((p) => p.status === "ativo");
  const escolhida = ativas.find((p) => p.user_id === userId) ?? null;
  const veTudo = escolhida?.role === "owner" || escolhida?.role === "admin";

  const lista = acesso.data ?? [];
  const porId = new Map(lista.map((p) => [p.property_id, p]));
  const emOrdem = arvoreDeProjetos(
    lista.map((p) => ({ id: p.property_id, name: p.property_name, parent_property_id: p.parent_property_id })),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ver como</DialogTitle>
          <DialogDescription>
            Projetos que a pessoa alcança pelas equipes. Hoje todos os papéis veem a organização inteira; esta lista é o
            que ela verá quando o papel dela passar para o escopo "Minhas equipes".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="ver-como-membro">Membro</Label>
          <Select value={userId ?? undefined} onValueChange={setUserId}>
            <SelectTrigger id="ver-como-membro">
              <SelectValue placeholder="Escolha um membro" />
            </SelectTrigger>
            <SelectContent>
              {ativas.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.nome} · {rotuloDoPapel(p.role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {escolhida && veTudo && (
          <p className="text-sm text-muted-foreground">
            {rotuloDoPapel(escolhida.role)} sempre vê a organização inteira, com ou sem equipe.
          </p>
        )}

        {escolhida && !veTudo && (
          <div className="space-y-2">
            {acesso.isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : acesso.isError ? (
              <p className="text-sm text-destructive">Não foi possível calcular o acesso deste membro.</p>
            ) : emOrdem.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">
                {escolhida.nome} não alcança nenhum projeto pelas equipes. Com o escopo "Minhas equipes", não veria
                nenhum registro de projeto.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border">
                {emOrdem.map((p) => {
                  const item = porId.get(p.id);
                  if (!item) return null;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span style={{ paddingLeft: `${p.nivel * 16}px` }} className="font-medium">
                        {p.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={item.access === "write" ? "default" : "secondary"}>
                          {ACESSO_AO_PROJETO[item.access]}
                        </Badge>
                        {item.team_names.map((t) => (
                          <Badge key={t} variant="outline" className="font-normal">
                            {t}
                          </Badge>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
