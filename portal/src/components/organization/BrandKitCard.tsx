import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useMarca } from "@/hooks/useMarca";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { LOGO_ACCEPT, validateLogoFile } from "@/lib/logoValidation";
import {
  PECAS_DE_LOGO,
  PRIMARIA_PADRAO,
  SECUNDARIA_PADRAO,
  corSegura,
  hexValido,
  type PecaDeLogo,
} from "@/lib/marca";

const urlPublica = (path: string | null | undefined) =>
  path ? supabase.storage.from("org-logos").getPublicUrl(path).data.publicUrl : null;

export const BrandKitCard = () => {
  const { orgId, isAdmin } = useOrganization();
  const marca = useMarca(orgId);
  const [primaria, setPrimaria] = useState(PRIMARIA_PADRAO);
  const [secundaria, setSecundaria] = useState(SECUNDARIA_PADRAO);
  const [logos, setLogos] = useState(marca.logos);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState<PecaDeLogo | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const pecaAlvo = useRef<PecaDeLogo>("horizontal");

  useEffect(() => {
    setPrimaria(marca.primaria);
    setSecundaria(marca.secundaria);
    setLogos(marca.logos);
  }, [orgId, marca]);

  const salvarCores = async () => {
    if (!orgId || !isAdmin) return;
    if (!hexValido(primaria) || !hexValido(secundaria)) {
      toast.error("Use cores no formato #RRGGBB.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("organization_brand_kits").upsert(
      { organization_id: orgId, primary_hex: primaria, secondary_hex: secundaria },
      { onConflict: "organization_id" },
    );
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível salvar as cores.");
      return;
    }
    toast.success("Cores atualizadas. Os próximos relatórios já saem com elas.");
  };

  const enviar = async (file: File, kind: PecaDeLogo) => {
    if (!orgId || !isAdmin) return;
    const check = await validateLogoFile(file);
    if (!check.ok) {
      toast.error(check.error ?? "Arquivo inválido");
      return;
    }
    if (check.warning) toast.warning(check.warning);
    setEnviando(kind);
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${orgId}/marca/${kind}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("org-logos").upload(path, file, { upsert: true });
    if (uploadError) {
      setEnviando(null);
      toast.error("Falha ao enviar o arquivo.");
      return;
    }
    const { error } = await supabase.from("organization_brand_assets").upsert(
      { organization_id: orgId, kind, storage_path: path },
      { onConflict: "organization_id,kind" },
    );
    setEnviando(null);
    if (error) {
      toast.error("O arquivo subiu, mas o cadastro da peça falhou.");
      return;
    }
    toast.success("Logo atualizado.");
    setLogos((atual) => ({ ...atual, [kind]: path }));
  };

  const preenchidas = PECAS_DE_LOGO.filter((peca) => logos[peca.kind]).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marca nos relatórios</CardTitle>
        <CardDescription>
          Primária e secundária colorem relatórios, propostas, contratos e o acento do painel.
          O exemplo da plataforma é o roxo #6206C8 com o apoio #2962FF. Logos: {preenchidas} de 6.
          Dá para salvar com um só; o que faltar usa a horizontal ou o logo único da organização.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cor-primaria">Cor primária</Label>
            <div className="flex gap-2">
              <Input
                id="cor-primaria"
                type="color"
                value={corSegura(primaria, PRIMARIA_PADRAO)}
                disabled={!isAdmin}
                onChange={(e) => setPrimaria(e.target.value.toUpperCase())}
                className="w-14 p-1"
              />
              <Input
                value={primaria}
                disabled={!isAdmin}
                onChange={(e) => setPrimaria(e.target.value)}
                aria-label="Hex da cor primária"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cor-secundaria">Cor secundária</Label>
            <div className="flex gap-2">
              <Input
                id="cor-secundaria"
                type="color"
                value={corSegura(secundaria, SECUNDARIA_PADRAO)}
                disabled={!isAdmin}
                onChange={(e) => setSecundaria(e.target.value.toUpperCase())}
                className="w-14 p-1"
              />
              <Input
                value={secundaria}
                disabled={!isAdmin}
                onChange={(e) => setSecundaria(e.target.value)}
                aria-label="Hex da cor secundária"
              />
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button type="button" onClick={salvarCores} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar cores
          </Button>
        )}

        <input
          ref={arquivo}
          type="file"
          accept={LOGO_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void enviar(file, pecaAlvo.current);
          }}
        />

        <ul className="grid gap-3 sm:grid-cols-2">
          {PECAS_DE_LOGO.map((peca) => {
            const path = logos[peca.kind];
            const url = urlPublica(path);
            return (
              <li key={peca.kind} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{peca.titulo}</div>
                  <div className="text-xs text-muted-foreground">{peca.texto}</div>
                </div>
                {isAdmin && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={enviando === peca.kind}
                    onClick={() => {
                      pecaAlvo.current = peca.kind;
                      arquivo.current?.click();
                    }}
                  >
                    {enviando === peca.kind ? <Loader2 className="h-4 w-4 animate-spin" /> : path ? "Trocar" : "Enviar"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};
