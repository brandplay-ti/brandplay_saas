import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Shield, History } from "lucide-react";
import { TeamManagement } from "@/components/team/TeamManagement";
import { PermissionsMatrix } from "@/components/team/PermissionsMatrix";
import { TeamAuditLog } from "@/components/team/TeamAuditLog";
import { PageHeader } from "@/components/common/PageHeader";

const Team = () => {
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <PageHeader
        title="Usuários & Permissões"
        description="Gerencie quem tem acesso, com qual papel, e acompanhe o histórico de alterações."
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

        <TabsContent value="members" className="space-y-4">
          <TeamManagement />
        </TabsContent>

        <TabsContent value="permissions">
          <PermissionsMatrix />
        </TabsContent>

        <TabsContent value="audit">
          <TeamAuditLog />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Team;
