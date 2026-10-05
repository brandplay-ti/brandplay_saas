export const LOGO_ACCEPT = "image/*";

export const LOGO_ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
  "image/heic",
  "image/heif",
  "image/svg+xml",
];

export const LOGO_MAX_BYTES = 8 * 1024 * 1024; // 8MB
export const LOGO_MIN_SIDE = 200;
export const LOGO_MAX_SIDE = 2000;

export const LOGO_HINT =
  "PNG, JPG, WEBP, GIF ou SVG até 8MB. Ideal: quadrado (1:1), fundo transparente, entre 400x400 e 1000x1000 px.";


export type LogoValidationResult = {
  ok: boolean;
  error?: string;
  warning?: string;
};

function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Valida tipo e tamanho do arquivo de logo e retorna recomendações de dimensões.
 */
export async function validateLogoFile(file: File): Promise<LogoValidationResult> {
  const type = (file.type || "").toLowerCase();
  const isImageByName = /\.(png|jpe?g|jfif|webp|gif|avif|bmp|svg|heic|heif)$/i.test(file.name);
  if (type && !type.startsWith("image/") && !isImageByName) {
    return { ok: false, error: "Formato inválido. Envie um arquivo de imagem (PNG, JPG, WEBP, GIF ou SVG)." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { ok: false, error: `Arquivo muito grande (${mb}MB). O limite é 8MB.` };
  }
  if (file.size === 0) {
    return { ok: false, error: "Arquivo vazio ou corrompido." };
  }

  // SVG é vetorial: dimensões não importam
  if (type === "image/svg+xml") return { ok: true };

  const dims = await readDimensions(file);
  // Alguns formatos (HEIC, AVIF) podem não abrir no navegador — não bloqueamos o upload.
  if (!dims) return { ok: true };

  const { width, height } = dims;
  const warnings: string[] = [];
  if (width < LOGO_MIN_SIDE || height < LOGO_MIN_SIDE) {
    warnings.push(`resolução baixa (${width}x${height}px) — o ideal é a partir de ${LOGO_MIN_SIDE}x${LOGO_MIN_SIDE}px`);
  }
  if (width > LOGO_MAX_SIDE || height > LOGO_MAX_SIDE) {
    warnings.push(`imagem grande (${width}x${height}px) — recomendamos até ${LOGO_MAX_SIDE}px`);
  }
  const ratio = width / height;
  if (ratio > 3 || ratio < 1 / 3) {
    warnings.push("proporção muito alongada — o ideal é próximo de 1:1");
  }

  return warnings.length
    ? { ok: true, warning: `Logo aceito, mas ${warnings.join(" e ")}.` }
    : { ok: true };
}

