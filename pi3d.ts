import { PI_ART } from "./art.ts";
import { BASE_LIGHTNESS, DEFAULT_PALETTE, legible, shade, type Palette, type Rgb } from "./palette.ts";

/**
 * A 3D π: the splash screen's ASCII art extruded into a slab and ray-cast into
 * Unicode braille cells (2x4 dots each), so it lines up with the plain splash screen.
 *
 * Every non-space character of the art becomes a filled cell of a 2D mask. The
 * slab is a prism over that mask, so a ray through it can be traced with a 2D
 * grid walk between the slab's front and back planes.
 */

export interface Pose {
  /** Rotation around the vertical axis, in radians. */
  yaw: number;
  /** Rotation around the horizontal axis, in radians. */
  pitch: number;
}

export interface Options {
  pose?: Pose;
  /** Slab thickness in block widths. */
  thickness?: number;
  /**
   * How large the splash screen is, as a multiple of its default size: it
   * scales the rows and columns the π may use. Terminals clamp it.
   */
  size?: number;
  /** The most rows to use, for terminals shorter than the size asks for; 0 or none for no limit. */
  maxRows?: number;
  /** Uniform scale around the center of the art; by default the largest that fits the canvas at any yaw. */
  scale?: number;
  palette?: Palette;
}

export const DEFAULT_POSE: Pose = { yaw: -0.35, pitch: 0.2 };
export const DEFAULT_THICKNESS = 8;
export const DEFAULT_SIZE = 1;

/** Rows above and below the art, matching the plain splash screen. */
const MARGIN_ROWS = 1;
const CELL_WIDTH = 2;
const CELL_HEIGHT = 4;
const CAMERA_DISTANCE = 400;
/** Extra columns on each side of the art for the rotated slab to reach into. */
const MARGIN_COLUMNS = 8;
/** The fewest rows to draw in, however small the size or the terminal. */
const MIN_LINES = 5;
/** Keeps the scale positive when the canvas is almost empty. */
const MIN_SCALE = 0.05;
const LIGHT = normalize([-0.45, -0.6, 0.66]);
const RESET = "\x1b[0m";
/** Axis and sign of the six faces: -x, +x, -y, +y, -z, +z. */
const FACES: [number, number][] = [[0, -1], [0, 1], [1, -1], [1, 1], [2, -1], [2, 1]];
const DOT_BITS = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

const COLUMNS = Math.max(...PI_ART.map((line) => line.length));
const ROWS = PI_ART.length;
const HALF_WIDTH = (COLUMNS * CELL_WIDTH) / 2;
const HALF_HEIGHT = (ROWS * CELL_HEIGHT) / 2;
const FILLED = PI_ART.map((line) =>
  Array.from({ length: COLUMNS }, (_, column) => (line[column] ?? " ") !== " "),
);

type Vec3 = [number, number, number];
type Matrix = [number, number, number, number, number, number, number, number, number];

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Row-major matrix taking object space to camera space: pitch after yaw. */
function rotation({ yaw, pitch }: Pose): Matrix {
  const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
  return [cy, 0, sy, sp * sy, cp, -sp * cy, -cp * sy, sp, cp * cy];
}

interface Hit {
  column: number;
  row: number;
  /** Axis of the face that was hit: 0 = x, 1 = y, 2 = z. */
  axis: number;
  /** Which way the face points along that axis. */
  sign: number;
}

/** Trace a ray through the slab; the nearest filled cell and face, if any. */
function trace(origin: Vec3, direction: Vec3, halfDepth: number): Hit | undefined {
  const half: Vec3 = [HALF_WIDTH, HALF_HEIGHT, halfDepth];
  let enter = 0;
  let exit = Infinity;
  let axis = -1;
  for (let a = 0; a < 3; a++) {
    const o = origin[a]!;
    const d = direction[a]!;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o) > half[a]!) return undefined;
      continue;
    }
    let t0 = (-half[a]! - o) / d;
    let t1 = (half[a]! - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > enter) {
      enter = t0;
      axis = a;
    }
    exit = Math.min(exit, t1);
  }
  if (axis < 0 || enter > exit) return undefined;

  const x = origin[0]! + enter * direction[0]!;
  const y = origin[1]! + enter * direction[1]!;
  let column = Math.min(COLUMNS - 1, Math.max(0, Math.floor((x + HALF_WIDTH) / CELL_WIDTH)));
  let row = Math.min(ROWS - 1, Math.max(0, Math.floor((y + HALF_HEIGHT) / CELL_HEIGHT)));
  const stepX = Math.sign(direction[0]!);
  const stepY = Math.sign(direction[1]!);
  const next = (o: number, d: number, index: number, size: number, half: number, step: number) =>
    step === 0 ? Infinity : ((step > 0 ? index + 1 : index) * size - half - o) / d;
  let nextX = next(origin[0]!, direction[0]!, column, CELL_WIDTH, HALF_WIDTH, stepX);
  let nextY = next(origin[1]!, direction[1]!, row, CELL_HEIGHT, HALF_HEIGHT, stepY);
  const deltaX = stepX === 0 ? Infinity : CELL_WIDTH / Math.abs(direction[0]!);
  const deltaY = stepY === 0 ? Infinity : CELL_HEIGHT / Math.abs(direction[1]!);

  let normalAxis = axis;
  let sign = -Math.sign(direction[axis]!);
  for (;;) {
    if (FILLED[row]![column]) return { column, row, axis: normalAxis, sign };
    if (nextX < nextY) {
      if (nextX > exit) return undefined;
      column += stepX;
      nextX += deltaX;
      normalAxis = 0;
      sign = -stepX;
    } else {
      if (nextY > exit) return undefined;
      row += stepY;
      nextY += deltaY;
      normalAxis = 1;
      sign = -stepY;
    }
    if (column < 0 || column >= COLUMNS || row < 0 || row >= ROWS) return undefined;
  }
}

