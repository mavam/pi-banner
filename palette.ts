import { PI_ART } from "./art.ts";

export type Rgb = [number, number, number];

/** Colors for the cells of the art. */
export interface Palette {
  /** The color of the art cell at a column and row. */
  at(column: number, row: number): Rgb;
}

export const PALETTE_NAMES = [
  "rainbow",
  "pi",
  "sunset",
  "ocean",
  "fire",
  "mono",
] as const;

export type PaletteName = (typeof PALETTE_NAMES)[number];

/** Lightness of the rainbow, which the plain splash screen draws unshaded. */
export const BASE_LIGHTNESS = 0.65;

export function hslToRgb(h: number, s: number, l: number): Rgb {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [rf, gf, bf] = [r / 255, g / 255, b / 255];
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rf) h = ((gf - bf) / d) % 6;
  else if (max === gf) h = (bf - rf) / d + 2;
  else h = (rf - gf) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

/** Scale the lightness of a color; used to light the faces of the 3D slab. */
export function shade(color: Rgb, factor: number): Rgb {
  const [h, s, l] = rgbToHsl(color);
  return hslToRgb(h, s, Math.min(0.92, l * factor));
}

function parseHex(text: string): Rgb | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (!match) return undefined;
  let hex = match[1]!;
  if (hex.length === 3) hex = [...hex].map((digit) => digit + digit).join("");
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

const rgb = (hex: string): Rgb => parseHex(hex)!;

/** Where a cell sits along the art's diagonal, from 0 to 1. */
const DIAGONAL_SPAN = Math.max(
  ...PI_ART.flatMap((line, row) =>
    [...line].flatMap((char, column) => (char === " " ? [] : [column + row * 3])),
  ),
);

function gradient(stops: Rgb[]): Palette {
  if (stops.length === 1) return { at: () => stops[0]! };
  return {
    at(column, row) {
      const t = Math.min(1, Math.max(0, (column + row * 3) / DIAGONAL_SPAN));
      const position = t * (stops.length - 1);
      const index = Math.min(stops.length - 2, Math.floor(position));
      const from = stops[index]!;
      const to = stops[index + 1]!;
      const amount = position - index;
      return [
        Math.round(from[0] + (to[0] - from[0]) * amount),
        Math.round(from[1] + (to[1] - from[1]) * amount),
        Math.round(from[2] + (to[2] - from[2]) * amount),
      ];
    },
  };
}

const RAINBOW: Palette = {
  at: (column, row) => hslToRgb(((column + row * 3) / 50) * 360, 0.85, BASE_LIGHTNESS),
};

const CORAL = rgb("#e48a7a");
const BLUE = rgb("#4f8eb3");
const YELLOW = rgb("#eab65d");

/** The pi logo's colors: a coral bar, a blue left leg, a coral right leg on a yellow foot. */
const PI: Palette = {
  at(column, row) {
    if (row <= 2) return CORAL;
    if (row <= 5 && column <= 5) return CORAL; // The bar's drooping left tip.
    if (column < 16) return BLUE;
    return row >= 9 ? YELLOW : CORAL;
  },
};

const PRESETS: Record<PaletteName, Palette> = {
  rainbow: RAINBOW,
  pi: PI,
  sunset: gradient([rgb("#ffb347"), rgb("#ff5e7e"), rgb("#9b5cff")]),
  ocean: gradient([rgb("#4be3c3"), rgb("#3fa0ff"), rgb("#6f5bff")]),
  fire: gradient([rgb("#ffe45c"), rgb("#ff9a3c"), rgb("#ff3b3b")]),
  mono: gradient([rgb("#f2f2f2"), rgb("#8c8c8c")]),
};

/** The palette that new installations start with. */
export const DEFAULT_COLOR = "pi";
export const DEFAULT_PALETTE = PRESETS[DEFAULT_COLOR];

/** A random preset; `random` returns a number in [0, 1), like `Math.random`. */
export function randomPreset(random: () => number = Math.random): PaletteName {
  return PALETTE_NAMES[Math.min(PALETTE_NAMES.length - 1, Math.floor(random() * PALETTE_NAMES.length))]!;
}

const cache = new Map<string, Palette>();

/**
 * A palette from a preset name, one `#rgb`/`#rrggbb` color, or several of them
 * separated by commas, which blend along the art's diagonal.
 */
export function parsePalette(spec: string): Palette | undefined {
  const key = spec.trim().toLowerCase().replaceAll(/\s+/g, "");
  const known = cache.get(key);
  if (known) return known;

  let palette: Palette | undefined = PRESETS[key as keyof typeof PRESETS];
  if (!palette && key !== "") {
    const stops = key.split(",").map(parseHex);
    if (stops.every((stop) => stop !== undefined)) palette = gradient(stops);
  }
  if (palette) cache.set(key, palette);
  return palette;
}

export const COLOR_HELP = `${PALETTE_NAMES.join(", ")}, or hex colors like #ff8800 or #ff0000,#0000ff`;
