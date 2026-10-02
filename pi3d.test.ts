import assert from "node:assert/strict";
import test from "node:test";

import { PI_ART, renderLines } from "./splash.ts";
import { DEFAULT_SETTINGS } from "./config.ts";
import { DEFAULT_POSE, render3dLines } from "./pi3d.ts";
import { parsePalette } from "./palette.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** The color in effect at a column of a rendered line. */
function colorAt(line: string, column: number): number[] | undefined {
  let color: number[] | undefined;
  let index = 0;
  for (const match of line.matchAll(/\x1b\[(?:38;2;(\d+);(\d+);(\d+)|0)m|([^\x1b])/gu)) {
    if (match[4] === undefined) {
      color = match[1] === undefined ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
      continue;
    }
    if (index++ === column) return color;
  }
  return undefined;
}

/** Number of lit braille dots. */
function dots(lines: string[]): number {
  let count = 0;
  for (const char of stripAnsi(lines.join(""))) {
    const bits = char.codePointAt(0)! - 0x2800;
    if (bits >= 0 && bits < 256) count += bits.toString(2).replaceAll("0", "").length;
  }
  return count;
}

/** The lit braille dots as "x,y" keys. */
function dotGrid(lines: string[]): Set<string> {
  const bitsOf = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];
  const grid = new Set<string>();
  lines.forEach((line, y) =>
    [...stripAnsi(line)].forEach((char, x) => {
      const bits = char.codePointAt(0)! - 0x2800;
      if (bits < 0 || bits > 255) return;
      bitsOf.forEach((bit, i) => {
        if (bits & bit) grid.add(`${x * 2 + (i & 1)},${y * 4 + (i >> 1)}`);
      });
    }),
  );
  return grid;
}

/** Lit dots with at most one lit neighbor above, below, left or right. */
function weakDots(lines: string[]): string[] {
  const grid = dotGrid(lines);
  return [...grid].filter((key) => {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) =>
      grid.has(`${x + dx!},${y + dy!}`),
    );
    return neighbors.length <= 1;
  });
}

const PLAIN = { ...DEFAULT_SETTINGS, symbol: "pi" as const, mode: "plain" as const };
const SOLID = { ...DEFAULT_SETTINGS, symbol: "pi" as const, mode: "3d" as const };
const FRONT = { pose: { yaw: 0, pitch: 0 }, scale: 1 };

test("render3dLines uses as many lines as the plain splash screen", () => {
  assert.equal(render3dLines(80).length, renderLines(PLAIN, 80).length);
});

test("render3dLines draws braille cells with 24-bit colors", () => {
  const lines = render3dLines(80);
  const text = stripAnsi(lines.join("\n"));

  assert.match(text, /[\u2801-\u28ff]/);
  assert.match(lines.join("\n"), /\x1b\[38;2;\d+;\d+;\d+m/);
});

test("render3dLines never exceeds the available width", () => {
  for (const width of [0, 1, 20, 37, 45, 80, 200]) {
    for (const line of render3dLines(width)) {
      assert.ok([...stripAnsi(line)].length <= width, `width ${width}`);
    }
  }
});

test("render3dLines resets colors at the end of every drawn line", () => {
  for (const line of render3dLines(80)) {
    if (line !== "") assert.ok(line.endsWith("\x1b[0m"));
  }
});

test("render3dLines front view covers the art and leaves its holes empty", () => {
  const width = 80;
  const maxLen = Math.max(...PI_ART.map((line) => line.length));
  const pad = Math.floor((width - maxLen) / 2);
  const lines = render3dLines(width, FRONT).map((line) => [...stripAnsi(line).padEnd(width)]);

  PI_ART.forEach((art, row) => {
    for (let column = 0; column < maxLen; column++) {
      const cell = lines[row + 1]![pad + column]!;
      if ((art[column] ?? " ") === " ") continue;
      assert.notEqual(cell, " ", `row ${row} column ${column}`);
    }
  });
  // Between the top bar and the legs of the π, one row down: "9821    48086".
  assert.equal(lines[4]![pad + 7], " ");
});

test("render3dLines front view colors match the plain rainbow", () => {
  const width = 80;
  const maxLen = Math.max(...PI_ART.map((line) => line.length));
  const column = Math.floor((width - maxLen) / 2) + 20;
  const plain = colorAt(renderLines(PLAIN, width)[3]!, column);
  const solid = colorAt(render3dLines(width, FRONT)[3]!, column);

  assert.ok(plain && solid);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(plain[i]! - solid[i]!) < 40, `channel ${i}`);
  }
});

