# The README demo. Run `demo/record.sh` from anywhere to regenerate and compress
# demo/splash.gif; it sets DEMO to a throwaway directory and removes it afterwards.
#
# pi runs with DEMO as its HOME and a dummy API key, so the recording shows
# neither personal skills, paths, nor a provider. Nothing is ever sent to it.

Output demo/splash.gif

Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 14
Set Width 720
Set Height 540
Set Padding 12
Set Framerate 15
Set TypingSpeed 50ms
Set Theme "Catppuccin Mocha"

Hide
Type `mkdir -p $DEMO/.pi/agent $DEMO/project` Enter
Type `echo '{ "theme": "dark", "quietStartup": "header" }' > $DEMO/.pi/agent/settings.json` Enter
Type `export SPLASH=$PWD/splash.ts HOME=$DEMO OPENAI_API_KEY=sk-demo PS1='$ '` Enter
Type `alias pi="pi --no-extensions -e $SPLASH --no-session"` Enter
Type `cd $DEMO/project && clear` Enter
Show

Type "pi"
Enter
Wait+Screen@20s /commands/
Sleep 4s

# The trailing space closes pi's completion menu, so Enter submits the command.
Type "/splash color sunset "
Enter
Sleep 2500ms

Type "/splash plain "
Enter
Sleep 2s

Type "/splash 3d "
Enter
Sleep 2500ms