/**
 * The largest scale, up to `cap`, at which the slab stays within `halfRows` and
 * `halfColumns` dots of the canvas center for every yaw at the given pitch,
 * found by projecting its corners.
 */
const fits = new Map<string, number>();
function fitScale(depth: number, pitch: number, halfRows: number, halfColumns: number, cap: number): number {
  const key = `${depth}|${pitch}|${halfRows}|${halfColumns}|${cap}`;
  const known = fits.get(key);
  if (known !== undefined) return known;

  const [cp, sp] = [Math.cos(pitch), Math.sin(pitch)];
  let reachX = 0;
  let reachY = 0;
  for (let step = 0; step < 180; step++) {
    const [cy, sy] = [Math.cos((step / 180) * Math.PI * 2), Math.sin((step / 180) * Math.PI * 2)];
    for (const x of [-HALF_WIDTH, HALF_WIDTH]) {
      for (const y of [-HALF_HEIGHT, HALF_HEIGHT]) {
        for (const z of [-depth / 2, depth / 2]) {
          const xc = cy * x + sy * z;
          const yc = sp * sy * x + cp * y - sp * cy * z;
          const zc = -cp * sy * x + sp * y + cp * cy * z;
          const factor = CAMERA_DISTANCE / (CAMERA_DISTANCE - zc);
          reachX = Math.max(reachX, Math.abs(xc * factor));
          reachY = Math.max(reachY, Math.abs(yc * factor));
        }
      }
    }
  }
  // Two dots of breathing room.
  const scale = Math.max(MIN_SCALE, Math.min(cap, (halfRows - 2) / reachY, (halfColumns - 2) / reachX));
  fits.set(key, scale);
  return scale;
}

