import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Building2, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationForm } from "@/components/organization/OrganizationForm";
import { CreateOrganizationDialog } from "@/components/organization/CreateOrganizationDialog";

const Settings = () => {
  const { orgId, isAdmin } = useOrganization();
  const [counts, setCounts] = useState<{ active: number; pending: number }>({ active: 0, pending: 0 });

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [{ count: active }, { count: pending }] = await Promise.all([
        supabase
          .from("organization_members")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "ativo"),
        supabase
          .from("organization_invites")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "pendente"),
      ]);
      setCounts({ active: active ?? 0, pending: pending ?? 0 });
    })();
  }, [orgId]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground mt-1">Gerencie sua organização e equipe.</p>
        </div>
        <CreateOrganizationDialog />
      </div>

      <Tabs defaultValue="organization" className="space-y-4">
        <TabsList>
          <TabsTrigger value="organization">
            <Building2 className="h-4 w-4 mr-2" /> Organização
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-4 w-4 mr-2" /> Usuários & Permissões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organization">
          <OrganizationForm />
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumo da equipe</CardTitle>
              <CardDescription>
                Acesse a página completa para convidar membros, alterar papéis e ver o histórico.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[180px] rounded-lg border border-border p-4">
                <div className="text-xs text-muted-foreground">Membros ativos</div>
                <div className="text-2xl font-semibold mt-1">{counts.active}</div>
              </div>
              <div className="flex-1 min-w-[180px] rounded-lg border border-border p-4">
                <div className="text-xs text-muted-foreground">Convites pendentes</div>
                <div className="text-2xl font-semibold mt-1">{counts.pending}</div>
              </div>
              {isAdmin && (
                <Button asChild>
                  <Link to="/dashboard/equipe">
                    Gerenciar equipe <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
