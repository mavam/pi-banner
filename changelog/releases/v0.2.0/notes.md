Pi Splash, formerly Pi Banner, now greets you with a slowly turning 3D π in the pi logo colors, and you tune it live with the new /splash command. The rainbow digits remain available as the plain mode.

## 💥 Breaking changes

### Pi Splash package name

Pi Banner is now Pi Splash, a custom startup splash screen for pi with rainbow π ASCII art. Install it as `pi-splash`. If you installed the old package, replace it to avoid loading both extensions:

```sh
pi remove npm:pi-banner
pi install npm:pi-splash
```

The splash screen's appearance and behavior are unchanged.

*By @mavam in #4.*

## 🚀 Features

### 3D splash screen with tuning options

Pi Splash now greets you with a slowly turning 3D π in the colors of the pi logo, centered in your terminal, and you can tune it live with the new `/splash` command. The previous rainbow digits are still available as the `plain` mode.

To get the original look back:

```text
/splash plain
/splash color rainbow
```

- `/splash 3d` or `/splash plain` switches between the 3D slab (the default) and the digits of π.
- `/splash color <value>` paints either mode with a preset (`pi`, `rainbow`, `sunset`, `ocean`, `fire`, `mono`) or hex colors. One hex color paints the whole π, and several, like `#ff0000,#00ffff`, blend along it.
- `/splash size <n>` scales the 3D π from `0.5` to `2` times its default size. The default is `1`, and the π shrinks to fit a narrow or short terminal.
- `/splash thickness <n>` sets the slab depth from `0.5` to `20` block widths. The default is `8`.
- `/splash speed <n>` sets the rotation in turns per minute, from `0` to `60`. The default is `10`, and `0` keeps the π still.
- `/splash reset` restores the defaults, and `/splash` shows the current settings.

In fullscreen mode, the splash screen sits in the vertical middle of the terminal instead of at the top.

Under the π, the splash screen also shows the key hints from pi's own startup header that are specific to pi, such as `/` for commands and `!` for bash. They use your keybindings and theme colors, and `ctrl+o` expands them into a longer list, as in pi's header. Like that header, they follow pi's `quietStartup` setting: set it to `true` to hide them.

Changes apply immediately and are saved to `~/.pi/agent/splash.json` for the next session. You can also edit the file by hand. An invalid file falls back to the defaults and shows a warning.

*By @mavam in #3.*
