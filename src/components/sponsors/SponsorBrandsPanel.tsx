import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Tag } from "lucide-react";

const db = supabase as any;

interface SponsorBrand {
  id: string;
  name: string;
  category: string | null;
  website: string | null;
  is_active: boolean;
}

export const SponsorBrandsPanel = ({ sponsorId }: { sponsorId: string }) => {
  const { user } = useAuth();
  const { orgId, can } = useOrganization();
  const { toast } = useToast();
  const [brands, setBrands] = useState<SponsorBrand[]>([]);
  const [form, setForm] = useState({ name: "", category: "", website: "" });
  const [loading, setLoading] = useState(true);
  const editable = can("crm");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db
      .from("sponsor_brands")
      .select("id,name,category,website,is_active")
      .eq("sponsor_id", sponsorId)
      .order("name");
    setBrands((data ?? []) as SponsorBrand[]);
    setLoading(false);
  }, [sponsorId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !orgId) return;
    const { error } = await db.from("sponsor_brands").insert({
      organization_id: orgId,
      sponsor_id: sponsorId,
      name: form.name.trim(),
      category: form.category.trim() || null,
      website: form.website.trim() || null,
      created_by: user?.id ?? null,
    });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setForm({ name: "", category: "", website: "" });
    load();
  };

  const toggleActive = async (b: SponsorBrand) => {
    await db.from("sponsor_brands").update({ is_active: !b.is_active }).eq("id", b.id);
    load();
  };

  const remove = async (b: SponsorBrand) => {
    await db.from("sponsor_brands").delete().eq("id", b.id);
    load();
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : brands.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma marca cadastrada para esta conta.</p>
      ) : (
        brands.map((b) => (
          <Card key={b.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{b.name}</p>
                  {!b.is_active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{b.category ?? "Sem categoria"}</p>
              </div>
              {editable && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(b)}>
                    {b.is_active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(b)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {editable && (
        <div className="rounded-md border border-dashed p-3 space-y-2">
          <Input placeholder="Nome da marca" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input placeholder="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <Button size="sm" className="w-full" disabled={!form.name.trim()} onClick={create}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar marca
          </Button>
        </div>
      )}
    </div>
  );
};
