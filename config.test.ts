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
  sessionColor,
  shownSettings,
  type Settings,
} from "./config.ts";

function change(args: string, current: Settings = DEFAULT_SETTINGS): Settings {
  const result = runCommand(args, current);
  assert.ok("settings" in result, `"${args}": ${JSON.stringify(result)}`);
  return result.settings;
}

/** Run a command in a session that shows `shown` and picks `pick` when it shuffles. */
function session(args: string, current: Settings, shown?: string, pick = "ocean") {
  const result = runCommand(args, current, shown, () => pick);
  assert.ok("settings" in result, `"${args}": ${JSON.stringify(result)}`);
  return result;
}

function fails(args: string): string {
  const result = runCommand(args, DEFAULT_SETTINGS);
  assert.ok("error" in result, `"${args}" should fail`);
  return result.error;
}

test("the defaults are a slowly turning 3D π in the pi logo colors", () => {
  assert.deepEqual(DEFAULT_SETTINGS, { mode: "3d", color: "pi", random: false, size: 1, thickness: 8, speed: 10 });
});

test("/splash without arguments describes the settings and changes nothing", () => {
  const result = runCommand("", DEFAULT_SETTINGS);

  assert.ok(!("settings" in result) && "message" in result);
  assert.match(result.message, /mode 3d/);
  assert.match(result.message, /\/splash speed/);
});

test("/splash switches the mode, with or without the mode keyword", () => {
  assert.equal(change("3d").mode, "3d");
  assert.equal(change("mode 3d").mode, "3d");
  assert.equal(change("plain").mode, "plain");
  assert.equal(change("3d", { ...DEFAULT_SETTINGS, mode: "plain" }).mode, "3d");
});

test("/splash color accepts presets and hex colors", () => {
  assert.equal(change("color sunset").color, "sunset");
  assert.equal(change("color #ff0000,#0000ff").color, "#ff0000,#0000ff");
  assert.equal(change("color #ff0000, #0000ff").color, "#ff0000, #0000ff");
  assert.match(fails("color nope"), /color must be/);
});

test("/splash size is a multiple of the default size within a range", () => {
  assert.equal(change("size 1.5").size, 1.5);
  assert.equal(change("size 0.5").size, 0.5);
  assert.equal(change("size 2").size, 2);
  assert.match(fails("size 0.4"), /size must be between 0.5 and 2/);
  assert.match(fails("size 2.1"), /size must be between 0.5 and 2/);
  assert.match(fails("size large"), /size must be/);
  assert.match(fails("size"), /Missing value for size/);
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
  const tuned = { mode: "plain" as const, color: "fire", random: true, size: 1.6, thickness: 3, speed: 9 };

  assert.deepEqual(change("reset", tuned), DEFAULT_SETTINGS);
});

test("/splash never mutates the current settings", () => {
  const current = { ...DEFAULT_SETTINGS };
  change("3d", current);

  assert.deepEqual(current, DEFAULT_SETTINGS);
});

test("/splash random turns the random color scheme on and off", () => {
  assert.equal(change("random on").random, true);
  assert.equal(change("random true").random, true);
  assert.equal(change("random OFF", { ...DEFAULT_SETTINGS, random: true }).random, false);
  assert.equal(change("random false", { ...DEFAULT_SETTINGS, random: true }).random, false);
  assert.match(fails("random maybe"), /random must be on or off/);
  assert.match(fails("random"), /Missing value for random/);
});

test("turning random on picks a color right away and says so", () => {
  const result = session("random on", DEFAULT_SETTINGS);

  assert.equal(result.shown, "ocean");
  assert.match(result.message, /color ocean \(random\)/);
  // The saved color stays what it was; only the session shows the pick.
  assert.equal(result.settings.color, "pi");
});

test("random on shuffles again, and off returns to the saved color", () => {
  const on = { ...DEFAULT_SETTINGS, random: true };

  assert.equal(session("random on", on, "fire", "mono").shown, "mono");
  const off = session("random off", on, "fire");
  assert.equal(off.shown, undefined);
  assert.match(off.message, /color pi(?!.*random)/);
});

