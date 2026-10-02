---
title: 3D splash screen with tuning options
type: feature
authors:
  - mavam
prs:
  - 3
created: 2026-10-02T06:53:21.000079Z
---

Pi Splash can now draw the π as a lit 3D slab that slowly turns, and you can tune it live with the new `/splash` command. The classic digits splash screen is still the default and is now called `plain`.

```text
/splash 3d
/splash color sunset
/splash thickness 10
/splash speed 6
```

- `/splash plain` or `/splash 3d` switches between the digits and the 3D slab.
- `/splash color <value>` paints either mode with a preset (`rainbow`, `pi`, `sunset`, `ocean`, `fire`, `mono`) or hex colors. One hex color paints the whole π, and several, like `#ff0000,#00ffff`, blend along it.
- `/splash thickness <n>` sets the slab depth from `0.5` to `20` block widths.
- `/splash speed <n>` sets the rotation in turns per minute, from `0` to `60`. The default `0` keeps the π still.
- `/splash reset` restores the defaults, and `/splash` shows the current settings.

Changes apply immediately and are saved to `~/.pi/agent/splash.json` for the next session. You can also edit the file by hand. An invalid file falls back to the defaults and shows a warning.
