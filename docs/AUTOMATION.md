# Catalogue automation

GitHub Actions scans configured official provider listings every morning for new course, webinar, workshop, programme, and training links. Individual course pages and archive pages are monitored as known records but are not mined as discovery indexes. The scanner removes navigation, template, category, language, download, quiz, and generic-title links before comparing normalized URLs, titles, providers, and edition years with the canonical catalogue.

Every remaining candidate is fetched from its exact approved official URL. A proposal requires a meaningful detail-page title, course or learning evidence, rare-disease or clinical-genetics relevance, and either current structured dates or credible evergreen availability. Login pages, missing pages, unrelated subject indexes, and events more than 180 days old are rejected. Unchanged accepted or rejected candidates are remembered in the compact operational state so they do not return on every run.

The evening priority run revisits known resources with a confirmed date in the next 60 days. It compares each normalized official page with the previous successful snapshot and creates a human-review proposal when structured titles or dates—or the page content itself—change. A manual run can check one known record. Scheduled checks never add, merge, publish, or remove a factual record automatically.

The fetcher allows only HTTP(S), resolves destinations before each request, blocks private and metadata addresses, revalidates redirects, limits response size and redirects, applies timeouts and bounded retry, identifies itself, and supports conditional request metadata. Source HTML remains untrusted plain input.

New links and changed content produce short, field-level evidence proposals. Ambiguous years, conflicting official sources, substantial title/provider changes, archive-only evidence, edition ambiguity, and changes affecting more than ten percent of records require manual review. One failed request cannot archive a record. A run with more than 20 proposals is report-only: the workflow uploads its evidence but does not create or update a pull request.

Operational state belongs only on the orphan `automation-state` branch. Each scheduled run restores that snapshot before checking sources, merges the selected results into it, and then persists the complete state with safe force-with-lease replacement. Reviewable changes use `automation/catalog-updates` and one draft pull request. No workflow approves, merges, or deploys.
