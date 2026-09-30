export type RGBA = [number, number, number, number];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function hexToRgba(hex: string): RGBA | null {
  const h = hex.replace(/^#/, "");
  const expand = (c: string) => parseInt(c + c, 16);
  if (h.length === 3 || h.length === 4) {
    const [r, g, b, a] = h.split("");
    return [expand(r) / 255, expand(g) / 255, expand(b) / 255, a !== undefined ? expand(a) / 255 : 1];
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return [r / 255, g / 255, b / 255, a / 255];
  }
  return null;
}

export function parseColor(value: unknown, fallback: RGBA = [1, 1, 1, 1]): RGBA {
  if (Array.isArray(value) && value.length >= 3) {
    const nums = value.slice(0, 4).map((v) => Number(v));
    if (nums.some((n) => Number.isNaN(n))) return fallback;
    return [nums[0], nums[1], nums[2], nums[3] ?? 1];
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (s.startsWith("#")) {
      return hexToRgba(s) ?? fallback;
    }
    const parts = s.split(",").map((p) => Number(p.trim()));
    if (parts.length >= 3 && !parts.slice(0, 4).some((n) => Number.isNaN(n))) {
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    }
  }
  return fallback;
}

export function isValidColor(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length === 3 || value.length === 4
      ? value.every((v) => typeof v === "number" && Number.isFinite(v))
      : false;
  }
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (s.startsWith("#")) return hexToRgba(s) !== null;
  const parts = s.split(",").map((p) => Number(p.trim()));
  return parts.length >= 3 && parts.length <= 4 && parts.every((n) => Number.isFinite(n));
}

export function colorLiteral(value: unknown, fallback: RGBA = [1, 1, 1, 1], includeAlpha = false): string {
  const [r, g, b, a] = parseColor(value, fallback);
  const nums = includeAlpha ? [r, g, b, a] : [r, g, b];
  return nums.map((n) => (Number.isInteger(n) ? `${n}.0` : `${n}`)).join(", ");
}

export function isValidEnum(value: unknown, variants: string[]): boolean {
  return typeof value === "string" && variants.includes(value);
}

export function clamp01Value(n: number): number {
  return clamp01(n);
}
