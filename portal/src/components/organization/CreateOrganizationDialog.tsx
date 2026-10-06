import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";
import { formatCNPJ, isValidCNPJ, onlyDigits } from "@/lib/cnpj";
import { logBackendDbError } from "@/lib/backendErrorLogger";

type Props = { trigger?: React.ReactNode; onCreated?: (orgId: string) => void };

type CreateOrganizationResponse = {
  organizationId?: string;
  error?: string;
  diagnostic?: {
    title?: string;
    probableCause?: string;
    checks?: string[];
    suggestedFix?: string;
  } | null;
};

export const CreateOrganizationDialog = ({ trigger, onCreated }: Props) => {
  const { user } = useAuth();
  const { refresh, switchOrganization } = useOrganization();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!user) return;
    if (name.trim().length < 2) {
      toast.error("Informe o nome da organização");
      return;
    }
    if (!isValidCNPJ(cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke<CreateOrganizationResponse>("create-organization", {
      body: { name: name.trim(), cnpj: onlyDigits(cnpj) },
    });
    setLoading(false);
    if (error || data?.error) {
      const errorMessage = data?.error ?? error?.message ?? "Falha ao criar organização";
      await logBackendDbError({
        table: "organizations",
        action: "RPC:create_organization_with_owner",
        clientFile: "src/components/organization/CreateOrganizationDialog.tsx",
        clientLine: 34,
        attemptedRowKeys: ["name", "cnpj"],
        error: { message: errorMessage },
      });
      if (data?.diagnostic) {
        toast.error(data.diagnostic.title ?? "Erro de permissão ao criar organização", {
          description: `${data.diagnostic.probableCause ?? errorMessage} Correção sugerida: ${data.diagnostic.suggestedFix ?? "faça login novamente e tente outra vez."}`,
          duration: 10000,
        });
      } else {
        toast.error(errorMessage.includes("CNPJ") || errorMessage.includes("organizations_cnpj_unique")
          ? "Este CNPJ já está cadastrado"
          : "Erro: " + errorMessage);
      }
      return;
    }
    if (!data?.organizationId) {
      toast.error("Organização criada, mas não foi possível confirmar o identificador. Atualize a página.");
      return;
    }
    toast.success("Organização criada");
    setName("");
    setCnpj("");
    setOpen(false);
    await refresh();
    onCreated?.(data.organizationId);
    switchOrganization(data.organizationId);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" /> Nova organização
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar nova organização</DialogTitle>
          <DialogDescription>
            Você será o owner desta organização. Pode completar os outros dados depois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Minha empresa LTDA" />
          </div>
          <div className="space-y-1.5">
            <Label>CNPJ *</Label>
            <Input
              value={cnpj}
              onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
