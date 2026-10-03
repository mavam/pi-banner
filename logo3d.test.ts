import assert from "node:assert/strict";
import test from "node:test";

import { LOGO_ART, LOGO_PIXELS } from "./art.ts";
import { DEFAULT_SETTINGS } from "./config.ts";
import { renderLogo3dLines } from "./logo3d.ts";
import { PALETTE_NAMES, legible, parsePalette, rgbToHsl, type Rgb } from "./palette.ts";
import { DEFAULT_POSE } from "./pi3d.ts";
import { renderLines } from "./splash.ts";

const LOGO = { ...DEFAULT_SETTINGS, symbol: "logo" as const };
const FRONT = { pose: { yaw: 0, pitch: 0 }, scale: 1 };
const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

function dotGrid(lines: string[]): Set<string> {
  const dotBits = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];
  const dots = new Set<string>();
  lines.forEach((line, row) => {
    [...strip(line)].forEach((char, column) => {
      const bits = char.codePointAt(0)! - 0x2800;
      if (bits < 0 || bits > 255) return;
      dotBits.forEach((bit, index) => {
        if (bits & bit) dots.add(`${column * 2 + (index & 1)},${row * 4 + (index >> 1)}`);
      });
    });
  });
  return dots;
}

test("the default splash renders the Pi logo in its original colors", () => {
  assert.deepEqual(renderLines(DEFAULT_SETTINGS, 80), renderLogo3dLines(80));
});

/** The escape sequence that colors the blocks of a plain splash screen. */
function fg([r, g, b]: Rgb): RegExp {
  return new RegExp(`\\x1b\\[38;2;${r};${g};${b}m█`);
}

test("the plain logo uses Pi's original 4x4 pixel layout and brand colors", () => {
  assert.deepEqual(LOGO_PIXELS, ["ccc.", "b.c.", "bb.y", "b..y"]);
  const lines = renderLines({ ...LOGO, mode: "plain" }, 80);
  const pad = (80 - 24) / 2;
  assert.deepEqual(lines.slice(1, -1).map((line) => strip(line).slice(pad)), LOGO_ART);
  assert.match(lines[1]!, fg(legible([228, 138, 122])));
  assert.match(lines[4]!, fg(legible([79, 142, 179])));
  assert.match(lines[7]!, fg(legible([234, 182, 93])));
  assert.doesNotMatch(strip(lines.join("")), /[0-9]/);
});

test("the logo works in both modes without exceeding the terminal width", () => {
  for (const mode of ["plain", "3d"] as const) {
    for (const width of [0, 1, 10, 24, 37, 80, 200]) {
      const lines = renderLines({ ...LOGO, mode }, width);
      assert.equal(lines.length, 14);
      for (const line of lines) {
        assert.ok([...strip(line)].length <= width, `${mode} at width ${width}`);
        if (line !== "") assert.ok(line.endsWith("\x1b[0m"));
      }
    }
  }
});

test("the logo front view fills its pixel blocks and keeps the hole interiors empty", () => {
  const width = 80;
  const dots = dotGrid(renderLogo3dLines(width, FRONT));
  const left = (width - 24) / 2 * 2;
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const filled = LOGO_PIXELS[Math.floor(y / 12)]![Math.floor(x / 12)] !== ".";
      // Perspective reveals the inner side walls along hole boundaries.
      const interior = x % 12 >= 2 && x % 12 < 10 && y % 12 >= 2 && y % 12 < 10;
      if (filled || interior) assert.equal(dots.has(`${left + x},${4 + y}`), filled, `dot ${x},${y}`);
    }
  }
  assert.ok(dots.size >= 10 * 12 * 12);
  assert.ok(dots.size < 11 * 12 * 12);
});

