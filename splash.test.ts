import assert from "node:assert/strict";
import test from "node:test";

import { SplashHeader, PI_ART, renderLines, renderSplashLines, topPadding } from "./splash.ts";
import { visibleWidth, type Hints } from "./instructions.ts";
import { DEFAULT_SETTINGS, type Settings } from "./config.ts";
import { DARK_BACKGROUND, LIGHT_BACKGROUND, MIN_CONTRAST, PALETTE_NAMES, contrastRatio, type Rgb } from "./palette.ts";

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
  const header = new SplashHeader(() => renders++, { ...DEFAULT_SETTINGS, ...settings }, { clock });
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
  header.update({ ...DEFAULT_SETTINGS, mode: "plain" });
  assert.equal(header.spinning, false);
  header.dispose();
});

test("SplashHeader turns by default", () => {
  const { header } = makeHeader({});

  assert.equal(header.spinning, true);
  header.dispose();
});

test("SplashHeader applies the symbol immediately and rotates the logo at the configured speed", () => {
  const { clock, header, renders } = makeHeader({ symbol: "pi", speed: 60 });
  const pi = header.render(80);
  const before = renders();
  const settings = { ...DEFAULT_SETTINGS, symbol: "logo" as const, speed: 60 };
  header.update(settings);
  assert.equal(renders(), before + 1);
  const logo = header.render(80);
  assert.deepEqual(logo, renderLines(settings, 80));
  assert.notDeepEqual(logo, pi);
  clock.time = 250;
  assert.notDeepEqual(header.render(80), logo);
  clock.time = 1000;
  assert.deepEqual(header.render(80), logo);
  header.update({ ...settings, speed: 0 });
  assert.equal(header.spinning, false);
  header.update({ ...settings, mode: "plain" });
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
  const bare = new SplashHeader(() => {}, plain, { clock }).render(80);
  const centered = new SplashHeader(() => {}, plain, { clock, viewportRows: () => 38 }).render(80);
  const padding = centered.length - bare.length;

  assert.equal(padding, topPadding(bare.length, 38));
  assert.ok(centered.slice(0, padding).every((line) => line === ""));
  assert.deepEqual(centered.slice(padding), bare);
  // The splash screen sits in the middle: equal space above and below.
  assert.ok(Math.abs(padding - (38 - centered.length)) <= 1);
});

test("SplashHeader keeps a large size within the viewport", () => {
  const clock = { now: () => 0 };
  const settings = { ...DEFAULT_SETTINGS, size: 2, speed: 0 };
  const tight = new SplashHeader(() => {}, settings, { clock, viewportRows: () => 18 }).render(100);
  const roomy = new SplashHeader(() => {}, settings, { clock, viewportRows: () => 60 }).render(100);
  const regular = new SplashHeader(() => {}, settings, { clock }).render(100);

  assert.equal(tight.length, 18); // shrunk to the viewport, nothing left to pad
  assert.equal(roomy.length, 28 + topPadding(28, 60)); // the full size, centered
  assert.equal(regular.length, 28); // regular mode has no viewport to respect
});

test("SplashHeader pads the 3D slab too, and re-reads the viewport on every render", () => {
  const clock = { now: () => 0 };
  let rows = 0;
  const header = new SplashHeader(() => {}, { ...DEFAULT_SETTINGS, speed: 0 }, { clock, viewportRows: () => rows });

  const top = header.render(80);
  rows = 40;
  const centered = header.render(80);
  header.dispose();

  assert.equal(top.length, 14);
  assert.equal(centered.length, 14 + topPadding(14, 40));
  assert.deepEqual(centered.slice(-14), top);
});

/** Plain-text hints that name each key after its keybinding, so tests can read the layout. */
const HINTS: Hints = {
  hint: (keybinding, description) => `[${keybinding}] ${description}`,
  raw: (key, description) => `[${key}] ${description}`,
  key: (keybinding) => keybinding,
  muted: (text) => text,
};

function hintHeader(settings: Partial<Settings>, options: { rows?: number; quiet?: boolean } = {}) {
  let renders = 0;
  const header = new SplashHeader(() => renders++, { ...DEFAULT_SETTINGS, speed: 0, ...settings }, {
    clock: { now: () => 0 },
    viewportRows: () => options.rows ?? 0,
    hints: HINTS,
    quiet: () => options.quiet ?? false,
  });
  return { header, renders: () => renders };
}

test("SplashHeader shows the key hints under the splash screen by default", () => {
  const { header } = hintHeader({});
  const lines = header.render(140);

  assert.match(lines.at(-1)!, /\[\/\] commands/);
  assert.match(lines.at(-1)!, /\[!\] bash/);
  assert.match(lines.at(-1)!, /\[app\.tools\.expand\] more/);
  assert.equal(lines.length, 14 + 1);
});

