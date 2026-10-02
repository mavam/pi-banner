---
title: Random color scheme on startup
type: feature
authors:
  - mavam
prs:
  - 5
created: 2026-10-02T19:18:48.141474Z
---

Pi Splash can now start every session in a random color scheme. It is off by default, so nothing changes unless you turn it on:

```text
/splash random on
```

Turning it on picks a preset (`pi`, `rainbow`, `sunset`, `ocean`, `fire`, or `mono`) right away, and each new session picks another one. The pick only lasts for the session: your saved color stays untouched, and `/splash random off` brings it back. Choosing a color with `/splash color` ends the random pick for the current session, and `/splash random on` shuffles again.

You can also set `"random": true` in `~/.pi/agent/splash.json`.