/** The splash screen's rows: blank, the art, blank; each a braille line with 24-bit color. */
export function render3dLines(width: number, options: Options = {}): string[] {
  const {
    pose = DEFAULT_POSE,
    thickness = DEFAULT_THICKNESS,
    size = DEFAULT_SIZE,
    maxRows = 0,
    palette = DEFAULT_PALETTE,
  } = options;
  const depth = thickness * CELL_WIDTH;

  // The canvas is the default one scaled by the size, as far as the terminal allows.
  const defaultLines = ROWS + MARGIN_ROWS * 2;
  const wantedLines = Math.max(MIN_LINES, Math.round(defaultLines * size));
  const lines = maxRows > 0 ? Math.max(MIN_LINES, Math.min(wantedLines, maxRows)) : wantedLines;
  const grown = lines / defaultLines;
  const artCenter = Math.floor((width - COLUMNS) / 2) + COLUMNS / 2;
  const wantedCells = Math.round((COLUMNS + MARGIN_COLUMNS * 2) * grown);
  const left = Math.max(0, Math.min(Math.round(artCenter - wantedCells / 2), width - wantedCells));
  const right = Math.min(width, left + wantedCells);
  const cells = Math.max(0, right - left);
  const dotWidth = cells * CELL_WIDTH;
  const dotHeight = lines * CELL_HEIGHT;
  if (cells === 0) return Array.from({ length: lines }, () => "");

  // The art's center on the dot canvas.
  const centerX = (artCenter - left) * CELL_WIDTH;
  const centerY = dotHeight / 2;
  const scale =
    options.scale ??
    fitScale(depth, pose.pitch, dotHeight / 2, Math.min(centerX, dotWidth - centerX), grown);

  const m = rotation(pose);
  const halfDepth = depth / 2;
  // Camera space to object space is the transpose of the rotation.
  const toObject = (x: number, y: number, z: number): Vec3 => [
    m[0] * x + m[3] * y + m[6] * z,
    m[1] * x + m[4] * y + m[7] * z,
    m[2] * x + m[5] * y + m[8] * z,
  ];
  const origin = toObject(0, 0, CAMERA_DISTANCE);

  // Only dots inside the projected slab can hit it.
  let minX = dotWidth;
  let minY = dotHeight;
  let maxX = -1;
  let maxY = -1;
  for (const cx of [-HALF_WIDTH, HALF_WIDTH]) {
    for (const cy of [-HALF_HEIGHT, HALF_HEIGHT]) {
      for (const cz of [-halfDepth, halfDepth]) {
        const x = m[0] * cx + m[1] * cy + m[2] * cz;
        const y = m[3] * cx + m[4] * cy + m[5] * cz;
        const z = m[6] * cx + m[7] * cy + m[8] * cz;
        const factor = (scale * CAMERA_DISTANCE) / (CAMERA_DISTANCE - z);
        minX = Math.min(minX, Math.floor(centerX + x * factor));
        maxX = Math.max(maxX, Math.ceil(centerX + x * factor));
        minY = Math.min(minY, Math.floor(centerY + y * factor));
        maxY = Math.max(maxY, Math.ceil(centerY + y * factor));
      }
    }
  }
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(dotWidth - 1, maxX + 1);
  maxY = Math.min(dotHeight - 1, maxY + 1);

  const regionWidth = maxX - minX + 1;
  const regionHeight = maxY - minY + 1;
  /** The color of every dot that hit the slab, row by row within the region. */
  const dotColors: (Rgb | undefined)[] = new Array(regionWidth * regionHeight);
  const bits = new Uint8Array(cells * lines);
  const counts = new Uint8Array(cells * lines);
  const rgb = new Float32Array(cells * lines * 3);
  // Faces are shaded by lightness, so darker sides keep their saturated hue.
  const lightness = FACES.map(([axis, sign]) => {
    const nx = m[axis]! * sign;
    const ny = m[3 + axis]! * sign;
    const nz = m[6 + axis]! * sign;
    // Faces only get darker than the base color, so highlights never wash it out.
    return 0.4 + (BASE_LIGHTNESS - 0.4) * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  });
  const colors = new Map<number, Rgb>();

  for (let dotY = minY; dotY <= maxY; dotY++) {
    for (let dotX = minX; dotX <= maxX; dotX++) {
      const direction = toObject(
        (dotX + 0.5 - centerX) / scale,
        (dotY + 0.5 - centerY) / scale,
        -CAMERA_DISTANCE,
      );
      const hit = trace(origin, direction, halfDepth);
      if (!hit) continue;

      const face = hit.axis * 2 + (hit.sign > 0 ? 1 : 0);
      const key = (hit.row * COLUMNS + hit.column) * FACES.length + face;
      let color = colors.get(key);
      if (!color) {
        color = shade(legible(palette.at(hit.column, hit.row)), lightness[face]! / BASE_LIGHTNESS);
        colors.set(key, color);
      }

      dotColors[(dotY - minY) * regionWidth + (dotX - minX)] = color;
    }
  }

  // Dots that hang off the shape by a single neighbor are slivers of faces seen
  // edge-on. They read as stray specks, so they are dropped.
  for (let dotY = minY; dotY <= maxY; dotY++) {
    for (let dotX = minX; dotX <= maxX; dotX++) {
      const index = (dotY - minY) * regionWidth + (dotX - minX);
      const color = dotColors[index];
      if (!color) continue;
      const neighbors =
        (dotX > minX && dotColors[index - 1] ? 1 : 0) +
        (dotX < maxX && dotColors[index + 1] ? 1 : 0) +
        (dotY > minY && dotColors[index - regionWidth] ? 1 : 0) +
        (dotY < maxY && dotColors[index + regionWidth] ? 1 : 0);
      if (neighbors < 2) continue;

      const cell = (dotY >> 2) * cells + (dotX >> 1);
      bits[cell]! |= DOT_BITS[(dotY & 3) * 2 + (dotX & 1)]!;
      counts[cell]!++;
      rgb[cell * 3]! += color[0];
      rgb[cell * 3 + 1]! += color[1];
      rgb[cell * 3 + 2]! += color[2];
    }
  }

  const out: string[] = [];
  for (let row = 0; row < lines; row++) {
    let line = "";
    let blanks = 0;
    let color = "";
    for (let column = 0; column < cells; column++) {
      const cell = row * cells + column;
      if (bits[cell] === 0) {
        blanks++;
        continue;
      }
      if (line === "") blanks += left;
      line += " ".repeat(blanks);
      blanks = 0;
      const n = counts[cell]!;
      const [red, green, blue] = legible([
        Math.round(rgb[cell * 3]! / n),
        Math.round(rgb[cell * 3 + 1]! / n),
        Math.round(rgb[cell * 3 + 2]! / n),
      ]);
      const next = `\x1b[38;2;${red};${green};${blue}m`;
      if (next !== color) {
        line += next;
        color = next;
      }
      line += String.fromCharCode(0x2800 + bits[cell]!);
    }
    out.push(line === "" ? "" : line + RESET);
  }
  return out;
}
