import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MARCA_PADRAO, montarMarca, type Marca } from "@/lib/marca";

export function useMarca(orgId: string | null): Marca {
  const [marca, setMarca] = useState<Marca>(MARCA_PADRAO);

  useEffect(() => {
    if (!orgId) {
      setMarca(MARCA_PADRAO);
      return;
    }
    let ativo = true;
    (async () => {
      const [kit, assets, org] = await Promise.all([
        supabase
          .from("organization_brand_kits")
          .select("primary_hex, secondary_hex")
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("organization_brand_assets")
          .select("kind, storage_path")
          .eq("organization_id", orgId),
        supabase.from("organizations").select("logo_path").eq("id", orgId).maybeSingle(),
      ]);
      if (!ativo) return;
      setMarca(montarMarca(kit.data, assets.data, org.data?.logo_path ?? null));
    })();
    return () => {
      ativo = false;
    };
  }, [orgId]);

  return marca;
}
