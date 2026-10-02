import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_COLOR, DEFAULT_PALETTE, PALETTE_NAMES, hslToRgb, parsePalette, randomPreset, rgbToHsl, shade } from "./palette.ts";

test("parsePalette knows every preset", () => {
  for (const name of PALETTE_NAMES) assert.ok(parsePalette(name), name);
});

test("the default palette is the default color", () => {
  assert.equal(DEFAULT_COLOR, "pi");
  assert.equal(parsePalette(DEFAULT_COLOR), DEFAULT_PALETTE);
});

test("randomPreset can pick every preset and nothing else", () => {
  const picks = PALETTE_NAMES.map((_, index) => randomPreset(() => index / PALETTE_NAMES.length));

  assert.deepEqual(picks, [...PALETTE_NAMES]);
  assert.equal(randomPreset(() => 0.999999), PALETTE_NAMES.at(-1));
  assert.ok(PALETTE_NAMES.includes(randomPreset()));
});

test("parsePalette is case and space insensitive", () => {
  assert.equal(parsePalette(" Sunset "), parsePalette("sunset"));
  assert.equal(parsePalette("#FF0000, #0000FF"), parsePalette("#ff0000,#0000ff"));
});

test("parsePalette rejects what it cannot read", () => {
  for (const spec of ["", "nope", "#12", "#ggg", "#ff0000,", "rainbow,#fff", "ff0000"]) {
    assert.equal(parsePalette(spec), undefined, spec);
  }
});

test("the rainbow keeps its original colors", () => {
  const rainbow = parsePalette("rainbow")!;

  assert.deepEqual(rainbow.at(0, 0), hslToRgb(0, 0.85, 0.65));
  assert.deepEqual(rainbow.at(10, 2), hslToRgb(((10 + 2 * 3) / 50) * 360, 0.85, 0.65));
});

test("one hex color paints everything the same", () => {
  const solid = parsePalette("#336699")!;

  assert.deepEqual(solid.at(0, 0), [0x33, 0x66, 0x99]);
  assert.deepEqual(solid.at(30, 10), [0x33, 0x66, 0x99]);
});

test("short hex colors expand", () => {
  assert.deepEqual(parsePalette("#f80")!.at(5, 5), [255, 136, 0]);
});

test("several hex colors blend along the diagonal", () => {
  const blend = parsePalette("#000000,#ffffff")!;

  assert.deepEqual(blend.at(0, 0), [0, 0, 0]);
  assert.deepEqual(blend.at(34, 11), [255, 255, 255]); // the far corner of the art
  const middle = blend.at(20, 4);
  assert.ok(middle[0] > 60 && middle[0] < 200);
});

test("the pi preset uses the logo's colors by region", () => {
  const pi = parsePalette("pi")!;
  const coral = pi.at(10, 0);

  assert.deepEqual(pi.at(30, 1), coral); // the bar
  assert.deepEqual(pi.at(25, 5), coral); // the right leg
  assert.notDeepEqual(pi.at(12, 6), coral); // the left leg is blue
  assert.ok(pi.at(12, 6)[2] > pi.at(12, 6)[0]);
  assert.ok(pi.at(30, 10)[0] > pi.at(30, 10)[2]); // the foot is yellow
});

test("shade darkens and lightens while keeping the hue", () => {
  const color = parsePalette("#3fa0ff")!.at(0, 0);
  const [hue] = rgbToHsl(color);
  const dark = shade(color, 0.6);
  const [darkHue, , darkLightness] = rgbToHsl(dark);

  assert.ok(darkLightness < rgbToHsl(color)[2]);
  assert.ok(Math.abs(darkHue - hue) < 3);
  assert.deepEqual(shade(color, 1), color);
});

test("rgbToHsl inverts hslToRgb", () => {
  for (const hue of [0, 45, 120, 200, 300, 350]) {
    const [h, s, l] = rgbToHsl(hslToRgb(hue, 0.85, 0.5));
    assert.ok(Math.abs(h - hue) < 2, `hue ${hue}`);
    assert.ok(Math.abs(s - 0.85) < 0.02 && Math.abs(l - 0.5) < 0.02);
  }
});