test("render3dLines rotation changes what is drawn", () => {
  const front = render3dLines(80, FRONT).join("\n");
  const turned = render3dLines(80, { pose: { yaw: 0.8, pitch: 0.2 } }).join("\n");

  assert.notEqual(front, turned);
});

test("render3dLines shows the same amount of slab from the back", () => {
  const front = dots(render3dLines(80, FRONT));
  const back = dots(render3dLines(80, { pose: { yaw: Math.PI, pitch: 0 }, scale: 1 }));

  assert.ok(Math.abs(back - front) / front < 0.05, `${front} vs ${back} dots`);
});

test("render3dLines leaves no stray dots hanging off the shape", () => {
  // At width 50 the default pose used to draw a lone dot below the right foot.
  for (let width = 40; width <= 140; width++) {
    assert.deepEqual(weakDots(render3dLines(width)), [], `width ${width}`);
  }
  for (let step = 0; step < 60; step++) {
    const yaw = (step / 60) * Math.PI * 2;
    const lines = render3dLines(60, { pose: { yaw, pitch: 0.2 * Math.sin(yaw * 1.5) } });
    assert.deepEqual(weakDots(lines), [], `yaw ${yaw}`);
  }
});

test("render3dLines thickness controls how deep the slab looks edge-on", () => {
  const edgeOn = { yaw: Math.PI / 2, pitch: 0 };
  const thin = dots(render3dLines(80, { pose: edgeOn, thickness: 1 }));
  const thick = dots(render3dLines(80, { pose: edgeOn, thickness: 12 }));

  assert.ok(thick > thin * 3, `${thin} vs ${thick} dots`);
});

test("render3dLines keeps every thickness and yaw inside the splash screen rows", () => {
  for (const thickness of [0.5, 7, 20]) {
    for (let step = 0; step < 37; step++) {
      const yaw = (step / 37) * Math.PI * 2;
      const lines = render3dLines(100, { pose: { yaw, pitch: DEFAULT_POSE.pitch }, thickness });
      const last = lines.length * 4 - 1;
      for (const key of dotGrid(lines)) {
        const y = Number(key.split(",")[1]);
        assert.ok(y >= 1 && y <= last - 1, `thickness ${thickness}, yaw ${yaw}: dot row ${y}`);
      }
    }
  }
});

test("render3dLines size scales the rows, and size 1 is the default look", () => {
  assert.deepEqual(render3dLines(100, { size: 1 }), render3dLines(100));
  assert.equal(render3dLines(100, { size: 0.5 }).length, 7);
  assert.equal(render3dLines(100, { size: 1 }).length, 14);
  assert.equal(render3dLines(100, { size: 2 }).length, 28);
  assert.equal(render3dLines(100, { size: 1.5 }).length, 21);
});

test("render3dLines draws more of the π the larger the size", () => {
  const amount = (size: number) => dots(render3dLines(120, { size, pose: DEFAULT_POSE }));

  assert.ok(amount(0.6) < amount(1), `${amount(0.6)} vs ${amount(1)}`);
  assert.ok(amount(1) < amount(1.5), `${amount(1)} vs ${amount(1.5)}`);
  assert.ok(amount(1.5) < amount(2), `${amount(1.5)} vs ${amount(2)}`);
});

