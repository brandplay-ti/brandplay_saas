import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SponsorAccess {
  sponsor_id: string;
  sponsor_name: string;
  status: string;
}

/**
 * Lista os patrocinadores aos quais o usuário logado tem acesso pelo Portal do Patrocinador.
 */
export const useSponsorAccess = () => {
  const { user, loading: authLoading } = useAuth();
  const [accesses, setAccesses] = useState<SponsorAccess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAccesses([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sponsor_portal_access")
        .select("sponsor_id, status, sponsors(name)")
        .eq("user_id", user.id)
        .eq("status", "ativo");
      setAccesses(
        (data ?? []).map((r: any) => ({
          sponsor_id: r.sponsor_id,
          sponsor_name: r.sponsors?.name ?? "Patrocinador",
          status: r.status,
        })),
      );
      setLoading(false);
    })();
  }, [user, authLoading]);

  return { accesses, loading: loading || authLoading, hasAccess: accesses.length > 0 };
};
