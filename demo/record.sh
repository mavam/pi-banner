#!/usr/bin/env bash
# Regenerates the README's side-by-side demos: the mathematical π in ocean
# colors and the Pi logo in its original colors, each looping for one turn.
#
# Needs nix, which provides vhs and gifsicle, plus ffmpeg and node on the PATH.
set -euo pipefail

cd "$(dirname "$0")/.."
nix="nix --extra-experimental-features nix-command --extra-experimental-features flakes"
work=$(mktemp -d)
# Resolve macOS's /tmp symlink so pi can shorten the throwaway HOME to `~`.
work=$(cd "$work" && pwd -P)
trap 'rm -rf "$work"' EXIT

for symbol in pi logo; do
  export DEMO="$work/home-$symbol"
  mkdir -p "$DEMO/.pi/agent" "$DEMO/project"
  printf '%s\n' '{ "theme": "dark", "quietStartup": "header", "tuiMode": "fullscreen" }' \
    > "$DEMO/.pi/agent/settings.json"
  if [[ "$symbol" == pi ]]; then
    color=ocean
    output=demo/splash.gif
  else
    color=pi
    output=demo/logo.gif
  fi
  printf '{ "symbol": "%s", "color": "%s" }\n' "$symbol" "$color" \
    > "$DEMO/.pi/agent/splash.json"

  # Record the real pi session: a bit more than one rotation.
  $nix run nixpkgs#vhs -- demo/splash.tape -o "$work/recording.gif"

  # Keep exactly one rotation, so that the GIF loops without a jump.
  node --experimental-strip-types demo/loop.ts "$work/recording.gif" "$work/loop.gif"

  # The shape changes on every frame, so frame rate and palette decide the size.
  $nix run nixpkgs#gifsicle -- -O3 --lossy=120 --colors 64 "$work/loop.gif" -o "$output"
done

ls -lh demo/splash.gif demo/logo.gif
