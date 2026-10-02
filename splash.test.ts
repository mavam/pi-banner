import assert from "node:assert/strict";
import test from "node:test";

import { SplashHeader, PI_ART, renderSplashLines, topPadding } from "./splash.ts";
import { DEFAULT_SETTINGS, type Settings } from "./config.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("renderSplashLines adds blank padding above and below the art", () => {
  const lines = renderSplashLines(80);

  assert.equal(lines.length, PI_ART.length + 2);
  assert.equal(lines[0], "");
  assert.equal(lines.at(-1), "");
});

test("renderSplashLines centers the art within the available width", () => {
  const width = 80;
  const lines = renderSplashLines(width).slice(1, -1).map(stripAnsi);
  const maxLen = Math.max(...PI_ART.map((line) => line.length));
  const pad = Math.floor((width - maxLen) / 2);

  assert.ok(lines[0]?.startsWith(" ".repeat(pad)));
});

test("renderSplashLines applies 24-bit ANSI colors", () => {
  const line = renderSplashLines(80)[1] ?? "";

  assert.match(line, /\x1b\[38;2;\d+;\d+;\d+m/);
  assert.ok(line.endsWith("\x1b[0m"));
});

function makeHeader(settings: Partial<Settings>) {
  const clock = { time: 0, now: () => clock.time };
  let renders = 0;
  const header = new SplashHeader(() => renders++, { ...DEFAULT_SETTINGS, ...settings }, clock);
  return { clock, header, renders: () => renders };
}

test("SplashHeader only turns the 3D slab, and only with a speed", () => {
  for (const settings of [
    { mode: "plain" as const, speed: 12 },
    { mode: "3d" as const, speed: 0 },
  ]) {
    const { header } = makeHeader(settings);
    assert.equal(header.spinning, false, JSON.stringify(settings));
    header.dispose();
  }

  const { header } = makeHeader({ mode: "3d", speed: 12 });
  assert.equal(header.spinning, true);
  header.dispose();
  assert.equal(header.spinning, false);
});

test("SplashHeader turns by speed turns per minute", () => {
  const { clock, header } = makeHeader({ mode: "3d", speed: 60 }); // one turn a second
  const start = header.render(80).join("\n");

  clock.time = 250;
  const quarter = header.render(80).join("\n");
  clock.time = 1000;
  const full = header.render(80).join("\n");

  assert.notEqual(quarter, start);
  assert.equal(full, start);
  header.dispose();
});

test("SplashHeader stays still at speed 0", () => {
  const { clock, header } = makeHeader({ mode: "3d", speed: 0 });
  const start = header.render(80).join("\n");

  clock.time = 5_000;

  assert.equal(header.render(80).join("\n"), start);
});

test("SplashHeader applies new settings right away", () => {
  const { clock, header, renders } = makeHeader({ mode: "3d", speed: 60 });
  clock.time = 300;
  header.render(80);
  const before = renders();

  header.update({ ...DEFAULT_SETTINGS, mode: "3d", speed: 0 });
  assert.equal(header.spinning, false);
  assert.equal(renders(), before + 1);
  const still = header.render(80).join("\n");
  clock.time = 900;
  assert.equal(header.render(80).join("\n"), still);

  header.update({ ...DEFAULT_SETTINGS, mode: "3d", speed: 30 });
  assert.equal(header.spinning, true);
  header.update({ ...DEFAULT_SETTINGS });
  assert.equal(header.spinning, false);
  header.dispose();
});

test("topPadding centers the splash screen in the viewport", () => {
  assert.equal(topPadding(14, 38), 12);
  assert.equal(topPadding(14, 39), 12); // rounds toward the top
  assert.equal(topPadding(14, 14), 0);
});

test("topPadding never goes negative and ignores an unknown viewport", () => {
  assert.equal(topPadding(14, 10), 0);
  assert.equal(topPadding(14, 0), 0);
  assert.equal(topPadding(14, -3), 0);
});

test("SplashHeader pads the top to center in the viewport", () => {
  const clock = { now: () => 0 };
  const plain = { ...DEFAULT_SETTINGS, mode: "plain" as const };
  const bare = new SplashHeader(() => {}, plain, clock).render(80);
  const centered = new SplashHeader(() => {}, plain, clock, () => 38).render(80);
  const padding = centered.length - bare.length;

  assert.equal(padding, topPadding(bare.length, 38));
  assert.ok(centered.slice(0, padding).every((line) => line === ""));
  assert.deepEqual(centered.slice(padding), bare);
  // The splash screen sits in the middle: equal space above and below.
  assert.ok(Math.abs(padding - (38 - centered.length)) <= 1);
});

test("SplashHeader pads the 3D slab too, and re-reads the viewport on every render", () => {
  const clock = { now: () => 0 };
  let rows = 0;
  const header = new SplashHeader(() => {}, { ...DEFAULT_SETTINGS, speed: 0 }, clock, () => rows);

  const top = header.render(80);
  rows = 40;
  const centered = header.render(80);
  header.dispose();

  assert.equal(top.length, 14);
  assert.equal(centered.length, 14 + topPadding(14, 40));
  assert.deepEqual(centered.slice(-14), top);
});
