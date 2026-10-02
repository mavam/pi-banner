import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { COLOR_HELP, DEFAULT_COLOR, PALETTE_NAMES, parsePalette, randomPreset } from "./palette.ts";
import { DEFAULT_SIZE, DEFAULT_THICKNESS } from "./pi3d.ts";

export const MODES = ["plain", "3d"] as const;
export type Mode = (typeof MODES)[number];

export interface Settings {
  /** `plain` is the digits of π, `3d` the extruded slab. */
  mode: Mode;
  /** A palette name, or hex colors; see `parsePalette`. */
  color: string;
  /** Start every session with a random preset instead of `color`. */
  random: boolean;
  /** How large the 3D slab is, as a multiple of the default size. */
  size: number;
  /** Depth of the 3D slab in block widths. */
  thickness: number;
  /** Rotation in turns per minute; 0 keeps the slab still. */
  speed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "3d",
  color: DEFAULT_COLOR,
  random: false,
  size: DEFAULT_SIZE,
  thickness: DEFAULT_THICKNESS,
  speed: 10,
};

export const SIZE_RANGE = [0.5, 2] as const;
export const THICKNESS_RANGE = [0.5, 20] as const;
export const SPEED_RANGE = [0, 60] as const;
export const CONFIG_FILE = "splash.json";

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

/** Why a value is invalid for a setting, if it is. */
function problem(key: keyof Settings, value: unknown): string | undefined {
  switch (key) {
    case "mode":
      return MODES.includes(value as Mode) ? undefined : `mode must be one of ${MODES.join(", ")}`;
    case "color":
      return typeof value === "string" && parsePalette(value)
        ? undefined
        : `color must be ${COLOR_HELP}`;
    case "random":
      return typeof value === "boolean" ? undefined : "random must be on or off";
    case "size":
      return inRange(value, SIZE_RANGE)
        ? undefined
        : `size must be between ${SIZE_RANGE[0]} and ${SIZE_RANGE[1]}`;
    case "thickness":
      return inRange(value, THICKNESS_RANGE)
        ? undefined
        : `thickness must be between ${THICKNESS_RANGE[0]} and ${THICKNESS_RANGE[1]}`;
    case "speed":
      return inRange(value, SPEED_RANGE)
        ? undefined
        : `speed must be between ${SPEED_RANGE[0]} and ${SPEED_RANGE[1]} turns per minute`;
  }
}

function inRange(value: unknown, [min, max]: readonly [number, number]): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/** Validate the contents of the config file; unknown keys are rejected. */
export function parseSettings(value: unknown): Settings | string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "expected an object";
  }
  const record = value as Record<string, unknown>;
  const extra = Object.keys(record).filter((key) => !KEYS.includes(key as keyof Settings));
  if (extra.length > 0) return `unknown setting ${extra.map((key) => `"${key}"`).join(", ")}`;

  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const key of KEYS) {
    if (record[key] === undefined) continue;
    const reason = problem(key, record[key]);
    if (reason) return reason;
    (settings as unknown as Record<string, unknown>)[key] = record[key];
  }
  return settings;
}

/**
 * A one-line summary of the settings. `shown` is the random color that the
 * session shows instead of the saved one, if any.
 */
export function describeSettings(settings: Settings, shown?: string): string {
  const { mode, color, random, size, thickness, speed } = settings;
  const paint = shown ? `color ${shown} (random)` : `color ${color}${random ? ", random on" : ""}`;
  return mode === "plain"
    ? `mode plain, ${paint}`
    : `mode 3d, ${paint}, size ${size}, thickness ${thickness}, speed ${speed}${speed === 0 ? " (still)" : " turns/min"}`;
}

/** The settings as the session shows them: with its random color, if it has one. */
export function shownSettings(settings: Settings, shown?: string): Settings {
  return shown ? { ...settings, color: shown } : settings;
}

/** What a change to the settings was about: a setting, `reset`, or the session `start`. */
export type Change = keyof Settings | "reset" | "start";

/**
 * The random color that a session shows after a change, if any. Without the
 * `random` setting there is none. A new session or turning `random` on picks
 * one, which also shuffles again when it is already on. Choosing a `color`
 * ends the random pick for now, and any other change keeps `shown`.
 */
export function sessionColor(
  settings: Settings,
  change: Change,
  shown?: string,
  pick: () => string = randomPreset,
): string | undefined {
  if (!settings.random) return undefined;
  if (change === "start" || change === "random") return pick();
  return change === "color" ? undefined : shown;
}

