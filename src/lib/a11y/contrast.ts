/**
 * WCAG colour-contrast maths (Phase 7 · point 32) — extracted into one shared util (previously copy-
 * pasted inline in ProductEditor + CollectionsManager). Pure; client + server safe.
 */

/** Parse a #rgb / #rrggbb hex string to [r,g,b] 0–255, or null if not a hex colour. */
export function rgbOf(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** WCAG relative luminance (sRGB linearised, 0.2126/0.7152/0.0722). */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Contrast ratio (1–21) between two hex colours; null if either isn't a valid hex. */
export function contrastRatio(hex1: string, hex2: string): number | null {
  const a = rgbOf(hex1), b = rgbOf(hex2);
  if (!a || !b) return null;
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** WCAG AA thresholds: 4.5:1 for normal text, 3:1 for large text / UI. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
