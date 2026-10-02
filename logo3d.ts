/**
 * Adapted from Pi v1.0.0's logo Easter egg:
 * https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/src/modes/interactive/components/pi-logo-animation.ts
 *
 * Original renderer by Armin Ronacher (@mitsuhiko).
 * Copyright (c) 2025 Mario Zechner. MIT; see LICENSE.
 * Keeps the original pixel blocks, visible-face rasterizer, depth buffer, and lighting.
 * The fullscreen dissolve, sliding puzzle, and starfield are not part of the startup header.
 */
import { LOGO_PIXELS, LOGO_PIXEL_COLUMNS, LOGO_PIXEL_ROWS } from "./art.ts";
import { DEFAULT_PALETTE, symbolPalette, type Rgb } from "./palette.ts";
import { DEFAULT_POSE, DEFAULT_SIZE, DEFAULT_THICKNESS, type Options, type Pose as Rotation } from "./pi3d.ts";

interface LogoBox {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  color: Rgb;
}

interface Pose extends Rotation {
  centerX: number;
  centerY: number;
  scale: number;
  roll: number;
}

const CAMERA_DISTANCE = 10;
const ORIGINAL_DEPTH = 0.7;
const DEFAULT_LINES = LOGO_PIXEL_ROWS * 4 + 2;
const DEFAULT_COLUMNS = LOGO_PIXEL_COLUMNS * 4 + 16;
const DOTS_PER_PIXEL = LOGO_PIXEL_ROWS * 4;
const DOT_BITS = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];
const LIGHT = normalize([-0.45, -0.6, 0.75]);
const HALF_VECTOR = normalize([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
const BACKGROUND: Rgb = [0, 0, 0];
const RESET = "\x1b[0m";

function normalize(v: Rgb): Rgb {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isLight([r, g, b]: Rgb): boolean {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128;
}

/** Row-major 3x3 rotation matrix for yaw (y), then pitch (x), then roll (z). */
function rotation(yaw: number, pitch: number, roll: number): number[] {
  const [sy, cy, sx, cx, sz, cz] = [
    Math.sin(yaw),
    Math.cos(yaw),
    Math.sin(pitch),
    Math.cos(pitch),
    Math.sin(roll),
    Math.cos(roll),
  ];
  // Rz * Rx * Ry
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return multiply(rz, multiply(rx, ry));
}

function multiply(a: number[], b: number[]): number[] {
  const result = new Array<number>(9);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      result[row * 3 + column] =
        a[row * 3]! * b[column]! + a[row * 3 + 1]! * b[3 + column]! + a[row * 3 + 2]! * b[6 + column]!;
    }
  }
  return result;
}

interface Face {
  axis: number;
  /** Plane coordinate on `axis` in object space. */
  plane: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  /** Projected bounds in braille dots, inclusive. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  red: number;
  green: number;
  blue: number;
}

/**
 * Renders the logo blocks into braille cells. Only faces that point at the camera and are not covered by a
 * touching block are drawn. Each face is rasterized over its projected bounds by intersecting each dot's ray
 * with the face's plane, with a depth buffer resolving overlaps. Buffers are reused between frames.
 */
class LogoRaster {
  /** Braille dot bits per cell. */
  bits = new Uint8Array(0);
  /** Lit dots per cell. */
  counts = new Uint8Array(0);
  /** Summed RGB of the lit dots per cell. */
  rgb = new Float32Array(0);
  private width = 0;
  private height = 0;
  /** Ray parameter of the nearest hit per dot; smaller is nearer. */
  private depth = new Float32Array(0);
  /** Face index + 1 of the nearest hit per dot, 0 for none. */
  private faceIds = new Uint8Array(0);
  /** Cells written by the previous frame, cleared before the next one. */
  private dirty: { minX: number; minY: number; maxX: number; maxY: number } | undefined;

  render(
    width: number,
    height: number,
    pose: Pose,
    boxes: readonly LogoBox[],
    background: Rgb,
  ): void {
    const dotWidth = width * 2;
    const dotHeight = height * 4;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.bits = new Uint8Array(width * height);
      this.counts = new Uint8Array(width * height);
      this.rgb = new Float32Array(width * height * 3);
      this.depth = new Float32Array(dotWidth * dotHeight).fill(Infinity);
      this.faceIds = new Uint8Array(dotWidth * dotHeight);
      this.dirty = undefined;
    } else if (this.dirty) {
      const { minX, minY, maxX, maxY } = this.dirty;
      for (let row = minY; row <= maxY; row++) {
        this.bits.fill(0, row * width + minX, row * width + maxX + 1);
        this.counts.fill(0, row * width + minX, row * width + maxX + 1);
        this.rgb.fill(0, (row * width + minX) * 3, (row * width + maxX + 1) * 3);
      }
      this.dirty = undefined;
    }

    const m = rotation(pose.yaw, pose.pitch, pose.roll);
    const { centerX, centerY, scale } = pose;
    // The camera sits at (0, 0, CAMERA_DISTANCE) in camera space; object space is the transpose rotation.
    const origin = [m[6]! * CAMERA_DISTANCE, m[7]! * CAMERA_DISTANCE, m[8]! * CAMERA_DISTANCE];
    const light = isLight(background);
    const faces = this.visibleFaces(m, origin, pose, boxes, dotWidth, dotHeight, light);
    if (faces.length === 0) return;
    let minX = dotWidth;
    let minY = dotHeight;
    let maxX = -1;
    let maxY = -1;
    for (const face of faces) {
      minX = Math.min(minX, face.minX);
      minY = Math.min(minY, face.minY);
      maxX = Math.max(maxX, face.maxX);
      maxY = Math.max(maxY, face.maxY);
    }
    if (maxX < minX || maxY < minY) return;

    const depth = this.depth;
    const faceIds = this.faceIds;
    for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
      const face = faces[faceIndex]!;
      const a = face.axis;
      const u = (a + 1) % 3;
      const v = (a + 2) % 3;
      const originA = origin[a]!;
      const originU = origin[u]!;
      const originV = origin[v]!;
      // The ray direction in object space is linear in the dot position, so it is stepped per dot.
      const stepA = m[a]! / scale;
      const stepU = m[u]! / scale;
      const stepV = m[v]! / scale;
      const sx = (face.minX + 0.5 - centerX) / scale;
      for (let dotY = face.minY; dotY <= face.maxY; dotY++) {
        const sy = (dotY + 0.5 - centerY) / scale;
        let directionA = m[a]! * sx + m[3 + a]! * sy - m[6 + a]! * CAMERA_DISTANCE;
        let directionU = m[u]! * sx + m[3 + u]! * sy - m[6 + u]! * CAMERA_DISTANCE;
        let directionV = m[v]! * sx + m[3 + v]! * sy - m[6 + v]! * CAMERA_DISTANCE;
        let index = dotY * dotWidth + face.minX;
        for (let dotX = face.minX; dotX <= face.maxX; dotX++, index++) {
          const t = (face.plane - originA) / directionA;
          if (t > 0 && t < depth[index]!) {
            const hitU = originU + t * directionU;
            const hitV = originV + t * directionV;
            if (hitU >= face.uMin && hitU <= face.uMax && hitV >= face.vMin && hitV <= face.vMax) {
              depth[index] = t;
              faceIds[index] = faceIndex + 1;
            }
          }
          directionA += stepA;
          directionU += stepU;
          directionV += stepV;
        }
      }
    }

    // Shade the hit dots, pack them into braille cells, and reset the dot buffers for the next frame.
    const bits = this.bits;
    const counts = this.counts;
    const rgb = this.rgb;
    let cellMinX = width;
    let cellMinY = height;
    let cellMaxX = -1;
    let cellMaxY = -1;
    for (let dotY = minY; dotY <= maxY; dotY++) {
      let index = dotY * dotWidth + minX;
      for (let dotX = minX; dotX <= maxX; dotX++, index++) {
        const id = faceIds[index]!;
        if (id === 0) continue;
        const face = faces[id - 1]!;
        // Points farther from the camera fade slightly toward the background for depth.
        const fog = clamp01(0.15 - CAMERA_DISTANCE * (1 - depth[index]!) * 0.12) * (light ? 0.5 : 1);
        faceIds[index] = 0;
        depth[index] = Infinity;
        const cellX = dotX >> 1;
        const cellY = dotY >> 2;
        const cell = cellY * width + cellX;
        bits[cell]! |= DOT_BITS[(dotY & 3) * 2 + (dotX & 1)];
        counts[cell]!++;
        rgb[cell * 3] += face.red + (background[0] - face.red) * fog;
        rgb[cell * 3 + 1] += face.green + (background[1] - face.green) * fog;
        rgb[cell * 3 + 2] += face.blue + (background[2] - face.blue) * fog;
        if (cellX < cellMinX) cellMinX = cellX;
        if (cellX > cellMaxX) cellMaxX = cellX;
        if (cellY < cellMinY) cellMinY = cellY;
        if (cellY > cellMaxY) cellMaxY = cellY;
      }
    }
    if (cellMaxX >= 0) this.dirty = { minX: cellMinX, minY: cellMinY, maxX: cellMaxX, maxY: cellMaxY };
  }

  private visibleFaces(
    m: number[],
    origin: number[],
    pose: Pose,
    boxes: readonly LogoBox[],
    dotWidth: number,
    dotHeight: number,
    lightBackground: boolean,
  ): Face[] {
    const faces: Face[] = [];
    for (const box of boxes) {
      for (let a = 0; a < 3; a++) {
        const u = (a + 1) % 3;
        const v = (a + 2) % 3;
        for (const side of [-1, 1]) {
          const plane = side > 0 ? box.max[a]! : box.min[a]!;
          // Back faces point away from the camera.
          if ((origin[a]! - plane) * side <= 0) continue;
          // Faces pressed against a neighboring block are hidden. Positions are exact while blocks rest.
          const covered = boxes.some(
            (other) =>
              other !== box &&
              (side > 0 ? other.min[a] : other.max[a]) === plane &&
              other.min[u]! <= box.min[u]! &&
              other.max[u]! >= box.max[u]! &&
              other.min[v]! <= box.min[v]! &&
              other.max[v]! >= box.max[v]!,
          );
          if (covered) continue;

          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          const corner = [0, 0, 0];
          for (const cornerU of [box.min[u]!, box.max[u]!]) {
            for (const cornerV of [box.min[v]!, box.max[v]!]) {
              corner[a] = plane;
              corner[u] = cornerU;
              corner[v] = cornerV;
              const x = m[0]! * corner[0]! + m[1]! * corner[1]! + m[2]! * corner[2]!;
              const y = m[3]! * corner[0]! + m[4]! * corner[1]! + m[5]! * corner[2]!;
              const z = m[6]! * corner[0]! + m[7]! * corner[1]! + m[8]! * corner[2]!;
              const perspective = (pose.scale * CAMERA_DISTANCE) / (CAMERA_DISTANCE - z);
              const screenX = pose.centerX + x * perspective;
              const screenY = pose.centerY + y * perspective;
              minX = Math.min(minX, screenX);
              minY = Math.min(minY, screenY);
              maxX = Math.max(maxX, screenX);
              maxY = Math.max(maxY, screenY);
            }
          }
          const face = {
            minX: Math.max(0, Math.floor(minX)),
            minY: Math.max(0, Math.floor(minY)),
            maxX: Math.min(dotWidth - 1, Math.ceil(maxX)),
            maxY: Math.min(dotHeight - 1, Math.ceil(maxY)),
          };
          if (face.maxX < face.minX || face.maxY < face.minY) continue;

          // Faces are flat, so lighting is computed once per face. The normal in camera space is a
          // column of the rotation matrix.
          const nx = m[a]! * side;
          const ny = m[3 + a]! * side;
          const nz = m[6 + a]! * side;
          const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          const rim = Math.max(0, nx * 0.8 - nz * 0.3);
          // On light backgrounds, highlights toward white would vanish, so faces only get darker than
          // the brand colors there.
          const specular = lightBackground
            ? 0
            : Math.max(0, nx * HALF_VECTOR[0] + ny * HALF_VECTOR[1] + nz * HALF_VECTOR[2]) ** 24 * 0.6 * 255;
          const light = lightBackground
            ? Math.min(1, 0.55 + diffuse * 0.45 + rim * 0.1)
            : 0.45 + diffuse * 0.78 + rim * 0.25;
          faces.push({
            axis: a,
            plane,
            uMin: box.min[u]!,
            uMax: box.max[u]!,
            vMin: box.min[v]!,
            vMax: box.max[v]!,
            ...face,
            red: Math.min(255, box.color[0] * light + specular),
            green: Math.min(255, box.color[1] * light + specular),
            blue: Math.min(255, box.color[2] * light + specular),
          });
        }
      }
    }
    return faces;
  }
}


