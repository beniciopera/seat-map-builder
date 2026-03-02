import type { SeatStatus } from '@/src/domain/types';
import type { Category } from '@/src/domain/categories';
import { DEFAULT_CATEGORIES } from '@/src/domain/categories';

/** Maximum lightness (0–1) for category colors so very light/white colors remain visible on light backgrounds. */
const MAX_LIGHTNESS = 0.82;

let categoryRegistry = new Map<string, Category>();
function initRegistry(): void {
  categoryRegistry = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
}
initRegistry();

const STATUS_COLORS: Record<SeatStatus, string> = {
  available: '#4CAF50',
  reserved: '#FF9800',
  blocked: '#9E9E9E',
  sold: '#F44336',
};

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return null;
  return {
    r: parseInt(match[1].slice(0, 2), 16) / 255,
    g: parseInt(match[1].slice(2, 4), 16) / 255,
    b: parseInt(match[1].slice(4, 6), 16) / 255,
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r: number; let g: number; let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const rr = Math.round(Math.max(0, Math.min(1, r)) * 255);
  const gg = Math.round(Math.max(0, Math.min(1, g)) * 255);
  const bb = Math.round(Math.max(0, Math.min(1, b)) * 255);
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

/**
 * Returns a version of the hex color with lightness capped at MAX_LIGHTNESS
 * so that very light/white colors remain visible on light backgrounds.
 * Used for category and area colors.
 */
export function ensureMinDarkness(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (l <= MAX_LIGHTNESS) return hex;
  const { r, g, b } = hslToRgb(h, s, MAX_LIGHTNESS);
  return rgbToHex(r, g, b);
}

export function setCategoryRegistry(map: Map<string, Category>): void {
  categoryRegistry = new Map(map);
}

export function categoryColor(categoryId: string): string {
  const cat = categoryRegistry.get(categoryId);
  const raw = cat?.color ?? '#9E9E9E';
  return ensureMinDarkness(raw);
}

export function statusColor(status: SeatStatus): string {
  return STATUS_COLORS[status];
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
