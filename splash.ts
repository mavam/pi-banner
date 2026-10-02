import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { PI_ART } from "./art.ts";
import {
  DEFAULT_SETTINGS,
  completions,
  loadSettings,
  runCommand,
  saveSettings,
  type Settings,
} from "./config.ts";
import { compactLines, expandedLines, type Hints } from "./instructions.ts";
import { DEFAULT_PALETTE, parsePalette, type Palette } from "./palette.ts";
import { DEFAULT_POSE, render3dLines } from "./pi3d.ts";

export { PI_ART };

const RESET = "\x1b[0m";
const TURN = Math.PI * 2;
/** Frame interval while the π spins. */
const FRAME_MS = 50;
/** Rows that the editor and footer keep at the bottom of the fullscreen layout. */
const DOCK_ROWS = 6;

function paletteLine(line: string, row: number, palette: Palette): string {
  let result = "";

  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index]!;
    if (ch === " ") {
      result += " ";
      continue;
    }

    const [r, g, b] = palette.at(index, row);
    result += `\x1b[38;2;${r};${g};${b}m${ch}`;
  }

  return result + RESET;
}

export function renderSplashLines(width: number, palette: Palette = DEFAULT_PALETTE): string[] {
  const maxLen = Math.max(...PI_ART.map((line) => line.length));
  const pad = Math.max(0, Math.floor((width - maxLen) / 2));
  const prefix = " ".repeat(pad);
  return [
    "",
    ...PI_ART.map((line, row) => prefix + paletteLine(line, row, palette)),
    "",
  ];
}

/**
 * The splash screen for the settings, with the 3D slab turned by `angle`
 * radians and kept within `maxRows` rows (0 for no limit).
 */
export function renderLines(settings: Settings, width: number, angle = 0, maxRows = 0): string[] {
  const palette = parsePalette(settings.color) ?? DEFAULT_PALETTE;
  if (settings.mode === "plain") return renderSplashLines(width, palette);
  return render3dLines(width, {
    pose: { yaw: DEFAULT_POSE.yaw + angle, pitch: DEFAULT_POSE.pitch },
    size: settings.size,
    maxRows,
    thickness: settings.thickness,
    palette,
  });
}

/** Blank rows that center `height` rows in a viewport of `viewportRows` rows. */
export function topPadding(height: number, viewportRows: number): number {
  return Math.max(0, Math.floor((viewportRows - height) / 2));
}

interface Clock {
  now(): number;
}

export interface SplashHeaderOptions {
  clock?: Clock;
  /**
   * The height of the area to center the splash screen in, or 0 to keep it at
   * the top.
   */
  viewportRows?: () => number;
  /** Pi's key hint formatters; without them no hints are shown. */
  hints?: Hints;
  /** Whether pi's `quietStartup` setting asks for no startup help, which hides the key hints. */
  quiet?: () => boolean;
}

/** The header component: draws the splash screen and keeps the 3D slab turning. */
export class SplashHeader {
  private settings: Settings;
  private readonly requestRender: () => void;
  private readonly clock: Clock;
  private readonly viewportRows: () => number;
  private readonly hints: Hints | undefined;
  private readonly quiet: () => boolean;
  private expanded = false;
  private angle = 0;
  private last: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(requestRender: () => void, settings: Settings, options: SplashHeaderOptions = {}) {
    this.requestRender = requestRender;
    this.settings = settings;
    this.clock = options.clock ?? performance;
    this.viewportRows = options.viewportRows ?? (() => 0);
    this.hints = options.hints;
    this.quiet = options.quiet ?? (() => false);
    this.last = this.clock.now();
    this.sync();
  }

  /** Whether the π is turning, and so being redrawn on a timer. */
  get spinning(): boolean {
    return this.timer !== undefined;
  }

  update(settings: Settings): void {
    this.settings = settings;
    this.angle = 0;
    this.last = this.clock.now();
    this.sync();
    this.requestRender();
  }

  /** Pi calls this when the user collapses or expands tool output, as it does for its own header. */
  setExpanded(expanded: boolean): void {
    if (expanded === this.expanded) return;
    this.expanded = expanded;
    this.requestRender();
  }

