# 0001 — Static, portable architecture

Status: accepted, 25 August 2026.

The repository was empty. The source public site was a generated single-page artefact and the downloadable catalogue contained 180 flat records. A maintainable migration was therefore required.

We selected Astro in static output mode, strict TypeScript, pnpm, Zod, Vitest, Playwright, and native `Intl`. Canonical records, resource translations, generated exports, monitoring state, and presentation are separated. The deployment contract is only `dist/` plus configurable `SITE_URL` and `BASE_PATH`.

Consequences: the site works without a runtime server, JavaScript is optional for initial content, status computation is shared and time-aware, factual automation is review-only, and hosting can change without rewriting the catalogue. The cost is a larger static build because every resource has two detail pages.
