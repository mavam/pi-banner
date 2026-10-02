# 🌈 pi-splash

A [Pi](https://pi.dev) extension that greets you with a custom splash screen on
startup: rainbow π ASCII art, centered in your terminal.

## 🚀 Installation

```sh
pi install npm:pi-splash
```

If you previously installed `pi-banner`, replace it to avoid loading both
extensions:

```sh
pi remove npm:pi-banner
pi install npm:pi-splash
```

## ✨ Usage

- Greets you with a rainbow π splash screen every time pi starts, a small but
  non-negotiable improvement to your day
- Offers a 3D mode: the π as a lit slab, drawn in braille dots, that can slowly
  turn around
- Restores pi's usual startup screen when you remove or disable the extension,
  no hard feelings

## 🎛️ Tuning

Change the splash screen at any time with `/splash`. Changes apply immediately and are
saved for the next session.

| Command                    | Effect                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| `/splash`                  | Show the current settings                                           |
| `/splash plain` / `3d`     | Switch between the plain digits and the 3D slab                     |
| `/splash color <value>`    | Paint the π: `rainbow`, `pi`, `sunset`, `ocean`, `fire`, `mono`, or hex colors |
| `/splash thickness <n>`    | Depth of the 3D slab, from `0.5` to `20` block widths (default `7`) |
| `/splash speed <n>`        | Turns per minute, from `0` to `60`; `0` keeps the π still (default `0`) |
| `/splash reset`            | Restore the defaults                                                |

Colors can be a preset or hex colors. One hex color paints the whole π, and
several blend along its diagonal:

```text
/splash color #ff8800
/splash color #ff0000,#00ffff
```

The `pi` preset uses the colors of the pi logo. Thickness and speed only
affect the 3D mode; color applies to both modes.

## ⚙️ Configuration

The settings live in `~/.pi/agent/splash.json`, which `/splash` writes for you.
You can also edit it by hand, and pi picks it up on the next session start:

```json
{
  "mode": "3d",
  "color": "sunset",
  "thickness": 10,
  "speed": 6
}
```

Only settings that differ from the defaults are saved. The file is validated
strictly: an unknown key or invalid value falls back to the defaults and shows a
warning.

## 👀 Preview

Ascii art that makes `neofetch` users wish they'd thought of it first:

```text
       3.141592653589793238462643383279
      5028841971693993751058209749445923
     07816406286208998628034825342117067
     9821    48086         5132
    823      06647        09384
   46        09550        58223
             1725         3594
            08128        48111
           74502         84102
          70193          85211        05
        5596446           22948954930381
       9644288             10975665933
```

## 🧹 Uninstall

```sh
pi remove npm:pi-splash
```

## 📄 License

[MIT](LICENSE)