test("SplashHeader shows no hints when pi's quietStartup asks for quiet", () => {
  const quiet = hintHeader({}, { quiet: true }).header.render(140);
  const loud = hintHeader({}, { quiet: false }).header.render(140);

  assert.equal(quiet.length, 14);
  assert.doesNotMatch(quiet.join("\n"), /commands/);
  assert.equal(loud.length, 15);
  // Only the hints differ: the splash screen itself is the same.
  assert.deepEqual(loud.slice(0, 14), quiet);
});

test("SplashHeader shows no hints without pi's formatters", () => {
  const lines = new SplashHeader(() => {}, { ...DEFAULT_SETTINGS, speed: 0 }, { clock: { now: () => 0 } }).render(140);

  assert.equal(lines.length, 14);
});

test("SplashHeader shows hints under the plain digits too", () => {
  const lines = hintHeader({ symbol: "pi", mode: "plain" }).header.render(140);

  assert.match(lines.at(-1)!, /commands/);
  assert.match(stripAnsi(lines.join("\n")), /3\.141592653589793/);
});

test("SplashHeader expands the hints like pi's own header, adding rows below the π", () => {
  const { header, renders } = hintHeader({}, { rows: 44 });
  const collapsed = header.render(120);
  const before = renders();
  header.setExpanded(true);
  const expanded = header.render(120);

  assert.equal(renders(), before + 1);
  assert.ok(expanded.length > collapsed.length + 10, `${collapsed.length} -> ${expanded.length} rows`);
  assert.match(expanded.join("\n"), /\[drop files\] to attach/);
  assert.doesNotMatch(collapsed.join("\n"), /drop files/);
  // Within the header, everything above the hints, including the π, is unchanged.
  // When the longer header outgrows the viewport, pi scrolls it, as for its own.
  assert.deepEqual(expanded.slice(0, collapsed.length - 1), collapsed.slice(0, -1));

  header.setExpanded(false);
  assert.deepEqual(header.render(120), collapsed);
});

test("SplashHeader only asks for a render when the expansion changes", () => {
  const { header, renders } = hintHeader({});
  header.setExpanded(false);
  assert.equal(renders(), 0);
  header.setExpanded(true);
  header.setExpanded(true);
  assert.equal(renders(), 1);
});

test("SplashHeader centers the π with its hints and leaves them room on short terminals", () => {
  const roomy = hintHeader({}, { rows: 44 }).header.render(140);
  // The π's canvas has its own blank margin rows, so count the padding from the total.
  assert.equal(roomy.length - (14 + 1), topPadding(14 + 1, 44));
  assert.ok(roomy.slice(0, topPadding(14 + 1, 44)).every((line) => line === ""));

  // Terminal too short for the full size: the π shrinks so that the hints still fit.
  const tight = hintHeader({ size: 2 }, { rows: 18 }).header.render(140);
  assert.equal(tight.length, 18);
  assert.match(tight.at(-1)!, /commands/);
});

test("SplashHeader fits the logo and its key hints in a short viewport", () => {
  const lines = hintHeader({ symbol: "logo", size: 2 }, { rows: 18 }).header.render(80);
  assert.equal(lines.length, 18);
  assert.match(lines.at(-1)!, /commands/);
  assert.match(lines.join(""), /[\u2801-\u28ff]/);
  const plain = hintHeader({ symbol: "logo", mode: "plain" }).header.render(80);
  assert.match(plain.at(-1)!, /commands/);
  assert.match(stripAnsi(plain.join("")), /█/);
});

test("SplashHeader wraps the hints on a narrow terminal", () => {
  const lines = hintHeader({}).header.render(40);
  const hints = lines.filter((line) => /\[/.test(line));

  assert.ok(hints.length > 1);
  for (const line of lines) assert.ok(visibleWidth(line) <= 40, line);
});

test("every color stands out from both light and dark backgrounds", () => {
  for (const mode of ["plain", "3d"] as const) {
    for (const symbol of ["pi", "logo"] as const) {
      for (const color of [...PALETTE_NAMES, "#ffff00", "#0000ff", "#fff", "#000"]) {
        const settings: Settings = { ...DEFAULT_SETTINGS, mode, symbol, color };
        const colors = [...renderLines(settings, 80, 0.7).join("").matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)];

        assert.ok(colors.length > 0, `${mode} ${symbol} ${color}`);
        for (const [, r, g, b] of colors) {
          const rgb: Rgb = [Number(r), Number(g), Number(b)];
          for (const background of [DARK_BACKGROUND, LIGHT_BACKGROUND]) {
            assert.ok(contrastRatio(rgb, background) >= MIN_CONTRAST - 0.1, `${mode} ${symbol} ${color} ${rgb}`);
          }
        }
      }
    }
  }
});
