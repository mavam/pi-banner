import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { COLOR_HELP, DEFAULT_COLOR, PALETTE_NAMES, parsePalette } from "./palette.ts";
import { DEFAULT_SIZE, DEFAULT_THICKNESS } from "./pi3d.ts";

export const MODES = ["plain", "3d"] as const;
export type Mode = (typeof MODES)[number];

/** `auto` shows the key hints unless pi's `quietStartup` hides startup help. */
export const INSTRUCTION_MODES = ["auto", "on", "off"] as const;
export type InstructionsMode = (typeof INSTRUCTION_MODES)[number];

export interface Settings {
  /** `plain` is the digits of π, `3d` the extruded slab. */
  mode: Mode;
  /** A palette name, or hex colors; see `parsePalette`. */
  color: string;
  /** How large the 3D slab is, as a multiple of the default size. */
  size: number;
  /** Depth of the 3D slab in block widths. */
  thickness: number;
  /** Rotation in turns per minute; 0 keeps the slab still. */
  speed: number;
  /** Whether to show pi's key hints under the splash screen. */
  instructions: InstructionsMode;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "3d",
  color: DEFAULT_COLOR,
  size: DEFAULT_SIZE,
  thickness: DEFAULT_THICKNESS,
  speed: 10,
  instructions: "auto",
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
    case "size":
      return inRange(value, SIZE_RANGE)
        ? undefined
        : `size must be between ${SIZE_RANGE[0]} and ${SIZE_RANGE[1]}`;
    case "thickness":
      return inRange(value, THICKNESS_RANGE)
        ? undefined
        : `thickness must be between ${THICKNESS_RANGE[0]} and ${THICKNESS_RANGE[1]}`;
    case "instructions":
      return INSTRUCTION_MODES.includes(value as InstructionsMode)
        ? undefined
        : `instructions must be one of ${INSTRUCTION_MODES.join(", ")}`;
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

export function describeSettings(settings: Settings): string {
  const { mode, color, size, thickness, speed, instructions } = settings;
  return mode === "plain"
    ? `mode plain, color ${color}, instructions ${instructions}`
    : `mode 3d, color ${color}, size ${size}, thickness ${thickness}, speed ${speed}${speed === 0 ? " (still)" : " turns/min"}, instructions ${instructions}`;
}

const USAGE = [
  "/splash [plain|3d]       switch the mode",
  `/splash color <value>    ${COLOR_HELP}`,
  `/splash size <n>         ${SIZE_RANGE[0]}-${SIZE_RANGE[1]} times the default size, 1 is the default`,
  `/splash thickness <n>    ${THICKNESS_RANGE[0]}-${THICKNESS_RANGE[1]} block widths`,
  `/splash speed <n>        ${SPEED_RANGE[0]}-${SPEED_RANGE[1]} turns per minute, 0 keeps the π still`,
  `/splash instructions <v> ${INSTRUCTION_MODES.join(", ")}: key hints under the π; auto hides them if pi's quietStartup is true`,
  "/splash reset            restore the defaults",
].join("\n");

export type CommandResult =
  | { settings: Settings; message: string }
  | { message: string }
  | { error: string };

/** Interpret the arguments of `/splash`. */
export function runCommand(args: string, current: Settings): CommandResult {
  const [first = "", ...rest] = args.trim().split(/\s+/);
  const value = rest.join(" ");

  if (first === "") return { message: `Splash: ${describeSettings(current)}\n${USAGE}` };
  if (first === "reset") {
    return { settings: { ...DEFAULT_SETTINGS }, message: `Splash reset: ${describeSettings(DEFAULT_SETTINGS)}` };
  }

  // `/splash 3d` is short for `/splash mode 3d`.
  const [key, text] = MODES.includes(first as Mode) ? ["mode", first] : [first, value];
  if (!KEYS.includes(key as keyof Settings)) {
    return { error: `Unknown splash option "${first}"\n${USAGE}` };
  }
  if (text === "") return { error: `Missing value for ${key}` };

  const setting = key as keyof Settings;
  const parsed = setting === "size" || setting === "thickness" || setting === "speed" ? Number(text) : text;
  const reason = problem(setting, parsed);
  if (reason) return { error: reason };

  const settings = { ...current, [setting]: parsed };
  return { settings, message: `Splash: ${describeSettings(settings)}` };
}

/** Completions for the whole argument text of `/splash`. */
export function completions(argument: string): { value: string; label: string }[] {
  const text = argument.trimStart();
  const space = text.indexOf(" ");
  const pick = (names: readonly string[], prefix: string, head = "") =>
    names
      .filter((name) => name.startsWith(prefix))
      .map((name) => ({ value: head + name, label: name }));

  if (space === -1) return pick([...MODES, "color", "size", "thickness", "speed", "instructions", "reset"], text);
  const key = text.slice(0, space);
  const prefix = text.slice(space + 1);
  const head = `${key} `;
  if (key === "color") return pick(PALETTE_NAMES, prefix, head);
  if (key === "mode") return pick(MODES, prefix, head);
  if (key === "instructions") return pick(INSTRUCTION_MODES, prefix, head);
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

/** Whether to show the key hints, given the setting and pi's `quietStartup`. */
export function showInstructions(mode: InstructionsMode, quietStartup: boolean): boolean {
  return mode === "on" || (mode === "auto" && !quietStartup);
}
