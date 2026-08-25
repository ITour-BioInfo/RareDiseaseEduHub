# Architecture

## Boundaries

`data/records` is the factual source of truth. `data/locales` contains locale content and translation review metadata. `src` renders and enhances the site. `automation` reads untrusted official pages and emits proposals. `public` contains deterministic exports. `dist` is disposable static output.

The status engine consumes structured dates and never writes status back into canonical data. Browser enhancement receives only schedule fields needed for recalculation. All URLs are derived from Astro's configured site and base path.

## Runtime

There is no application runtime after build. HTML, CSS, bundled JavaScript, data downloads, sitemap, robots file, manifest, and social preview are conventional static files. JavaScript-disabled visitors receive the complete record list and detail pages.

## Decisions

See `docs/architecture/0001-static-portable-architecture.md`. `.openai/hosting.json` was absent and no Sites project identifier was created.
