import { useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, Shield, History } from "lucide-react";
import { TeamManagement, type ControleDeEdicao } from "@/components/team/TeamManagement";
import { PermissionsMatrix } from "@/components/team/PermissionsMatrix";
import { TeamAuditLog } from "@/components/team/TeamAuditLog";
import { PageHeader } from "@/components/common/PageHeader";
import { useOrganization } from "@/hooks/useOrganization";

const Team = () => {
  const { isAdmin } = useOrganization();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const membros = useRef<ControleDeEdicao>(null);
  const permissoes = useRef<ControleDeEdicao>(null);

  const cancelar = () => {
    membros.current?.descartar();
    permissoes.current?.descartar();
    setEditando(false);
  };

  const salvar = async () => {
    setSalvando(true);
    const okMembros = (await membros.current?.salvar()) ?? true;
    const okPermissoes = (await permissoes.current?.salvar()) ?? true;
    setSalvando(false);
    if (okMembros && okPermissoes) setEditando(false);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <PageHeader
        title="Usuários & Permissões"
        description="Gerencie quem tem acesso, com qual papel, e acompanhe o histórico de alterações."
        actions={
          isAdmin ? (
            editando ? (
              <>
                <Button variant="outline" onClick={cancelar} disabled={salvando}>
                  Cancelar
                </Button>
                <Button onClick={salvar} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar"}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditando(true)}>
                Editar
              </Button>
            )
          ) : null
        }
      />

      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" /> Membros
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <Shield className="h-4 w-4 mr-2" /> Permissões
          </TabsTrigger>
          <TabsTrigger value="audit">
            <History className="h-4 w-4 mr-2" /> Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" forceMount className="space-y-4 data-[state=inactive]:hidden">
          <TeamManagement ref={membros} editando={editando} />
        </TabsContent>

        <TabsContent value="permissions" forceMount className="data-[state=inactive]:hidden">
          <PermissionsMatrix ref={permissoes} editando={editando} />
        </TabsContent>

        <TabsContent value="audit">
          <TeamAuditLog />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Team;
