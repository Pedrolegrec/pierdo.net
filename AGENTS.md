# PierDo Website Instructions

These instructions apply to the whole
`/app/dev/public-presence/pierdo.net` repository.

## Role

This repo owns the static PierDo website for small Android apps, including
app icons, the landing page, styling, and the Kinetic Atlas privacy page.

## Working Rules

- There is no package manager or build step. Edit static HTML, CSS, and image
  assets directly.
- Keep public app names, Play Store links, privacy-policy paths, and social
  links accurate before publishing copy changes.
- Preserve relative paths so the site works from static hosting.
- Optimize image assets before replacing them; do not commit large raw design
  exports unless explicitly requested.

## Boundaries

- Do not add private roadmap notes, analytics credentials, API keys, `.env`
  files, or local hosting artifacts.
- Treat privacy-policy content as public legal copy; avoid casual edits that
  change commitments without user approval.

## Validation

Before reporting changes complete, run:

```bash
git -C /app/dev/public-presence/pierdo.net diff --check
git -C /app/dev/public-presence/pierdo.net status --short
```

For visual changes, also preview the static site in a browser or a local
static server when practical.