test("the logo spins, and its front and back have the same coverage", () => {
  const front = renderLogo3dLines(80, FRONT);
  const back = renderLogo3dLines(80, { ...FRONT, pose: { yaw: Math.PI, pitch: 0 } });
  const turned = renderLogo3dLines(80, { pose: { yaw: 0.8, pitch: 0.2 } });
  assert.notDeepEqual(turned.map(strip), front.map(strip));
  assert.equal(dotGrid(back).size, dotGrid(front).size);
  assert.match(front.join(""), /\x1b\[38;2;\d+;\d+;\d+m/);
});

test("size, thickness, and row limits apply to the logo", () => {
  for (const [size, rows] of [[0.5, 7], [1, 14], [1.5, 21], [2, 28]]) {
    assert.equal(renderLogo3dLines(100, { size }).length, rows);
  }
  assert.equal(renderLogo3dLines(100, { size: 2, maxRows: 10 }).length, 10);
  assert.equal(renderLogo3dLines(100, { maxRows: 2 }).length, 5);
  const small = dotGrid(renderLogo3dLines(100, { size: 0.5 })).size;
  const large = dotGrid(renderLogo3dLines(100, { size: 2 })).size;
  assert.ok(large > small * 4);
  const edge = { yaw: Math.PI / 2, pitch: 0 };
  const thin = dotGrid(renderLogo3dLines(80, { pose: edge, thickness: 1 })).size;
  const thick = dotGrid(renderLogo3dLines(80, { pose: edge, thickness: 20 })).size;
  assert.ok(thick > thin * 3, `${thin} vs ${thick} dots`);
  assert.equal(renderLines({ ...LOGO, size: 2 }, 100, 0, 12).length, 12);
  assert.deepEqual(
    renderLines({ ...LOGO, mode: "plain", size: 2, thickness: 20, speed: 0 }, 100, 1, 5),
    renderLines({ ...LOGO, mode: "plain" }, 100),
  );
});

test("the whole logo fits for every size, thickness, and rotation", () => {
  for (const width of [10, 30, 61, 100]) {
    for (const size of [0.5, 1, 2]) {
      for (const thickness of [0.5, 8, 20]) {
        for (let step = 0; step < 24; step++) {
          const yaw = step / 24 * Math.PI * 2;
          const lines = renderLogo3dLines(width, { size, thickness, pose: { yaw, pitch: DEFAULT_POSE.pitch } });
          const where = `width ${width}, size ${size}, thickness ${thickness}, yaw ${yaw}`;
          for (const line of lines) assert.ok([...strip(line)].length <= width, where);
          for (const dot of dotGrid(lines)) {
            const [x, y] = dot.split(",").map(Number);
            assert.ok(x! >= 1 && x! <= width * 2 - 2, `${where}: column ${x}`);
            assert.ok(y! >= 1 && y! <= lines.length * 4 - 2, `${where}: row ${y}`);
          }
        }
      }
    }
  }
});

test("every palette paints the logo without changing its geometry", () => {
  const reference = renderLogo3dLines(80).map(strip);
  for (const color of [...PALETTE_NAMES, "#ff0000", "#f00,#0ff"]) {
    const lines = renderLogo3dLines(80, { palette: parsePalette(color)! });
    assert.deepEqual(lines.map(strip), reference, color);
    assert.deepEqual(lines, renderLines({ ...LOGO, color }, 80));
  }
  const solid = renderLines({ ...LOGO, color: "#ff0000" }, 80);
  for (const [, r, g, b] of solid.join("").matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)) {
    assert.ok(Number(r) > Number(g) && Number(r) > Number(b));
  }
  const plain = renderLines({ ...LOGO, mode: "plain", color: "#00ff00" }, 80);
  assert.match(plain.join(""), fg(legible([0, 255, 0])));
});

test("reused raster buffers clear old geometry and colors across frames and resizes", () => {
  const first = renderLogo3dLines(80);
  renderLogo3dLines(80, { pose: { yaw: 2, pitch: 0.4 }, palette: parsePalette("#f00")! });
  assert.deepEqual(renderLogo3dLines(80), first);
  renderLogo3dLines(1, { size: 0.5 });
  renderLogo3dLines(120, { size: 2 });
  renderLogo3dLines(0);
  assert.deepEqual(renderLogo3dLines(80), first);
});

test("the logo's faces keep the hue of their color instead of washing out", () => {
  const palette = parsePalette("#3a7bd5")!;
  const hue = rgbToHsl([58, 123, 213])[0];
  for (const yaw of [-0.9, -0.35, 0, 0.5, 1.4, 2.6, 3.5]) {
    const lines = renderLogo3dLines(80, { pose: { yaw, pitch: 0.2 }, palette });
    const colors = [...lines.join("").matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)];

    assert.ok(colors.length > 0);
    for (const [, r, g, b] of colors) {
      assert.ok(Math.abs(rgbToHsl([Number(r), Number(g), Number(b)])[0] - hue) <= 8, `yaw ${yaw}: ${r},${g},${b}`);
    }
  }
});
