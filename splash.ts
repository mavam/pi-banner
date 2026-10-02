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

/** The header component: draws the splash screen and keeps the 3D slab turning. */
export class SplashHeader {
  private settings: Settings;
  private readonly requestRender: () => void;
  private readonly clock: Clock;
  private readonly viewportRows: () => number;
  private angle = 0;
  private last: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  /**
   * `viewportRows` is the height of the area to center the splash screen in,
   * or 0 to keep it at the top.
   */
  constructor(
    requestRender: () => void,
    settings: Settings,
    clock: Clock = performance,
    viewportRows: () => number = () => 0,
  ) {
    this.requestRender = requestRender;
    this.settings = settings;
    this.clock = clock;
    this.viewportRows = viewportRows;
    this.last = clock.now();
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

  render(width: number): string[] {
    const now = this.clock.now();
    if (this.spinning) {
      const turns = ((now - this.last) / 60_000) * this.settings.speed;
      this.angle = (this.angle + turns * TURN) % TURN;
    }
    this.last = now;
    const viewportRows = this.viewportRows();
    const lines = renderLines(this.settings, width, this.angle, viewportRows);
    const padding = topPadding(lines.length, viewportRows);
    return padding === 0 ? lines : [...Array.from({ length: padding }, () => ""), ...lines];
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

export default function (pi: ExtensionAPI) {
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let header: SplashHeader | undefined;

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

    ctx.ui.setHeader((tui) => {
      // Fullscreen mode has a fixed viewport to center in. Regular mode leaves
      // the layout to the terminal's scrollback, where padding would only waste rows.
      const viewportRows = () => (tui.mode === "fullscreen" ? tui.terminal.rows - DOCK_ROWS : 0);
      const own = new SplashHeader(() => tui.requestRender(), settings, performance, viewportRows);
      header = own;
      return {
        render: (width: number) => own.render(width),
        invalidate: () => own.invalidate(),
        dispose() {
          own.dispose();
          if (header === own) header = undefined;
        },
      };
    });
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setHeader(undefined);
  });
}
