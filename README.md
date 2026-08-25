# Rare Disease Education Hub

A bilingual, portable static catalogue of rare-disease education resources. Bulgarian is the default language; English is available under `/en/`. The site renders every record into HTML, then enhances search and filtering in the browser.

## What is included

- 180 migrated canonical records under `data/records/`, with separate Bulgarian and English locale records.
- Astro static output under `dist/`; no runtime server, database, authentication, paid search service, or OpenAI API key.
- Structured dates and one shared TypeScript status engine for the build, browser, exports, and tests.
- JSON and CSV exports at their established filenames.
- Responsible official-source monitoring that creates evidence proposals rather than silently changing facts.
- CI, scheduled monitoring, publication bundles, browser tests, and WCAG-oriented automated checks.

## Local development

Use Node.js 22 and the pinned pnpm release:

```text
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Copy `.env.example` only when environment overrides are required. Development defaults are safe and use `http://localhost:4321`, `/`, and `Europe/Sofia`.

## Quality commands

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm catalog:validate
pnpm translations:validate
pnpm catalog:export
pnpm test
pnpm test:crawler
pnpm build
pnpm test:browser
pnpm test:a11y
pnpm monitor:dry-run
```

Generated exports must not be edited. Change a canonical record or locale record, record official-source evidence, run the export command, and include the regenerated files in the pull request.

## Publication

No workflow deploys the site. After review and merge, download the `rare-disease-education-hub-publication-bundle` artifact and follow `docs/PUBLISHING.md`. Hosting adapters are deliberately replaceable.

## Editorial warning

This catalogue is informational. Always verify dates, eligibility, cost, registration, and application information with the linked official provider. Machine-produced Bulgarian content remains a draft until a person reviews it.
