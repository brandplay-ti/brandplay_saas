import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { formatDateTime } from "@/lib/billing";

/** Faixa da sessão de suporte: prazo, organização e encerramento. */
export const SupportSessionBanner = () => {
  const { orgId, organizations, switchOrganization } = useOrganization();
  const [encerrando, setEncerrando] = useState(false);
  const sessao = organizations.find((o) => o.suporte);
  if (!sessao?.suporte) return null;

  const vendo = orgId === sessao.id;

  const encerrar = async () => {
    setEncerrando(true);
    const { error } = await supabase.rpc("admin_encerrar_sessao_suporte", {
      _sessao_id: sessao.suporte!.id,
      _comentario: "Encerrada pelo operador na tela do painel",
    });
    if (error) {
      setEncerrando(false);
      toast.error(error.message);
      return;
    }
    window.location.assign("/admin/clientes");
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm">
        <Eye className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Sessão de suporte em <strong>{sessao.name}</strong> até {formatDateTime(sessao.suporte.expires_at)}.
          {vendo ? " Este painel está aberto com papel de admin." : " A sessão continua aberta em outra organização."}
        </span>
      </p>
      <div className="flex gap-2">
        {!vendo && (
          <Button type="button" size="sm" variant="outline" onClick={() => switchOrganization(sessao.id)}>
            Abrir painel
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={encerrar} disabled={encerrando}>
          {encerrando && <Loader2 className="animate-spin" />}
          Encerrar
        </Button>
      </div>
    </div>
  );
};
