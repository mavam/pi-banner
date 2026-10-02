---
title: Pi Splash package name
type: breaking
authors:
  - mavam
prs:
  - 4
created: 2026-10-02T06:27:39.134754Z
---

Pi Banner is now Pi Splash, a custom startup splash screen for pi with rainbow
π ASCII art. Install it as `pi-splash`. If you installed the old package, replace
it to avoid loading both extensions:

```sh
pi remove npm:pi-banner
pi install npm:pi-splash
```

The splash screen's appearance and behavior are unchanged.
