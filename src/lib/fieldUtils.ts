export type Geo = { lat: number; lng: number; accuracy?: number } | null;

export const captureGeo = (): Promise<Geo> =>
  new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const timeout = setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {
        clearTimeout(timeout);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 },
    );
  });

export const detectKind = (file: File): "image" | "pdf" | "doc" | "other" => {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (
    t.includes("word") ||
    t.includes("officedocument") ||
    /\.(docx?|odt|rtf)$/.test(n)
  )
    return "doc";
  return "other";
};

export const compressImage = async (file: File, maxDim = 1600, quality = 0.82): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compression failed"))), "image/jpeg", quality),
  );
};
