# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static personal website (no build step, no framework, no package.json) deployed via GitHub Pages at `fran.matorras.com` (see `CNAME`). Plain HTML/CSS/JS, in Spanish. Content: blog-style "boletines" (bulletins), a novel ("Crónica de un huracán"), a card game ("Fran cis coh!"), and a reading list ("Lecturas").

## Running locally

There is no build/test/lint tooling. To preview:
- Open `index.html` directly in a browser, or
- Serve the repo root (e.g. VS Code Live Server — `.vscode/settings.json` sets port 5501, or `python -m http.server 8000`)

After any change, manually check the page in a browser and check the console for 404s — there is no automated verification.

## Site structure and conventions

- `index.html` — homepage, at repo root.
- `style.css` — single global stylesheet for the entire site (root-level CSS variables: `--primary-green`, `--light-green`, `--accent-green`, `--bg-light`, `--text-dark`).
- `script.js` — global behavior included on every page (mobile nav toggle via `.nav-toggle` / `header nav`).
- `global.js` — injects the favicon (`<link>` to `src/bigotes.JPG`); loaded from `/global.js` (absolute path) in every page's `<head>`.
- `projects/` — one HTML page per top-level section (`boletines.html`, `novelas.html`, `franciscoh.html`, `lecturas.html`), each linked from the header nav on every page.
  - `projects/boletines/` — one HTML file per bulletin issue (`boletin-0XX.html`), each embedding a Canva design via `<iframe>`. New issues are added here and then linked as a new `.card` entry in `projects/boletines.html`.
  - `projects/fran-cis-coh/` — card game rules (`reglamento.html`) and card-design showcase pages (`disenhos/`).
  - `projects/data/lecturas.json` + `projects/js/lecturas.js` — the one page with dynamic behavior: `lecturas.html` fetches `/projects/data/lecturas.json` (absolute path) client-side and renders a tabbed, filterable table of books grouped by status (`en_marcha`, `programadas`, `terminadas`, `en_lista`, `canceladas_pausadas`) and, for finished/abandoned books, grouped by month/year added. To add a book, add an entry to `lecturas.json`; no code change needed unless adding a new status.
- `src/` — all images (boletín cover art, card designs, backgrounds), referenced with relative paths from HTML (`../src/...` from `projects/`, `../../src/...` from `projects/boletines/`).

### Path conventions (important, easy to break)

- Page-relative links/assets (`nav` links, `style.css`, images under `src/`) use relative paths (`../`, `../../`) matching the file's depth from repo root.
- Site-wide scripts loaded in `<head>` (`/global.js`) and the `lecturas.json` fetch use **absolute** paths (leading `/`) since they must resolve the same regardless of page depth.
- Every page repeats the same header/nav/footer markup and the `<script src="../script.js">` / `<script src="/global.js">` include — there's no templating, so navigation changes must be hand-applied across every HTML file.

### Adding a new boletín (the most common content update)

1. Add a new `projects/boletines/boletin-0XX.html` (copy an existing one, update title/date and the Canva embed `src`/link).
2. Add a corresponding `.card` block at the top of the list in `projects/boletines.html` linking to it, plus a preview image in `src/boletines/`.

## Notes from repo docs

- `next_steps.md` sketches options for adding content without hand-editing HTML post-deploy (Jekyll, a backend, or a JSON+JS approach). The `lecturas.json` + `lecturas.js` pattern is the JSON+JS approach already implemented for one section; it's the model to follow if extending dynamic content elsewhere (e.g. boletines) rather than introducing a backend.
