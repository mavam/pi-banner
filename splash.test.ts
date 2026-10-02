import assert from "node:assert/strict";
import test from "node:test";

import { PI_ART, renderSplashLines } from "./splash.ts";

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