  render(width: number): string[] {
    const now = this.clock.now();
    if (this.spinning) {
      const turns = ((now - this.last) / 60_000) * this.settings.speed;
      this.angle = (this.angle + turns * TURN) % TURN;
    }
    this.last = now;

    const hints = this.quiet() ? undefined : this.hints;
    const compact = hints ? compactLines(hints, width) : [];
    const viewportRows = this.viewportRows();
    // The hints take rows from the π, which shrinks to leave them room.
    const room = viewportRows > 0 ? Math.max(1, viewportRows - compact.length) : 0;
    const lines = renderLines(this.settings, width, this.angle, room);
    // Center the π with its compact hints. Expanding the hints then only adds
    // rows below, so the π stays where it is.
    const padding = topPadding(lines.length + compact.length, viewportRows);
    const below = hints && this.expanded ? expandedLines(hints, width) : compact;
    return [...Array.from({ length: padding }, () => ""), ...lines, ...below];
  }

  invalidate(): void {}

  dispose(): void {
    this.stop();
  }

  private sync(): void {
    if (this.settings.mode === "3d" && this.settings.speed > 0) {
      if (!this.timer) {
        this.timer = setInterval(() => this.requestRender(), FRAME_MS);
        this.timer.unref?.();
      }
    } else {
      this.stop();
    }
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

type PiModule = Pick<typeof import("@earendil-works/pi-coding-agent"), "keyHint" | "keyText" | "rawKeyHint">;
type Keybinding = Parameters<PiModule["keyHint"]>[0];

/**
 * Pi's own hint formatters, which follow the user's keybindings and theme.
 * `theme` is pi's live theme, so the hints follow theme changes too. A pi
 * without the formatters gets no hints rather than a broken splash screen.
 */
function piHints(
  pi: Partial<PiModule> | undefined,
  theme: { fg(color: "muted", text: string): string },
): Hints | undefined {
  if (!pi?.keyHint || !pi.rawKeyHint || !pi.keyText) return undefined;
  const { keyHint, rawKeyHint, keyText } = pi;
  return {
    hint: (keybinding, description) => keyHint(keybinding as Keybinding, description),
    raw: (key, description) => rawKeyHint(key, description),
    key: (keybinding) => keyText(keybinding as Keybinding),
    muted: (text) => theme.fg("muted", text),
  };
}

export default function (pi: ExtensionAPI) {
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let header: SplashHeader | undefined;
  // Like pi's own header, the key hints follow `quietStartup` as of the session start.
  let quiet = false;

  pi.registerCommand("splash", {
    description: "Tune the splash screen: mode, color, thickness, and rotation speed",
    getArgumentCompletions: (argument) => {
      const items = completions(argument);
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const result = runCommand(args, settings);
      if ("error" in result) {
        ctx.ui.notify(result.error, "error");
        return;
      }
      if ("settings" in result) {
        settings = result.settings;
        header?.update(settings);
        try {
          saveSettings(settings);
        } catch (error) {
          ctx.ui.notify(`Could not save the splash settings: ${(error as Error).message}`, "warning");
        }
      }
      ctx.ui.notify(result.message, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const loaded = loadSettings();
    settings = loaded.settings;
    if (loaded.warning) ctx.ui.notify(loaded.warning, "warning");
    try {
      quiet = pi.getSettings().quietStartup === true;
    } catch {
      quiet = false; // An older pi cannot report its settings.
    }
    // Pi's formatters are loaded on demand so that the rest of the extension
    // stays free of runtime dependencies. Without them there are no hints.
    const piModule = await import("@earendil-works/pi-coding-agent").catch(() => undefined);

    ctx.ui.setHeader((tui, theme) => {
      // Fullscreen mode has a fixed viewport to center in. Regular mode leaves
      // the layout to the terminal's scrollback, where padding would only waste rows.
      const viewportRows = () => (tui.mode === "fullscreen" ? tui.terminal.rows - DOCK_ROWS : 0);
      const own = new SplashHeader(() => tui.requestRender(), settings, {
        viewportRows,
        hints: piHints(piModule, theme),
        quiet: () => quiet,
      });
      header = own;
      // Not an object literal: pi looks for `setExpanded`, which the header type does not declare.
      const component = {
        render: (width: number) => own.render(width),
        invalidate: () => own.invalidate(),
        setExpanded: (expanded: boolean) => own.setExpanded(expanded),
        dispose() {
          own.dispose();
          if (header === own) header = undefined;
        },
      };
      return component;
    });
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setHeader(undefined);
  });
}
