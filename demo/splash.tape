# The README demos: one rotation of each symbol. Run `demo/record.sh` from
# anywhere to regenerate and compress demo/splash.gif and demo/logo.gif. It
# sets DEMO to a configured throwaway HOME and removes it afterwards.
#
# pi runs with DEMO as its HOME and a dummy API key, so the recording shows
# neither personal skills, paths, nor a provider. Nothing is ever sent to it.
#
# The recording runs a little longer than one rotation. demo/loop.ts then cuts
# exactly one rotation out of it, so the GIF loops without a jump.

# demo/record.sh supplies the output path with vhs -o.

Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 14
Set Width 560
Set Height 400
Set Padding 12
Set Framerate 15
Set TypingSpeed 50ms
Set Theme "Catppuccin Mocha"

Hide
Type `export SPLASH="$PWD/splash.ts" HOME="$DEMO" PI_CODING_AGENT_DIR="$DEMO/.pi/agent" OPENAI_API_KEY=sk-demo PS1='$ '` Enter
Type `alias pi='pi --no-extensions -e "$SPLASH" --no-session --offline --no-skills --no-context-files --no-prompt-templates --no-themes'` Enter
Type `cd "$DEMO/project" && clear` Enter
Show

Type "pi"
Enter
Wait+Screen@20s /commands/
Sleep 10s