test("choosing a color or resetting ends the random pick, other changes keep it", () => {
  const on = { ...DEFAULT_SETTINGS, random: true };

  // Even the saved color counts: typing it asks to see it.
  assert.equal(session("color pi", on, "fire").shown, undefined);
  assert.match(session("color sunset", on, "fire").message, /color sunset, random on/);
  assert.equal(session("reset", on, "fire").shown, undefined);
  assert.equal(session("size 1.5", on, "fire").shown, "fire");
  assert.match(session("speed 6", on, "fire").message, /color fire \(random\)/);
  assert.equal(session("plain", on, "fire").shown, "fire");
});

test("/splash shows the random pick and changes nothing", () => {
  const on = { ...DEFAULT_SETTINGS, random: true };
  const result = runCommand("", on, "fire");

  assert.ok(!("settings" in result) && "message" in result);
  assert.match(result.message, /color fire \(random\)/);
  assert.match(result.message, /\/splash random on\|off/);
});

test("a session picks a random color only with the random setting", () => {
  const on = { ...DEFAULT_SETTINGS, random: true };

  assert.equal(sessionColor(on, "start", undefined, () => "fire"), "fire");
  assert.equal(sessionColor(DEFAULT_SETTINGS, "start", undefined, () => "fire"), undefined);
  assert.equal(sessionColor(DEFAULT_SETTINGS, "random", "fire", () => "mono"), undefined);
});

test("the settings as shown carry the random color without changing the saved ones", () => {
  const on = { ...DEFAULT_SETTINGS, random: true };

  assert.deepEqual(shownSettings(on, "fire"), { ...on, color: "fire" });
  assert.equal(shownSettings(on), on);
  assert.equal(on.color, "pi");
});

test("completions cover options and values", () => {
  assert.deepEqual(
    completions("").map((item) => item.label),
    ["plain", "3d", "color", "random", "size", "thickness", "speed", "reset"],
  );
  assert.deepEqual(completions("th"), [{ value: "thickness", label: "thickness" }]);
  assert.deepEqual(completions("si"), [{ value: "size", label: "size" }]);
  assert.ok(completions("size ").some((item) => item.value === "size 1"));
  assert.deepEqual(completions("color su"), [{ value: "color sunset", label: "sunset" }]);
  assert.ok(completions("speed ").some((item) => item.value === "speed 0"));
  assert.deepEqual(completions("ra"), [{ value: "random", label: "random" }]);
  assert.deepEqual(
    completions("random ").map((item) => item.value),
    ["random on", "random off"],
  );
  assert.deepEqual(completions("reset "), []);
});

test("parseSettings fills in defaults and validates strictly", () => {
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings({ speed: 6, mode: "3d" }), { ...DEFAULT_SETTINGS, speed: 6, mode: "3d" });
  assert.equal(typeof parseSettings({ sparkle: true }), "string");
  assert.match(parseSettings({ sparkle: true }) as string, /unknown setting "sparkle"/);
  assert.match(parseSettings({ speed: "6" }) as string, /speed must be/);
  // The key hints follow pi's own `quietStartup`, so they have no setting here.
  assert.match(parseSettings({ instructions: "off" }) as string, /unknown setting "instructions"/);
  assert.match(parseSettings({ size: 3 }) as string, /size must be between 0.5 and 2/);
  assert.deepEqual(parseSettings({ size: 1.5 }), { ...DEFAULT_SETTINGS, size: 1.5 });
  assert.match(parseSettings({ mode: "4d" }) as string, /mode must be/);
  assert.match(parseSettings({ color: "nope" }) as string, /color must be/);
  assert.equal(parseSettings([]), "expected an object");
  assert.equal(parseSettings(null), "expected an object");
});

test("the random setting is saved only when on, and must be a boolean", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-splash-"));
  const path = join(dir, "splash.json");
  const on = { ...DEFAULT_SETTINGS, random: true };

  saveSettings(on, path);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { random: true });
  assert.deepEqual(loadSettings(path), { settings: on });

  assert.deepEqual(parseSettings({ random: false }), DEFAULT_SETTINGS);
  assert.match(parseSettings({ random: "on" }) as string, /random must be on or off/);
});

test("settings are saved without the defaults and load back", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-splash-"));
  const path = getConfigPath(dir);
  assert.equal(path, join(dir, "splash.json"));
  assert.deepEqual(loadSettings(path), { settings: DEFAULT_SETTINGS });

  const tuned = { ...DEFAULT_SETTINGS, mode: "plain" as const, speed: 6 };
  saveSettings(tuned, path);

  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { mode: "plain", speed: 6 });
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
