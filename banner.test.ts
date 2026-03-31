import assert from "node:assert/strict";
import test from "node:test";

import { PI_ART, renderBannerLines } from "./banner.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("renderBannerLines adds blank padding above and below the art", () => {
  const lines = renderBannerLines(80);

  assert.equal(lines.length, PI_ART.length + 2);
  assert.equal(lines[0], "");
  assert.equal(lines.at(-1), "");
});

test("renderBannerLines centers the art within the available width", () => {
  const width = 80;
  const lines = renderBannerLines(width).slice(1, -1).map(stripAnsi);
  const maxLen = Math.max(...PI_ART.map((line) => line.length));
  const pad = Math.floor((width - maxLen) / 2);

  assert.ok(lines[0]?.startsWith(" ".repeat(pad)));
});

test("renderBannerLines applies 24-bit ANSI colors", () => {
  const line = renderBannerLines(80)[1] ?? "";

  assert.match(line, /\x1b\[38;2;\d+;\d+;\d+m/);
  assert.ok(line.endsWith("\x1b[0m"));
});