const USAGE = [
  "/splash [plain|3d]       switch the mode",
  `/splash color <value>    ${COLOR_HELP}`,
  "/splash random on|off   start every session with a random color scheme",
  `/splash size <n>         ${SIZE_RANGE[0]}-${SIZE_RANGE[1]} times the default size, 1 is the default`,
  `/splash thickness <n>    ${THICKNESS_RANGE[0]}-${THICKNESS_RANGE[1]} block widths`,
  `/splash speed <n>        ${SPEED_RANGE[0]}-${SPEED_RANGE[1]} turns per minute, 0 keeps the π still`,
  "/splash reset            restore the defaults",
].join("\n");

export type CommandResult =
  | { settings: Settings; shown: string | undefined; message: string }
  | { message: string }
  | { error: string };

/**
 * Interpret the arguments of `/splash`. `shown` is the random color that the
 * session shows, and the result says which one it shows after the command.
 */
export function runCommand(
  args: string,
  current: Settings,
  shown?: string,
  pick?: () => string,
): CommandResult {
  const [first = "", ...rest] = args.trim().split(/\s+/);
  const value = rest.join(" ");

  if (first === "") return { message: `Splash: ${describeSettings(current, shown)}\n${USAGE}` };
  if (first === "reset") {
    return {
      settings: { ...DEFAULT_SETTINGS },
      shown: undefined,
      message: `Splash reset: ${describeSettings(DEFAULT_SETTINGS)}`,
    };
  }

  // `/splash 3d` is short for `/splash mode 3d`.
  const [key, text] = MODES.includes(first as Mode) ? ["mode", first] : [first, value];
  if (!KEYS.includes(key as keyof Settings)) {
    return { error: `Unknown splash option "${first}"\n${USAGE}` };
  }
  if (text === "") return { error: `Missing value for ${key}` };

  const setting = key as keyof Settings;
  const parsed = parseValue(setting, text);
  const reason = problem(setting, parsed);
  if (reason) return { error: reason };

  const settings = { ...current, [setting]: parsed };
  const next = sessionColor(settings, setting, shown, pick);
  return { settings, shown: next, message: `Splash: ${describeSettings(settings, next)}` };
}

/** The value that the text of a command stands for; invalid text stays as it is. */
function parseValue(setting: keyof Settings, text: string): unknown {
  switch (setting) {
    case "size":
    case "thickness":
    case "speed":
      return Number(text);
    case "random": {
      const word = text.toLowerCase();
      return word === "on" || word === "true" ? true : word === "off" || word === "false" ? false : text;
    }
    default:
      return text;
  }
}

/** Completions for the whole argument text of `/splash`. */
export function completions(argument: string): { value: string; label: string }[] {
  const text = argument.trimStart();
  const space = text.indexOf(" ");
  const pick = (names: readonly string[], prefix: string, head = "") =>
    names
      .filter((name) => name.startsWith(prefix))
      .map((name) => ({ value: head + name, label: name }));

  if (space === -1) return pick([...MODES, "color", "random", "size", "thickness", "speed", "reset"], text);
  const key = text.slice(0, space);
  const prefix = text.slice(space + 1);
  const head = `${key} `;
  if (key === "color") return pick(PALETTE_NAMES, prefix, head);
  if (key === "mode") return pick(MODES, prefix, head);
  if (key === "random") return pick(["on", "off"], prefix, head);
  if (key === "size") return pick(["0.6", "0.8", "1", "1.4", "2"], prefix, head);
  if (key === "thickness") return pick(["2", "4", "7", "10", "14"], prefix, head);
  if (key === "speed") return pick(["0", "3", "6", "12", "24"], prefix, head);
  return [];
}

export function getConfigPath(agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent")): string {
  return join(agentDir, CONFIG_FILE);
}

/** Read the config file; a missing file means defaults, an invalid one warns. */
export function loadSettings(path = getConfigPath()): { settings: Settings; warning?: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { settings: { ...DEFAULT_SETTINGS } };
    return { settings: { ...DEFAULT_SETTINGS }, warning: `Cannot read ${path}: ${(error as Error).message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { settings: { ...DEFAULT_SETTINGS }, warning: `Invalid ${path}: ${(error as Error).message}` };
  }
  const settings = parseSettings(parsed);
  if (typeof settings === "string") {
    return { settings: { ...DEFAULT_SETTINGS }, warning: `Invalid ${path}: ${settings}` };
  }
  return { settings };
}

/** Write the settings that differ from the defaults. */
export function saveSettings(settings: Settings, path = getConfigPath()): void {
  const changed = Object.fromEntries(KEYS.filter((key) => settings[key] !== DEFAULT_SETTINGS[key]).map((key) => [key, settings[key]]));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(changed, null, 2)}\n`);
}
