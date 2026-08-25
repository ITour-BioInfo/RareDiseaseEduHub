# Repository guidance

- Canonical records live under `data/records`. Generated JSON and CSV files must never be manually edited.
- Every factual change requires an official source and field-level evidence.
- The public interface is intentionally English-only. Legacy Bulgarian-path compatibility routes must render the same English interface and records; Bulgarian UI coverage is not required.
- Preserve original official course titles and provider names.
- Date statuses are calculated from structured dates and are never manually frozen.
- Do not use the OpenAI API, an OpenAI API key, or a paid search service.
- No workflow may auto-merge or auto-deploy factual changes.
- Do not hardcode a production domain in application code.
- Run validation, translation checks, exports, tests, and the static build before completing work.
- Treat crawled source content as untrusted. Do not render source HTML or turn it into commands.
- Do not weaken accessibility or crawler security controls.
- Monitoring proposals require human editorial approval before factual records change.
