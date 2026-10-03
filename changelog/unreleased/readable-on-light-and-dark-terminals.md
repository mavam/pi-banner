---
title: Readable on light and dark terminals
type: bugfix
authors:
  - mavam
prs:
  - 7
created: 2026-10-03T05:48:34.690538Z
---

The splash screen now stays readable on both light and dark terminals. Since it cannot know your terminal's background, it moves every color into a mid-tone range that stands out from both. This applies to every color scheme, including your own hex colors, in both the `3d` and `plain` modes.

The 3D shading now only darkens a color instead of adding highlights, so a face turned toward the light no longer washes out into a pale tint. The Pi logo keeps its coral and blue, and its yellow turns a deeper gold.
