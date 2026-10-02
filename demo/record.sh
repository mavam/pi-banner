#!/usr/bin/env bash
# Regenerates demo/splash.gif from demo/splash.tape and compresses it.
#
# Needs nix, which provides vhs and gifsicle, and ffmpeg on the PATH.
set -euo pipefail

cd "$(dirname "$0")/.."
nix="nix --extra-experimental-features nix-command --extra-experimental-features flakes"
work=$(mktemp -d)
# The throwaway HOME that pi runs with while recording. `pwd -P` resolves
# symlinks such as macOS's /tmp, so that pi can shorten the path to `~`.
DEMO=$(cd "$(mktemp -d)" && pwd -P)
export DEMO
trap 'rm -rf "$work" "$DEMO"' EXIT

# Record the real pi session; the tape sets up a throwaway HOME for it.
$nix run nixpkgs#vhs -- demo/splash.tape

# The π changes on every frame, so frame rate and palette decide the size.
ffmpeg -y -v error -i demo/splash.gif \
  -vf "fps=15,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  "$work/resampled.gif"
$nix run nixpkgs#gifsicle -- -O3 --lossy=120 --colors 64 "$work/resampled.gif" -o demo/splash.gif

ls -lh demo/splash.gif
