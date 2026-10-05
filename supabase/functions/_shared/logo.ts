// Shared helpers to render sponsor/brand logos centered and proportional
// across generated PDFs and HTML reports.

export const LOGO_BOX_CSS = `
.logo-frame { display: flex; align-items: center; justify-content: center; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px; overflow: hidden; }
.logo-frame.sm { width: 40px; height: 40px; }
.logo-frame.md { width: 64px; height: 64px; }
.logo-frame.lg { width: 96px; height: 96px; }
.logo-frame img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; margin: 0 auto; }
.logo-frame .logo-fallback { font-size: 11px; font-weight: 700; color: #9ca3af; text-align: center; line-height: 1; }
`;

/** Renders a fixed-size, centered logo frame keeping the image proportions. */
export function logoFrameHtml(
  url: string | null | undefined,
  name: string,
  size: "sm" | "md" | "lg" = "sm",
) {
  const esc = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const initials = esc(
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "—",
  );
  const inner = url
    ? `<img src="${esc(url)}" alt="Logo ${esc(name)}" />`
    : `<span class="logo-fallback">${initials}</span>`;
  return `<div class="logo-frame ${size}">${inner}</div>`;
}

/** Public URL for a logo stored in a public bucket. */
export function publicLogoUrl(
  supabaseUrl: string,
  bucket: string,
  path: string | null | undefined,
) {
  if (!path) return null;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

/** Fetches image bytes, returning null when unavailable. */
export async function fetchLogoBytes(url: string | null): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

type EmbedTarget = {
  embedPng: (b: Uint8Array) => Promise<{ width: number; height: number }>;
  embedJpg: (b: Uint8Array) => Promise<{ width: number; height: number }>;
};

/**
 * Embeds a logo into a pdf-lib page, scaled to fit (contain) and centered
 * inside the given box. Returns false when the logo could not be rendered.
 */
export async function drawContainedLogo(
  pdf: EmbedTarget,
  page: {
    drawImage: (img: unknown, opts: { x: number; y: number; width: number; height: number }) => void;
  },
  bytes: Uint8Array | null,
  box: { x: number; y: number; width: number; height: number },
): Promise<boolean> {
  if (!bytes || bytes.length === 0) return false;
  let image: { width: number; height: number } | null = null;
  try {
    image = await pdf.embedPng(bytes);
  } catch {
    try {
      image = await pdf.embedJpg(bytes);
    } catch {
      return false;
    }
  }
  if (!image || !image.width || !image.height) return false;
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  });
  return true;
}
