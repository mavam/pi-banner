import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_COLOR, DEFAULT_PALETTE, DARK_BACKGROUND, LIGHT_BACKGROUND, MIN_CONTRAST, PALETTE_NAMES, contrastRatio, hslToRgb, legible, parsePalette, randomPreset, rgbToHsl, shade, symbolPalette } from "./palette.ts";

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

test("the logo palette follows each pixel of the original logo", () => {
  const logo = symbolPalette(DEFAULT_PALETTE, "logo");
  const colors = { c: [228, 138, 122], b: [79, 142, 179], y: [234, 182, 93] };
  ["ccc.", "b.c.", "bb.y", "b..y"].forEach((line, row) => {
    [...line].forEach((pixel, column) => {
      if (pixel === ".") return;
      assert.deepEqual(logo.at(column * 6, row * 3), colors[pixel as keyof typeof colors]);
    });
  });
  assert.equal(symbolPalette(DEFAULT_PALETTE, "pi"), DEFAULT_PALETTE);
});

test("logo palettes keep solid colors and span the whole gradient", () => {
  const solid = symbolPalette(parsePalette("#f80")!, "logo");
  assert.deepEqual(solid.at(0, 0), [255, 136, 0]);
  assert.deepEqual(solid.at(23, 11), [255, 136, 0]);
  const gradient = symbolPalette(parsePalette("#000,#fff")!, "logo");
  assert.deepEqual(gradient.at(0, 0), [0, 0, 0]);
  assert.deepEqual(gradient.at(23, 11), [255, 255, 255]);
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

test("contrastRatio spans 1 to 21", () => {
  assert.equal(contrastRatio([255, 255, 255], [255, 255, 255]), 1);
  assert.ok(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 1e-9);
});

function stands_out(color: [number, number, number]): boolean {
  return [DARK_BACKGROUND, LIGHT_BACKGROUND].every(
    (background) => contrastRatio(color, background) >= MIN_CONTRAST - 0.05,
  );
}

test("legible moves pale and dark colors into the band that suits both backgrounds", () => {
  for (const color of [[255, 255, 255], [0, 0, 0], [255, 255, 0], [0, 0, 255], [20, 20, 24], [240, 240, 240]] as const) {
    const result = legible([...color]);

    assert.ok(stands_out(result), `${color} -> ${result}`);
  }
});

test("legible keeps the hue of the colors it moves", () => {
  for (const hue of [0, 60, 120, 200, 280, 330]) {
    const color = hslToRgb(hue, 0.9, 0.5);
    const [moved] = rgbToHsl(legible(color));

    assert.ok(Math.abs(moved - hue) < 4, `hue ${hue} became ${moved}`);
  }
});

test("legible leaves colors that already suit both backgrounds alone", () => {
  const coral: [number, number, number] = [228, 138, 122];
  const gray: [number, number, number] = [119, 119, 119];

  assert.ok(stands_out(gray));
  assert.deepEqual(legible(gray), gray);
  assert.equal(legible(coral) === coral || stands_out(legible(coral)), true);
});
