#!/usr/bin/env bash
# Regenerates demo/splash.gif from demo/splash.tape: one rotation of the
# default splash screen that loops without a jump.
#
# Needs nix, which provides vhs and gifsicle, plus ffmpeg and node on the PATH.
set -euo pipefail

cd "$(dirname "$0")/.."
nix="nix --extra-experimental-features nix-command --extra-experimental-features flakes"
work=$(mktemp -d)
# The throwaway HOME that pi runs with while recording. `pwd -P` resolves
# symlinks such as macOS's /tmp, so that pi can shorten the path to `~`.
DEMO=$(cd "$(mktemp -d)" && pwd -P)
export DEMO
trap 'rm -rf "$work" "$DEMO"' EXIT

# Record the real pi session: a bit more than one rotation.
$nix run nixpkgs#vhs -- demo/splash.tape

# Keep exactly one rotation, so that the GIF loops without a jump.
node --experimental-strip-types demo/loop.ts demo/splash.gif "$work/loop.gif"

# The π changes on every frame, so frame rate and palette decide the size.
$nix run nixpkgs#gifsicle -- -O3 --lossy=120 --colors 64 "$work/loop.gif" -o demo/splash.gif

ls -lh demo/splash.gif
