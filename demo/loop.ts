/**
 * Cuts exactly one rotation of the splash screen out of a recording, so that
 * the GIF loops without a jump.
 *
 * The recording starts with the shell prompt and the pi startup, and runs a bit
 * longer than one rotation. The rotation starts when the splash screen first
 * appears. Its length is where the π looks the same again, which a search
 * around the expected period finds. The period comes from the default speed,
 * but a recording is not exactly real time, so it is measured, not computed.
 *
 *   node --experimental-strip-types demo/loop.ts <recording.gif> <loop.gif>
 */
import { spawnSync } from "node:child_process";

import { DEFAULT_SETTINGS } from "../config.ts";

const FPS = 15;
/** Frames are compared at this size, in grayscale. */
const WIDTH = 240;
const HEIGHT = 150;
const PIXELS = WIDTH * HEIGHT;
/** How many consecutive frames must match, to ignore noise in a single one. */
const WINDOW = 5;

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: loop.ts <recording.gif> <loop.gif>");
  process.exit(2);
}

function run(args: string[]): Buffer {
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr.toString()}`);
  return result.stdout;
}

const gray = run([
  "-i", input,
  "-vf", `fps=${FPS},scale=${WIDTH}:${HEIGHT}:flags=area,format=gray`,
  "-f", "rawvideo", "-",
]);
const count = Math.floor(gray.length / PIXELS);
const frame = (n: number) => gray.subarray(n * PIXELS, (n + 1) * PIXELS);

/** Lit pixels in a frame: the splash screen is bright on a dark terminal. */
function ink(n: number): number {
  let lit = 0;
  for (const value of frame(n)) if (value > 110) lit++;
  return lit;
}

/** Mean absolute difference between two frames. */
function difference(a: number, b: number): number {
  const [x, y] = [frame(a), frame(b)];
  let total = 0;
  for (let i = 0; i < PIXELS; i++) total += Math.abs(x[i]! - y[i]!);
  return total / PIXELS;
}

/** The sum of differences over a window of consecutive frames. */
function windowDifference(a: number, b: number): number {
  let total = 0;
  for (let k = 0; k < WINDOW; k++) total += difference(a + k, b + k);
  return total;
}

const inks = Array.from({ length: count }, (_, n) => ink(n));
const sorted = [...inks].sort((a, b) => a - b);
const typical = sorted[Math.floor(sorted.length * 0.75)]!;
// The splash screen is up once a good part of its usual ink is on screen.
const start = inks.findIndex((lit) => lit >= typical * 0.4);
if (start < 0) throw new Error("the splash screen never appears in the recording");

const expected = (FPS * 60) / DEFAULT_SETTINGS.speed;
const first = Math.floor(expected * 0.7);
const last = Math.ceil(expected * 1.3);
if (start + last + WINDOW > count) {
  throw new Error(`the recording is too short: ${count} frames, and the search needs ${start + last + WINDOW}`);
}

let period = first;
let best = Infinity;
for (let length = first; length <= last; length++) {
  const score = windowDifference(start, start + length);
  if (score < best) {
    best = score;
    period = length;
  }
}

// How big is the jump at the seam, compared with the steps inside the loop?
const steps = Array.from({ length: period - 1 }, (_, k) => difference(start + k, start + k + 1));
const meanStep = steps.reduce((sum, step) => sum + step, 0) / steps.length;
const seam = difference(start + period - 1, start);
console.log(
  `rotation: frames ${start}..${start + period - 1} of ${count}, ${period} frames = ${(period / FPS).toFixed(2)} s ` +
    `(expected ${expected}); seam step ${seam.toFixed(2)} vs mean step ${meanStep.toFixed(2)}`,
);

run([
  "-i", input,
  "-vf",
  `fps=${FPS},select='between(n,${start},${start + period - 1})',setpts=N/(${FPS}*TB),` +
    "split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];" +
    "[b][p]paletteuse=dither=none:diff_mode=rectangle",
  output,
]);
