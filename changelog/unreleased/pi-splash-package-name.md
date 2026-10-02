---
title: Pi Splash package name
type: breaking
authors:
  - mavam
prs:
  - 4
created: 2026-10-02T06:23:41.574244Z
---

Pi Banner is now Pi Splash and installs as `pi-splash`. If you installed the old
package, replace it to avoid loading both extensions:

```sh
pi remove npm:pi-banner
pi install npm:pi-splash
```

The rainbow π header and its behavior are unchanged.
