// Mesmas regras de portal/src/lib/marca.ts, para os geradores de PDF.
// Mantido aqui porque a função Deno não importa o workspace do portal.

export const PRIMARIA_PADRAO = "#6206C8";
export const SECUNDARIA_PADRAO = "#2962FF";

const PECAS = ["horizontal", "vertical", "icone", "sem_fundo", "clara", "escura"] as const;
export type PecaDeLogo = (typeof PECAS)[number];

export type Marca = {
  primaria: string;
  secundaria: string;
  logos: Partial<Record<PecaDeLogo, string>>;
  logoUnico: string | null;
};

export type SuperficieDeLogo = "cabecalho" | "fundo_claro" | "fundo_escuro" | "icone";

const ORDEM: Record<SuperficieDeLogo, PecaDeLogo[]> = {
  cabecalho: ["horizontal", "escura", "sem_fundo"],
  fundo_claro: ["escura", "horizontal", "sem_fundo"],
  fundo_escuro: ["clara", "horizontal", "sem_fundo"],
  icone: ["icone", "horizontal"],
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function corSegura(valor: unknown, fallback: string): string {
  return typeof valor === "string" && HEX.test(valor) ? valor : fallback;
}

export function componentesRgb(hex: string): [number, number, number] {
  const cor = corSegura(hex, PRIMARIA_PADRAO);
  const n = parseInt(cor.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function caminhoDoLogo(marca: Marca, superficie: SuperficieDeLogo): string | null {
  for (const kind of ORDEM[superficie]) {
    const caminho = marca.logos[kind];
    if (caminho) return caminho;
  }
  return marca.logoUnico;
}

export function montarMarca(
  kit: { primary_hex?: unknown; secondary_hex?: unknown } | null,
  assets: { kind?: unknown; storage_path?: unknown }[] | null,
  logoUnico: string | null,
): Marca {
  const logos: Marca["logos"] = {};
  for (const asset of assets ?? []) {
    if (typeof asset.kind !== "string" || typeof asset.storage_path !== "string") continue;
    if ((PECAS as readonly string[]).includes(asset.kind)) {
      logos[asset.kind as PecaDeLogo] = asset.storage_path;
    }
  }
  return {
    primaria: corSegura(kit?.primary_hex, PRIMARIA_PADRAO),
    secundaria: corSegura(kit?.secondary_hex, SECUNDARIA_PADRAO),
    logos,
    logoUnico,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Leitor = {
  from(tabela: string): {
    select(colunas: string): {
      eq(coluna: string, valor: string): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null }>;
      } & PromiseLike<{ data: Record<string, unknown>[] | null }>;
    };
  };
};

/** Lê o kit com o client do usuário. RLS devolve vazio se a organização não for dele. */
export async function carregarMarca(db: Leitor, organizationId: string | null | undefined): Promise<Marca> {
  if (!organizationId || !UUID.test(organizationId)) {
    return montarMarca(null, null, null);
  }
  const kit = await db
    .from("organization_brand_kits")
    .select("primary_hex, secondary_hex")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const assets = await db
    .from("organization_brand_assets")
    .select("kind, storage_path")
    .eq("organization_id", organizationId);
  const org = await db
    .from("organizations")
    .select("logo_path")
    .eq("id", organizationId)
    .maybeSingle();
  const lista = assets.data;
  return montarMarca(
    kit.data,
    Array.isArray(lista) ? lista : null,
    typeof org.data?.logo_path === "string" ? org.data.logo_path : null,
  );
}
