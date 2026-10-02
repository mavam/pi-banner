---
title: 3D splash screen with tuning options
type: feature
authors:
  - mavam
prs:
  - 3
created: 2026-10-02T07:03:05.452587Z
---

Pi Splash now greets you with a slowly turning 3D π in the colors of the pi logo, centered in your terminal, and you can tune it live with the new `/splash` command. The previous rainbow digits are still available as the `plain` mode.

To get the original look back:

```text
/splash plain
/splash color rainbow
```

- `/splash 3d` or `/splash plain` switches between the 3D slab (the default) and the digits of π.
- `/splash color <value>` paints either mode with a preset (`pi`, `rainbow`, `sunset`, `ocean`, `fire`, `mono`) or hex colors. One hex color paints the whole π, and several, like `#ff0000,#00ffff`, blend along it.
- `/splash thickness <n>` sets the slab depth from `0.5` to `20` block widths. The default is `8`.
- `/splash speed <n>` sets the rotation in turns per minute, from `0` to `60`. The default is `10`, and `0` keeps the π still.
- `/splash reset` restores the defaults, and `/splash` shows the current settings.

In fullscreen mode, the splash screen now sits in the vertical middle of the terminal instead of at the top.

Changes apply immediately and are saved to `~/.pi/agent/splash.json` for the next session. You can also edit the file by hand. An invalid file falls back to the defaults and shows a warning.
