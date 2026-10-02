import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  completions,
  getConfigPath,
  loadSettings,
  parseSettings,
  runCommand,
  saveSettings,
  type Settings,
} from "./config.ts";

function change(args: string, current: Settings = DEFAULT_SETTINGS): Settings {
  const result = runCommand(args, current);
  assert.ok("settings" in result, `"${args}": ${JSON.stringify(result)}`);
  return result.settings;
}

function fails(args: string): string {
  const result = runCommand(args, DEFAULT_SETTINGS);
  assert.ok("error" in result, `"${args}" should fail`);
  return result.error;
}

test("the defaults keep today's plain rainbow", () => {
  assert.deepEqual(DEFAULT_SETTINGS, { mode: "plain", color: "rainbow", thickness: 7, speed: 0 });
});

test("/splash without arguments describes the settings and changes nothing", () => {
  const result = runCommand("", DEFAULT_SETTINGS);

  assert.ok(!("settings" in result) && "message" in result);
  assert.match(result.message, /mode plain/);
  assert.match(result.message, /\/splash speed/);
});

test("/splash switches the mode, with or without the mode keyword", () => {
  assert.equal(change("3d").mode, "3d");
  assert.equal(change("mode 3d").mode, "3d");
  assert.equal(change("plain", { ...DEFAULT_SETTINGS, mode: "3d" }).mode, "plain");
});

test("/splash color accepts presets and hex colors", () => {
  assert.equal(change("color sunset").color, "sunset");
  assert.equal(change("color #ff0000,#0000ff").color, "#ff0000,#0000ff");
  assert.equal(change("color #ff0000, #0000ff").color, "#ff0000, #0000ff");
  assert.match(fails("color nope"), /color must be/);
});

test("/splash thickness is limited to a sensible range", () => {
  assert.equal(change("thickness 12").thickness, 12);
  assert.equal(change("thickness 0.5").thickness, 0.5);
  assert.match(fails("thickness 0"), /between 0.5 and 20/);
  assert.match(fails("thickness 21"), /between 0.5 and 20/);
  assert.match(fails("thickness thick"), /thickness must be/);
});

test("/splash speed 0 turns the rotation off", () => {
  assert.equal(change("speed 0", { ...DEFAULT_SETTINGS, speed: 12 }).speed, 0);
  assert.equal(change("speed 6").speed, 6);
  assert.match(fails("speed -1"), /between 0 and 60/);
  assert.match(fails("speed 61"), /between 0 and 60/);
  assert.match(fails("speed fast"), /speed must be/);
});

test("/splash rejects missing values and unknown options", () => {
  assert.match(fails("speed"), /Missing value for speed/);
  assert.match(fails("sparkle 3"), /Unknown splash option "sparkle"/);
});

test("/splash reset restores the defaults", () => {
  const tuned = { mode: "3d" as const, color: "fire", thickness: 3, speed: 9 };

  assert.deepEqual(change("reset", tuned), DEFAULT_SETTINGS);
});

test("/splash never mutates the current settings", () => {
  const current = { ...DEFAULT_SETTINGS };
  change("3d", current);

  assert.deepEqual(current, DEFAULT_SETTINGS);
});

test("completions cover options and values", () => {
  assert.deepEqual(
    completions("").map((item) => item.label),
    ["plain", "3d", "color", "thickness", "speed", "reset"],
  );
  assert.deepEqual(completions("th"), [{ value: "thickness", label: "thickness" }]);
  assert.deepEqual(completions("color su"), [{ value: "color sunset", label: "sunset" }]);
  assert.ok(completions("speed ").some((item) => item.value === "speed 0"));
  assert.deepEqual(completions("reset "), []);
});

test("parseSettings fills in defaults and validates strictly", () => {
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings({ speed: 6, mode: "3d" }), { ...DEFAULT_SETTINGS, speed: 6, mode: "3d" });
  assert.equal(typeof parseSettings({ sparkle: true }), "string");
  assert.match(parseSettings({ sparkle: true }) as string, /unknown setting "sparkle"/);
  assert.match(parseSettings({ speed: "6" }) as string, /speed must be/);
  assert.match(parseSettings({ mode: "4d" }) as string, /mode must be/);
  assert.match(parseSettings({ color: "nope" }) as string, /color must be/);
  assert.equal(parseSettings([]), "expected an object");
  assert.equal(parseSettings(null), "expected an object");
});

test("settings are saved without the defaults and load back", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-splash-"));
  const path = getConfigPath(dir);
  assert.equal(path, join(dir, "splash.json"));
  assert.deepEqual(loadSettings(path), { settings: DEFAULT_SETTINGS });

  const tuned = { ...DEFAULT_SETTINGS, mode: "3d" as const, speed: 6 };
  saveSettings(tuned, path);

  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { mode: "3d", speed: 6 });
  assert.deepEqual(loadSettings(path), { settings: tuned });

  saveSettings(DEFAULT_SETTINGS, path);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {});
});

test("a broken config file falls back to the defaults with a warning", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-splash-"));
  const path = join(dir, "splash.json");

  writeFileSync(path, "{ nope");
  let loaded = loadSettings(path);
  assert.deepEqual(loaded.settings, DEFAULT_SETTINGS);
  assert.match(loaded.warning ?? "", /Invalid .*splash\.json/);

  writeFileSync(path, JSON.stringify({ speed: 100 }));
  loaded = loadSettings(path);
  assert.deepEqual(loaded.settings, DEFAULT_SETTINGS);
  assert.match(loaded.warning ?? "", /speed must be between 0 and 60/);
});