test("render3dLines keeps every size inside the terminal and the canvas", () => {
  for (const width of [30, 60, 100, 160]) {
    for (const size of [0.5, 1, 2]) {
      for (let step = 0; step < 24; step++) {
        const yaw = (step / 24) * Math.PI * 2;
        const lines = render3dLines(width, { size, pose: { yaw, pitch: DEFAULT_POSE.pitch }, thickness: 12 });
        const where = `width ${width}, size ${size}, yaw ${yaw}`;
        for (const line of lines) assert.ok([...stripAnsi(line)].length <= width, where);
        // Dots on the outermost row or column would mean the slab was cut off.
        for (const key of dotGrid(lines)) {
          const [x, y] = key.split(",").map(Number) as [number, number];
          assert.ok(y >= 1 && y <= lines.length * 4 - 2, `${where}: dot row ${y}`);
          assert.ok(x >= 1 && x <= width * 2 - 2, `${where}: dot column ${x}`);
        }
      }
    }
  }
});

test("render3dLines shrinks to the rows it is given", () => {
  assert.equal(render3dLines(100, { size: 2, maxRows: 10 }).length, 10);
  assert.equal(render3dLines(100, { size: 1, maxRows: 40 }).length, 14);
  assert.equal(render3dLines(100, { size: 2, maxRows: 0 }).length, 28);
  assert.equal(render3dLines(100, { size: 1, maxRows: 2 }).length, 5);
  // The π is scaled down to fit the shorter canvas rather than cut off.
  const lines = render3dLines(100, { size: 2, maxRows: 10, pose: DEFAULT_POSE });
  for (const key of dotGrid(lines)) {
    const y = Number(key.split(",")[1]);
    assert.ok(y >= 1 && y <= 10 * 4 - 2, `dot row ${y}`);
  }
});

test("render3dLines leaves no stray dots at any size", () => {
  for (const size of [0.5, 0.8, 1.3, 2]) {
    for (const width of [60, 61, 100]) {
      assert.deepEqual(weakDots(render3dLines(width, { size })), [], `size ${size} at ${width}`);
    }
  }
});

test("render3dLines leaves no stray dots at any thickness", () => {
  for (const thickness of [0.5, 2, 20]) {
    for (const width of [50, 51, 80, 81]) {
      assert.deepEqual(weakDots(render3dLines(width, { thickness })), [], `${thickness} at ${width}`);
    }
  }
});

test("render3dLines paints with the palette and keeps the geometry", () => {
  const rainbow = render3dLines(80, FRONT);
  const red = render3dLines(80, { ...FRONT, palette: parsePalette("#ff0000")! });
  const colors = [...red.join("").matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)];

  assert.deepEqual(red.map(stripAnsi), rainbow.map(stripAnsi));
  assert.ok(colors.length > 0);
  for (const [, r, g, b] of colors) assert.ok(Number(r) > Number(g) && Number(r) > Number(b));
});

test("renderLines passes thickness and palette through to the 3D slab", () => {
  const base = { ...SOLID };
  const thick = renderLines({ ...base, thickness: 14 }, 80, Math.PI / 2).join("");
  const thin = renderLines({ ...base, thickness: 1 }, 80, Math.PI / 2).join("");
  const mono = renderLines({ ...base, color: "mono" }, 80).join("");

  assert.ok(dots([thick]) > dots([thin]));
  assert.notEqual(mono, renderLines(base, 80).join(""));
});

test("renderLines passes size and the row limit through, and plain ignores them", () => {
  const big = renderLines({ ...SOLID, size: 2 }, 100);

  assert.equal(big.length, 28);
  assert.equal(renderLines({ ...SOLID, size: 2 }, 100, 0, 12).length, 12);
  assert.deepEqual(renderLines({ ...PLAIN, size: 2 }, 100, 0, 12), renderLines(PLAIN, 100));
});

test("renderLines paints the plain splash screen with the palette", () => {
  const sunset = renderLines({ ...PLAIN, color: "#00ff00" }, 80)[2]!;

  assert.match(sunset, /\x1b\[38;2;0;255;0m/);
  assert.match(stripAnsi(sunset), /5028841971/);
});

test("renderLines switches between the plain splash screen and the 3D π", () => {
  assert.deepEqual(renderLines(PLAIN, 80), renderLines(PLAIN, 80));
  assert.notDeepEqual(renderLines(SOLID, 80), renderLines(PLAIN, 80));
  assert.match(stripAnsi(renderLines(PLAIN, 80).join("")), /3\.141592653589793/);
  assert.doesNotMatch(stripAnsi(renderLines(SOLID, 80).join("")), /[0-9]/);
});