const raster = new LogoRaster();
const fits = new Map<string, number>();

/** Fit the complete turn, so the logo never clips or changes size as it spins. */
function fitScale(depth: number, pitch: number, rows: number, columns: number, cap: number): number {
  const key = `${depth}|${pitch}|${rows}|${columns}|${cap}`;
  const known = fits.get(key);
  if (known !== undefined) return known;
  let reachX = 0;
  let reachY = 0;
  for (let step = 0; step < 180; step++) {
    const m = rotation(step / 180 * Math.PI * 2, pitch, 0);
    for (const x of [-2, 2]) {
      for (const y of [-2, 2]) {
        for (const z of [-depth / 2, depth / 2]) {
          const xc = m[0]! * x + m[1]! * y + m[2]! * z;
          const yc = m[3]! * x + m[4]! * y + m[5]! * z;
          const zc = m[6]! * x + m[7]! * y + m[8]! * z;
          const factor = CAMERA_DISTANCE / (CAMERA_DISTANCE - zc);
          reachX = Math.max(reachX, Math.abs(xc * factor));
          reachY = Math.max(reachY, Math.abs(yc * factor));
        }
      }
    }
  }
  const scale = Math.max(0.05, Math.min(cap, (rows * 2 - 2) / reachY, (columns - 2) / reachX));
  fits.set(key, scale);
  return scale;
}

