import assert from "node:assert/strict";
import test from "node:test";

import { compactLines, expandedLines, fit, visibleWidth, type Hints } from "./instructions.ts";

/** Plain-text hints that name each key after its keybinding. */
const PLAIN: Hints = {
  hint: (keybinding, description) => `<${keybinding}> ${description}`,
  raw: (key, description) => `<${key}> ${description}`,
  key: (keybinding) => keybinding,
  muted: (text) => text,
};

/** Hints colored the way pi colors them: a dim key, a muted description, and resets. */
const COLORED: Hints = {
  hint: (keybinding, description) => `\x1b[2m${keybinding}\x1b[22m\x1b[38;2;130;130;130m ${description}\x1b[39m`,
  raw: (key, description) => `\x1b[2m${key}\x1b[22m\x1b[38;2;130;130;130m ${description}\x1b[39m`,
  key: (keybinding) => keybinding,
  muted: (text) => `\x1b[38;2;130;130;130m${text}\x1b[39m`,
};

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

test("visibleWidth ignores colors and hyperlinks", () => {
  assert.equal(visibleWidth("abc"), 3);
  assert.equal(visibleWidth("\x1b[38;2;1;2;3mabc\x1b[0m"), 3);
  assert.equal(visibleWidth("\x1b]8;;https://example.com\x07link\x1b]8;;\x07"), 4);
  assert.equal(visibleWidth("·π"), 2);
});

test("fit leaves short text alone and cuts long text without losing its colors", () => {
  assert.equal(fit("abc", 5), "abc");
  assert.equal(fit("abcdef", 3), "abc\x1b[0m");
  assert.equal(fit("abc", 0), "");
  const cut = fit("\x1b[31mabcdef\x1b[39m", 4);

  assert.equal(visibleWidth(cut), 4);
  assert.ok(cut.startsWith("\x1b[31m"));
  assert.ok(cut.endsWith("\x1b[0m"));
});

test("compactLines is one centered line with the hints that need saying", () => {
  const lines = compactLines(PLAIN, 120);

  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.trim(), "</> commands · <!> bash · <app.tools.expand> more");
  const width = visibleWidth(lines[0]!.trim());
  assert.equal(lines[0]!.length - lines[0]!.trimStart().length, Math.floor((120 - width) / 2));
});

test("compactLines wraps at hint boundaries when the terminal is narrow", () => {
  const lines = compactLines(PLAIN, 30);
  const text = lines.map((line) => line.trim()).join(" ");

  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(visibleWidth(line) <= 30, line);
  // Every hint appears once, in order, and none is split across lines.
  const hints = ["> commands", "> bash", "> more"];
  for (const hint of hints) assert.equal(text.split(hint).length - 1, 1, hint);
  const at = hints.map((hint) => text.indexOf(hint));
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  for (const line of lines) assert.equal(line.trim().split(" · ").every((hint) => hints.some((h) => hint.endsWith(h.slice(2)))), true);
});

test("compactLines always fits, however narrow, with and without colors", () => {
  for (const hints of [PLAIN, COLORED]) {
    for (let width = 1; width <= 130; width++) {
      for (const line of compactLines(hints, width)) {
        assert.ok(visibleWidth(line) <= width, `width ${width}: ${JSON.stringify(strip(line))}`);
      }
    }
  }
  assert.deepEqual(compactLines(PLAIN, 0), []);
  assert.deepEqual(compactLines(PLAIN, -5), []);
});

test("compactLines keeps the theme's colors and the muted separator", () => {
  const line = compactLines(COLORED, 120)[0]!;

  assert.match(line, /\x1b\[2m\/\x1b\[22m/);
  assert.match(line, /\x1b\[38;2;130;130;130m · \x1b\[39m/);
  assert.equal(strip(line).trim().split(" · ").length, 3);
});

test("expandedLines lists the hints that are specific to pi, one per line", () => {
  const lines = expandedLines(PLAIN, 120).map((line) => line.trim());

  assert.equal(lines.length, 13);
  assert.equal(lines[0], "<app.thinking.cycle> to cycle thinking level");
  assert.ok(lines.includes("<app.model.cycleForward/app.model.cycleBackward> to cycle models"));
  assert.ok(lines.includes("</> for commands"));
  assert.ok(lines.includes("<!!> to run bash (no context)"));
  assert.equal(lines.at(-1), "<drop files> to attach");
});

test("no view tells people what every terminal user already knows", () => {
  const everything = [...compactLines(PLAIN, 200), ...expandedLines(PLAIN, 200)].join("\n");

  for (const obvious of ["app.interrupt", "app.clear", "app.exit", "app.suspend", "deleteToLineEnd"]) {
    assert.ok(!everything.includes(obvious), obvious);
  }
});

test("expandedLines centers the list as one block so the hints line up", () => {
  const lines = expandedLines(PLAIN, 120);
  const pads = lines.map((line) => line.length - line.trimStart().length);
  const widest = Math.max(...lines.map(visibleWidth));

  assert.ok(pads.every((pad) => pad === pads[0]));
  assert.equal(pads[0], Math.floor((120 - (widest - pads[0]!)) / 2));
});

test("expandedLines always fits", () => {
  for (const hints of [PLAIN, COLORED]) {
    for (const width of [1, 5, 20, 40, 60, 80, 120]) {
      for (const line of expandedLines(hints, width)) {
        assert.ok(visibleWidth(line) <= width, `width ${width}`);
      }
    }
  }
  assert.deepEqual(expandedLines(PLAIN, 0), []);
});
