/**
 * The key hints from pi's startup header that are worth saying, laid out under
 * the splash screen. Keys that every terminal user knows, such as `esc` to
 * interrupt or `ctrl+c` to exit, are left out. Pi's own formatters produce the
 * hints, so they carry the user's keybindings and theme colors; this module
 * only arranges them.
 */

const RESET = "\x1b[0m";
/** SGR and other CSI sequences, and OSC sequences such as hyperlinks. */
const ESCAPES = /\x1b\[[0-9;:]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** What the hints need from pi. */
export interface Hints {
  /** A hint for a keybinding, such as `esc interrupt`. */
  hint(keybinding: string, description: string): string;
  /** A hint for a literal key, such as `/ commands`. */
  raw(key: string, description: string): string;
  /** The keys bound to a keybinding, such as `esc`. */
  key(keybinding: string): string;
  /** Colors the separator between hints. */
  muted(text: string): string;
}

/** The columns that text takes up, ignoring escape sequences. */
export function visibleWidth(text: string): number {
  return [...text.replace(ESCAPES, "")].length;
}

/** Cut text to at most `width` columns, keeping its escape sequences intact. */
export function fit(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;

  let result = "";
  let columns = 0;
  for (const match of text.matchAll(new RegExp(`${ESCAPES.source}|([\\s\\S])`, "gu"))) {
    if (match[1] === undefined) {
      result += match[0];
    } else if (columns < width) {
      result += match[1];
      columns++;
    }
  }
  return result + RESET;
}

function center(text: string, width: number): string {
  return " ".repeat(Math.max(0, Math.floor((width - visibleWidth(text)) / 2))) + text;
}

/** The hints on the collapsed line. */
function compactHints(h: Hints): string[] {
  return [
    h.raw("/", "commands"),
    h.raw("!", "bash"),
    h.hint("app.tools.expand", "more"),
  ];
}

/** The hints in the expanded list, one per line, in the order that pi shows them. */
function expandedHints(h: Hints): string[] {
  return [
    h.hint("app.thinking.cycle", "to cycle thinking level"),
    h.raw(`${h.key("app.model.cycleForward")}/${h.key("app.model.cycleBackward")}`, "to cycle models"),
    h.hint("app.model.select", "to select model"),
    h.hint("app.tools.expand", "to expand tools"),
    h.hint("app.thinking.toggle", "to expand thinking"),
    h.hint("app.editor.external", "for external editor"),
    h.raw("/", "for commands"),
    h.raw("!", "to run bash"),
    h.raw("!!", "to run bash (no context)"),
    h.hint("app.message.followUp", "to queue follow-up"),
    h.hint("app.message.dequeue", "to edit all queued messages"),
    h.hint("app.clipboard.pasteImage", "to paste files on macOS, images, or text"),
    h.raw("drop files", "to attach"),
  ];
}

/** The compact hints on as few centered lines as fit in `width`. */
export function compactLines(h: Hints, width: number): string[] {
  if (width <= 0) return [];
  const separator = h.muted(" · ");
  const separatorWidth = visibleWidth(separator);

  const lines: string[][] = [[]];
  let used = 0;
  for (const item of compactHints(h)) {
    const current = lines[lines.length - 1]!;
    const itemWidth = visibleWidth(item);
    if (current.length > 0 && used + separatorWidth + itemWidth > width) {
      lines.push([item]);
      used = itemWidth;
    } else {
      used += (current.length > 0 ? separatorWidth : 0) + itemWidth;
      current.push(item);
    }
  }
  return lines.map((items) => center(fit(items.join(separator), width), width));
}

/** The expanded hints, one per line, centered as one block. */
export function expandedLines(h: Hints, width: number): string[] {
  if (width <= 0) return [];
  const items = expandedHints(h).map((item) => fit(item, width));
  const pad = Math.max(0, Math.floor((width - Math.max(...items.map(visibleWidth))) / 2));
  return items.map((item) => " ".repeat(pad) + item);
}