/** Pi's pixel logo as a spinning, lit 3D solid, drawn in colored braille cells. */
export function renderLogo3dLines(width: number, options: Options = {}): string[] {
  const {
    pose = DEFAULT_POSE,
    size = DEFAULT_SIZE,
    thickness = DEFAULT_THICKNESS,
    maxRows = 0,
  } = options;
  const wanted = Math.max(5, Math.round(DEFAULT_LINES * size));
  const rows = maxRows > 0 ? Math.max(5, Math.min(wanted, maxRows)) : wanted;
  const grown = rows / DEFAULT_LINES;
  const columns = Math.max(0, Math.min(width, Math.round(DEFAULT_COLUMNS * grown)));
  if (columns === 0) return Array.from({ length: rows }, () => "");

  // At the default thickness the blocks retain the Easter egg's original proportions.
  const depth = ORIGINAL_DEPTH * thickness / DEFAULT_THICKNESS;
  const palette = symbolPalette(options.palette ?? DEFAULT_PALETTE, "logo");
  const boxes: LogoBox[] = LOGO_PIXELS.flatMap((line, row) =>
    [...line].flatMap((pixel, column) => pixel === "." ? [] : [{
      min: [column - 2, row - 2, -depth / 2] as const,
      max: [column - 1, row - 1, depth / 2] as const,
      color: palette.at(
        (column + 0.5) * LOGO_PIXEL_COLUMNS,
        (row + 0.5) * LOGO_PIXEL_ROWS,
      ),
    }]),
  );
  const scale = options.scale === undefined
    ? fitScale(depth, pose.pitch, rows, columns, DOTS_PER_PIXEL * grown)
    : options.scale * DOTS_PER_PIXEL * (CAMERA_DISTANCE - depth / 2) / CAMERA_DISTANCE;
  raster.render(columns, rows, {
    ...pose, roll: 0, centerX: columns, centerY: rows * 2, scale,
  }, boxes, BACKGROUND);

  const left = Math.floor((width - columns) / 2);
  return Array.from({ length: rows }, (_, row) => {
    let line = "";
    let blanks = left;
    let previous = "";
    for (let column = 0; column < columns; column++) {
      const cell = row * columns + column;
      const bits = raster.bits[cell]!;
      if (bits === 0) {
        blanks++;
        continue;
      }
      const count = raster.counts[cell]!;
      const color = `\x1b[38;2;${Math.round(raster.rgb[cell * 3]! / count)};${Math.round(raster.rgb[cell * 3 + 1]! / count)};${Math.round(raster.rgb[cell * 3 + 2]! / count)}m`;
      line += " ".repeat(blanks);
      blanks = 0;
      if (color !== previous) {
        line += color;
        previous = color;
      }
      line += String.fromCharCode(0x2800 + bits);
    }
    return line === "" ? "" : line + RESET;
  });
}
