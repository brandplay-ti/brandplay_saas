// Simple CSV parser: supports quoted fields, escaped quotes ("") and , or ; delimiters.

export function detectDelimiter(text: string): "," | ";" {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ",") commas++;
    else if (!inQuotes && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

export function parseCSV(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignore
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const normalizeHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Parses "1.234,56", "1234.56", "R$ 1.234,56" into a number. */
export function parseNumberBR(raw: string): number | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > -1 && lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
