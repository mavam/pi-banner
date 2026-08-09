# pi-banner

`pi-banner` is a pi extension that replaces the default header with a rainbow π
ASCII art banner.

## Setup

Install Lefthook once per clone:

```bash
uvx lefthook install
```

Pushing runs the quality gates automatically. You don't need to run checks
manually.

## Development

When you change user-facing behavior, configuration, defaults, or dependencies,
update `README.md` in the same change.

## Release engineering

- Use `tenzir-ship` for changelog management and releasing.
- Add changelog entries for user-facing changes.
- Before releasing, ensure `main` is in sync with `origin/main`.
- To release, dispatch `.github/workflows/release.yaml` with a title and
  introduction.
