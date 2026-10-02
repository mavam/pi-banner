Pi Splash now greets you with the rotating Pi logo in its original colors, with the mathematical π available as an alternative. You can also start each session with a randomly chosen color scheme.

## 🚀 Features

### Pi logo symbol option

Pi Splash now greets you with the rotating Pi pixel logo from its 1.0 Easter egg by default, in the original coral, blue, and yellow colors.

The logo works in both the rotating `3d` mode and the flat `plain` mode. Your color, size, thickness, and speed settings still apply.

Choose the mathematical π instead with:

```text
/splash symbol pi
```

Use `/splash symbol logo` to return to the logo, or `/splash reset` to restore all defaults. The choice applies immediately and is saved for future sessions. Settings without `symbol` now use the Pi logo; explicitly saved symbol choices stay selected.

*By @mavam in #6.*

### Random color scheme on startup

Pi Splash can now start every session in a random color scheme. It is off by default, so nothing changes unless you turn it on:

```text
/splash random on
```

Turning it on picks a preset (`pi`, `rainbow`, `sunset`, `ocean`, `fire`, or `mono`) right away, and each new session picks another one. The pick only lasts for the session: your saved color stays untouched, and `/splash random off` brings it back. Choosing a color with `/splash color` ends the random pick for the current session, and `/splash random on` shuffles again.

You can also set `"random": true` in `~/.pi/agent/splash.json`.

*By @mavam in #5.*
