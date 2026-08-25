# Catalogue automation

GitHub Actions checks known official URLs and configured provider listings. It does not perform unrestricted web search and never calls OpenAI. Broader discovery belongs to the separate human-reviewed Work process.

The fetcher allows only HTTP(S), resolves destinations before each request, blocks private and metadata addresses, revalidates redirects, limits response size and redirects, applies timeouts and bounded retry, identifies itself, and supports conditional request metadata. Source HTML remains untrusted plain input.

Changed content produces short, field-level evidence proposals. Ambiguous years, conflicting official sources, substantial title/provider changes, archive-only evidence, edition ambiguity, and changes affecting more than ten percent of records require manual review. One failed request cannot archive a record.

Operational state belongs only on the orphan `automation-state` branch. A scheduled run uses one concurrency group and safe force-with-lease replacement. Reviewable changes use `automation/catalog-updates` and one draft pull request. No workflow approves, merges, or deploys.
