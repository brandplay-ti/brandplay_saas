// Regras puras da marca da organização. O mesmo contrato vale no gerador
// de PDF (`supabase/functions/_shared/marca.ts`): na dúvida, os dois testes
// precisam continuar contando a mesma história.

export const PRIMARIA_PADRAO = "#6206C8";
export const SECUNDARIA_PADRAO = "#2962FF";

export const PECAS_DE_LOGO = [
  { kind: "horizontal", titulo: "Horizontal", texto: "Cabeçalho de relatório, proposta e contrato." },
  { kind: "vertical", titulo: "Vertical", texto: "Capa e espaços altos." },
  { kind: "icone", titulo: "Ícone", texto: "Avatar e seletor da organização." },
  { kind: "sem_fundo", titulo: "Sem fundo", texto: "Sobreposição em foto e material de campo." },
  { kind: "clara", titulo: "Versão clara", texto: "Para fundo escuro, como a faixa do PDF." },
  { kind: "escura", titulo: "Versão escura", texto: "Para fundo claro e papel." },
] as const;

export type PecaDeLogo = (typeof PECAS_DE_LOGO)[number]["kind"];

export type Marca = {
  primaria: string;
  secundaria: string;
  logos: Partial<Record<PecaDeLogo, string>>;
  logoUnico: string | null;
};

export const MARCA_PADRAO: Marca = {
  primaria: PRIMARIA_PADRAO,
  secundaria: SECUNDARIA_PADRAO,
  logos: {},
  logoUnico: null,
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function hexValido(valor: string | null | undefined): valor is string {
  return typeof valor === "string" && HEX.test(valor);
}

/** Cor que pode entrar em CSS ou PDF. Valor fora do padrão não passa. */
export function corSegura(valor: string | null | undefined, fallback: string): string {
  return hexValido(valor) ? valor : fallback;
}

export function componentesRgb(hex: string): { r: number; g: number; b: number } {
  const cor = corSegura(hex, PRIMARIA_PADRAO);
  const n = parseInt(cor.slice(1), 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

/** Canais HSL no formato que o Tailwind lê em `hsl(var(--primary))`. */
export function canaisHsl(hex: string): string {
  const { r, g, b } = componentesRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

function luminancia(hex: string): number {
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const { r, g, b } = componentesRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Texto sobre a primária. Branco quando o contraste passa de 4,5; senão o grafite do produto. */
export function textoSobrePrimaria(hex: string): "0 0% 100%" | "230 38% 9%" {
  const contraste = 1.05 / (luminancia(hex) + 0.05);
  return contraste >= 4.5 ? "0 0% 100%" : "230 38% 9%";
}

export type SuperficieDeLogo = "cabecalho" | "fundo_claro" | "fundo_escuro" | "icone";

const ORDEM: Record<SuperficieDeLogo, PecaDeLogo[]> = {
  cabecalho: ["horizontal", "escura", "sem_fundo"],
  fundo_claro: ["escura", "horizontal", "sem_fundo"],
  fundo_escuro: ["clara", "horizontal", "sem_fundo"],
  icone: ["icone", "horizontal"],
};

/** Primeira peça disponível para a superfície. Sem nenhuma, o logo único. */
export function caminhoDoLogo(marca: Marca, superficie: SuperficieDeLogo): string | null {
  for (const kind of ORDEM[superficie]) {
    const caminho = marca.logos[kind];
    if (caminho) return caminho;
  }
  return marca.logoUnico;
}

export function montarMarca(
  kit: { primary_hex?: string | null; secondary_hex?: string | null } | null,
  assets: { kind?: string | null; storage_path?: string | null }[] | null,
  logoUnico: string | null,
): Marca {
  const logos: Marca["logos"] = {};
  for (const asset of assets ?? []) {
    const kind = PECAS_DE_LOGO.find((peca) => peca.kind === asset.kind)?.kind;
    if (kind && asset.storage_path) logos[kind] = asset.storage_path;
  }
  return {
    primaria: corSegura(kit?.primary_hex, PRIMARIA_PADRAO),
    secundaria: corSegura(kit?.secondary_hex, SECUNDARIA_PADRAO),
    logos,
    logoUnico,
  };
}
